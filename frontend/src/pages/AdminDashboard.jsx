import { useState, useEffect, useRef } from 'react';
import { PackagePlus, RefreshCcw, AlertTriangle, Users, Truck, Pause, Play, MapPin, CheckCircle, ShieldAlert, Clock, ScanLine } from 'lucide-react';
import { io } from 'socket.io-client';
import { Html5Qrcode } from 'html5-qrcode';

const socket = io('http://localhost:5000');

const POPULAR_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune",
  "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore",
  "Bhopal", "Visakhapatnam", "Pimpri", "Patna", "Vadodara", "Ghaziabad",
  "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi",
  "Srinagar", "Aurangabad", "Dhanbad", "Amritsar", "Allahabad", "Ranchi",
  "Howrah", "Coimbatore", "Gwalior", "Jabalpur", "Vijayawada", "Jodhpur", "Madurai"
];

const INCIDENT_TYPES = [
  { label: "Vehicle Accident", icon: "🚗", severity: "Critical" },
  { label: "Package Damaged", icon: "📦", severity: "High" },
  { label: "Heavy Rain / Flood", icon: "🌧️", severity: "High" },
  { label: "Road Blocked", icon: "🚧", severity: "Medium" },
  { label: "Theft Attempt", icon: "🚨", severity: "Critical" },
  { label: "Delay – Traffic", icon: "🚦", severity: "Low" },
];

export default function AdminDashboard() {
  const [shipments, setShipments] = useState([]);
  const [users, setUsers] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [source, setSource] = useState('Mumbai');
  const [destination, setDestination] = useState('Chennai');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [customPkgId, setCustomPkgId] = useState('');
  const [activeTab, setActiveTab] = useState('shipments');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const [cameraStarted, setCameraStarted] = useState(false);
  const scannerRef = useRef(null);

  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.stop()
        .then(() => { scannerRef.current?.clear(); scannerRef.current = null; })
        .catch(() => { scannerRef.current = null; });
    }
    setCameraStarted(false);
  };

  useEffect(() => {
    if (!cameraStarted) return;
    let cancelled = false;

    const initScanner = async () => {
      try {
        const scanner = new Html5Qrcode('admin-qr-reader');
        if (cancelled) return;
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (cancelled) return;
            stopCamera();
            handleScannedQR(decodedText);
          },
          () => {} // ignore
        );
      } catch (err) {
        console.error('Admin Camera start error:', err);
        if (!cancelled) setCameraStarted(false);
      }
    };

    initScanner();
    return () => { cancelled = true; };
  }, [cameraStarted]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
        } catch (_) {}
      }
    };
  }, []);

  const handleScannedQR = (decodedText) => {
    try {
      const payload = JSON.parse(decodedText);
      if (payload.id) setCustomPkgId(payload.id.toUpperCase());
      if (payload.email) setOwnerEmail(payload.email);
      if (payload.source) setSource(payload.source);
      if (payload.destination) setDestination(payload.destination);
      setCreateMsg("✅ QR Payload loaded successfully! ID, Email, and route parameters auto-populated.");
    } catch (e) {
      setCustomPkgId(decodedText.trim().toUpperCase());
      setCreateMsg("✅ QR Code scanned: Package ID auto-populated.");
    }
  };


  const fetchShipments = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/shipments');
      const data = await res.json();
      setShipments(data);
    } catch {}
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/users');
      const data = await res.json();
      setUsers(data);
    } catch {}
  };

  const fetchConflicts = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/conflicts');
      const data = await res.json();
      setConflicts(data);
    } catch {}
  };

  useEffect(() => {
    fetchShipments();
    fetchUsers();
    fetchConflicts();
    const interval = setInterval(() => { fetchShipments(); fetchConflicts(); }, 8000);

    socket.on('shipment-update', () => fetchShipments());
    socket.on('conflict-detected', () => fetchConflicts());
    return () => {
      clearInterval(interval);
      socket.off('shipment-update');
      socket.off('conflict-detected');
    };
  }, []);

  const handleCreateShipment = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg('');
    try {
      const res = await fetch('http://localhost:5000/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customPkgId || undefined,
          source,
          destination,
          owner_email: ownerEmail || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreateMsg(`✅ ${data.id} created! Route is being calculated via OpenStreetMap...`);
      setCustomPkgId('');
      setOwnerEmail('');
      setTimeout(fetchShipments, 3000);
    } catch (err) {
      setCreateMsg(`❌ Error: ${err.message}`);
    }
    setCreating(false);
  };

  const forceIncident = async (shipmentId) => {
    const idx = parseInt(prompt(
      INCIDENT_TYPES.map((t, i) => `${i + 1}. ${t.icon} ${t.label}`).join('\n') + '\n\nEnter number:',
      '1'
    )) - 1;
    if (isNaN(idx) || idx < 0 || idx >= INCIDENT_TYPES.length) return;
    const chosen = INCIDENT_TYPES[idx];
    await fetch('http://localhost:5000/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_id: shipmentId, issue: chosen.label, severity: chosen.severity })
    });
    fetchShipments();
  };

  const controlSim = async (shipmentId, action) => {
    await fetch(`http://localhost:5000/api/shipments/${shipmentId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    fetchShipments();
  };

  const resolveIncident = async (incidentId, shipmentId) => {
    await fetch(`http://localhost:5000/api/incidents/${incidentId}/resolve`, { method: 'POST' });
    fetchShipments();
  };

  const resolveConflict = async (conflictId, action) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    await fetch(`http://localhost:5000/api/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved_by: user.name || 'Admin', action })
    });
    fetchConflicts();
    fetchShipments();
  };

  const deleteUser = async (userId) => {
    if (!confirm("Remove this user?")) return;
    await fetch(`http://localhost:5000/api/users/${userId}`, { method: 'DELETE' });
    fetchUsers();
  };

  const deliveryAgents = users.filter(u => u.role === 'DELIVERY');
  const customers = users.filter(u => u.role === 'CUSTOMER');

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Admin Control Center</h2>
          <p className="text-slate-500 mt-1">Real-time shipment management & simulation engine.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { fetchShipments(); fetchUsers(); }} className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
            <RefreshCcw size={20} />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Shipments", value: shipments.length, color: "bg-blue-50 text-blue-700", icon: <Truck size={24} /> },
          { label: "In Transit", value: shipments.filter(s => s.status === 'In Transit').length, color: "bg-orange-50 text-orange-700", icon: <MapPin size={24} /> },
          { label: "Awaiting Handover", value: shipments.filter(s => s.status === 'Awaiting Handover').length, color: "bg-amber-50 text-amber-700", icon: <Truck size={24} /> },
          { label: "Issues Active", value: shipments.filter(s => s.status === 'Issue').length, color: "bg-red-50 text-red-700", icon: <AlertTriangle size={24} /> },
        ].map(stat => (
          <div key={stat.label} className={`p-5 rounded-2xl ${stat.color} flex items-center gap-4`}>
            <div className="opacity-60">{stat.icon}</div>
            <div>
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 flex-wrap">
        {['shipments', 'create', 'agents', 'customers', 'conflicts'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 font-semibold capitalize rounded-t-lg transition-colors ${activeTab === tab ? 'bg-white border border-b-white -mb-px text-blue-600 border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'agents' ? '🚚 Agents' :
             tab === 'customers' ? '👤 Customers' :
             tab === 'create' ? '➕ Create Shipment' :
             tab === 'conflicts' ? `⚠️ Conflicts ${conflicts.filter(c => c.status === 'Active').length > 0 ? `(${conflicts.filter(c => c.status === 'Active').length})` : ''}` :
             '📦 Shipments'}
          </button>
        ))}
      </div>

      {/* TAB: Create Shipment */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
              <PackagePlus className="text-blue-500" />
              Create Package
            </h3>
            <form onSubmit={handleCreateShipment} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Custom Package ID <span className="text-slate-400">(optional)</span></label>
                  <button
                    type="button"
                    onClick={() => setCameraStarted(!cameraStarted)}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors border border-blue-100"
                  >
                    <ScanLine size={13} /> {cameraStarted ? "Close Camera" : "Scan Manufacturer QR"}
                  </button>
                </div>

                {/* Admin camera view container */}
                <div
                  id="admin-qr-reader"
                  className={`w-full rounded-xl overflow-hidden border border-slate-200 mb-3 ${cameraStarted ? 'block' : 'hidden'}`}
                />

                <input type="text" placeholder="e.g. MYPKG001" value={customPkgId} onChange={e => setCustomPkgId(e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Email <span className="text-slate-400">(optional)</span></label>
                <input type="email" placeholder="customer@email.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source City</label>
                <select value={source} onChange={e => setSource(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {POPULAR_CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Destination City</label>
                <select value={destination} onChange={e => setDestination(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {POPULAR_CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" disabled={creating || source === destination}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {creating ? 'Planning Route via OpenStreetMap...' : '🗺️ Initialize Shipment with Real Route'}
              </button>
            </form>
            {createMsg && <p className="mt-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border">{createMsg}</p>}
          </div>

          <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-700 mb-4">How the Route Simulation Works</h3>
            <div className="space-y-4 text-slate-600">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">1</div>
                <div><p className="font-semibold text-slate-800">Geocode via Nominatim API</p><p className="text-sm">The source & destination city names are sent to OpenStreetMap's Nominatim API to obtain exact GPS coordinates.</p></div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">2</div>
                <div><p className="font-semibold text-slate-800">Route via OSRM API</p><p className="text-sm">The Open Source Routing Machine calculates the actual driving route (highway, distance, 2610+ GPS points).</p></div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">3</div>
                <div><p className="font-semibold text-slate-800">Auto-generate Transit Hubs</p><p className="text-sm">3 intermediate checkpoints are placed at equal intervals along the real highway path and saved to the database.</p></div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">4</div>
                <div><p className="font-semibold text-slate-800">Assign Delivery Agents</p><p className="text-sm">Registered delivery agents are randomly assigned to each hub. Unmatched hubs get a random network agent.</p></div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">5</div>
                <div><p className="font-semibold text-slate-800">Handover States</p><p className="text-sm">At each hub the package goes: <strong>Arrived</strong> → <strong>Awaiting Agent Scan</strong> → <strong>Agent Accepts</strong> → <strong>In Transit</strong>. Customers see all of these live.</p></div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold shrink-0">6</div>
                <div><p className="font-semibold text-slate-800">Simulation ticks every 8 seconds</p><p className="text-sm">The engine advances the package state and broadcasts Socket.io events to all connected customers and admin dashboards.</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Shipments */}
      {activeTab === 'shipments' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-700 mb-6">All Shipments</h3>
          <div className="space-y-4">
            {shipments.map(s => (
              <div key={s.id} className="p-4 border border-slate-200 rounded-xl">
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded text-sm">{s.id}</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        s.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                        s.status === 'Issue' ? 'bg-red-100 text-red-700' :
                        s.status === 'Awaiting Handover' ? 'bg-amber-100 text-amber-700' :
                        s.status === 'In Transit' ? 'bg-blue-100 text-blue-700' :
                        s.status === 'Created' ? 'bg-slate-100 text-slate-600' :
                        'bg-orange-100 text-orange-700'
                      }`}>{s.status === 'Awaiting Handover' ? '⏳ Awaiting Handover' : s.status}</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        s.simulation_state === 'ACTIVE' ? 'bg-blue-100 text-blue-700' :
                        s.simulation_state === 'FINISHED' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
                      }`}>SIM: {s.simulation_state}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{s.source} → {s.destination} {s.owner_email && `• ${s.owner_email}`}</p>
                    <p className="text-xs text-slate-400 mt-1">Created: {new Date(s.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a href={`/customer/${s.id}`} target="_blank" rel="noreferrer"
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium">
                      🗺️ Live Map
                    </a>
                    {s.simulation_state === 'ACTIVE' && s.status !== 'Delivered' && (
                      <button onClick={() => controlSim(s.id, 'PAUSE')}
                        className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 text-sm font-medium flex items-center gap-1">
                        <Pause size={14} /> Pause
                      </button>
                    )}
                    {s.simulation_state === 'PAUSED' && (
                      <button onClick={() => controlSim(s.id, 'RESUME')}
                        className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-sm font-medium flex items-center gap-1">
                        <Play size={14} /> Resume
                      </button>
                    )}
                    {s.status !== 'Delivered' && s.status !== 'Issue' && (
                      <button onClick={() => forceIncident(s.id)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium flex items-center gap-1">
                        <AlertTriangle size={14} /> Incident
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {shipments.length === 0 && <p className="text-slate-500 text-center py-12">No shipments yet. Go to "Create Shipment" tab!</p>}
          </div>
        </div>
      )}

      {/* TAB: Delivery Agents */}
      {activeTab === 'agents' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
            <Truck className="text-blue-500" /> Registered Delivery Agents
          </h3>
          {deliveryAgents.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p>No delivery agents registered yet.</p>
              <p className="text-sm mt-1">Ask agents to register via the <strong>Register</strong> page and select "Delivery Partner".</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deliveryAgents.map(agent => (
              <div key={agent.id} className="p-4 border border-slate-200 rounded-xl flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xl font-bold shrink-0">
                  {agent.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{agent.name}</p>
                  <p className="text-sm text-slate-500">{agent.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">
                    Hub: {agent.hub || 'Unassigned'}
                  </span>
                </div>
                <button onClick={() => deleteUser(agent.id)} className="text-slate-300 hover:text-red-500 transition-colors text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Customers */}
      {activeTab === 'customers' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
            <Users className="text-blue-500" /> Registered Customers
          </h3>
          {customers.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p>No customers registered yet.</p>
            </div>
          )}
          <div className="space-y-3">
            {customers.map(customer => {
              const customerShipments = shipments.filter(s => s.owner_email === customer.email);
              return (
                <div key={customer.id} className="p-4 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-bold shrink-0">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{customer.name}</p>
                      <p className="text-sm text-slate-500">{customer.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="bg-slate-100 px-3 py-1 rounded-lg font-medium">{customerShipments.length} package(s)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* TAB: Conflicts */}
      {activeTab === 'conflicts' && (
        <div className="space-y-6">
          {/* Conflict Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Active Conflicts', value: conflicts.filter(c => c.status === 'Active').length, color: 'bg-red-50 text-red-700 border-red-200' },
              { label: 'Resolved', value: conflicts.filter(c => c.status === 'Resolved').length, color: 'bg-green-50 text-green-700 border-green-200' },
              { label: 'Dismissed', value: conflicts.filter(c => c.status === 'Dismissed').length, color: 'bg-slate-50 text-slate-600 border-slate-200' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-2xl border ${s.color} text-center`}>
                <p className="text-3xl font-bold">{s.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Conflict List */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
              <ShieldAlert className="text-red-500" /> Conflict Log
            </h3>
            {conflicts.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <ShieldAlert size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No conflicts detected</p>
                <p className="text-sm">All scans are clean. Conflicts appear here in real-time when detected.</p>
              </div>
            )}
            <div className="space-y-4">
              {conflicts.map(conflict => (
                <div key={conflict.id} className={`p-5 rounded-xl border ${
                  conflict.status === 'Active' ? 'border-red-200 bg-red-50' :
                  conflict.status === 'Resolved' ? 'border-green-200 bg-green-50' :
                  'border-slate-200 bg-slate-50'
                }`}>
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                          conflict.severity === 'Critical' ? 'bg-red-600 text-white' :
                          conflict.severity === 'High' ? 'bg-orange-500 text-white' :
                          conflict.severity === 'Medium' ? 'bg-yellow-500 text-white' :
                          'bg-slate-400 text-white'
                        }`}>{conflict.severity}</span>
                        <span className="px-2 py-0.5 bg-white text-slate-600 border border-slate-200 rounded text-xs font-mono font-bold">
                          {conflict.type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {conflict.shipment_id}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          conflict.status === 'Active' ? 'bg-red-100 text-red-700' :
                          conflict.status === 'Resolved' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{conflict.status}</span>
                      </div>
                      <p className="text-sm text-slate-700">{conflict.description}</p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Clock size={11} /> Detected: {new Date(conflict.detected_at).toLocaleString()}
                        {conflict.resolved_at && ` • Resolved: ${new Date(conflict.resolved_at).toLocaleString()} by ${conflict.resolved_by}`}
                      </p>
                    </div>

                    {conflict.status === 'Active' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => resolveConflict(conflict.id, 'RESOLVE')}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-xs font-bold"
                        >
                          ✓ Resolve
                        </button>
                        <button
                          onClick={() => resolveConflict(conflict.id, 'DISMISS')}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition text-xs font-bold"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
