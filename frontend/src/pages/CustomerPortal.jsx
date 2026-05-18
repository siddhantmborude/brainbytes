import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import {
  Search, MapPin, Truck, AlertCircle, User,
  CheckCircle2, CircleDashed, Clock, Loader, Bell, Package
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const socket = io('http://localhost:5000');

function MapBoundsHelper({ coords }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (coords && coords.length > 0 && !fitted.current) {
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
      fitted.current = true;
    }
  }, [coords, map]);
  return null;
}

// ─── Status Config ───────────────────────────────────────────────
const STAGE_STATUS = {
  Completed: {
    dot: 'bg-green-500 border-green-500',
    line: 'border-green-300',
    icon: <CheckCircle2 size={11} />,
    iconColor: 'text-green-600',
    badge: null,
  },
  Active: {
    dot: 'bg-blue-500 border-blue-500 animate-pulse',
    line: 'border-blue-400',
    icon: <Truck size={11} />,
    iconColor: 'text-blue-600',
    badge: <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">▶ In Transit</span>,
  },
  Waiting: {
    dot: 'bg-amber-400 border-amber-400 animate-pulse',
    line: 'border-amber-200',
    icon: <Loader size={11} className="animate-spin" />,
    iconColor: 'text-amber-600',
    badge: <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⏳ Agent Scanning…</span>,
  },
  Arrived: {
    dot: 'bg-orange-400 border-orange-400 animate-pulse',
    line: 'border-orange-200',
    icon: <Bell size={11} />,
    iconColor: 'text-orange-600',
    badge: <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">📦 Package Arrived – Awaiting Scan</span>,
  },
  Pending: {
    dot: 'bg-slate-200 border-slate-300',
    line: 'border-slate-200',
    icon: <CircleDashed size={11} />,
    iconColor: 'text-slate-400',
    badge: null,
  },
};

const SHIPMENT_STATUS_BANNER = {
  'In Transit':        { bg: 'bg-blue-50 border-blue-200 text-blue-700',  icon: '🚛', label: 'In Transit' },
  'Awaiting Handover': { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: '⏳', label: 'Awaiting Agent Handover' },
  'Issue':             { bg: 'bg-red-50 border-red-200 text-red-700',      icon: '⚠️', label: 'Issue Reported' },
  'Delivered':         { bg: 'bg-green-50 border-green-200 text-green-700', icon: '✅', label: 'Delivered' },
  'Created':           { bg: 'bg-slate-50 border-slate-200 text-slate-600', icon: '📋', label: 'Created' },
};

export default function CustomerPortal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState(id || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveMsg, setLiveMsg] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchTracking = async (searchId) => {
    if (!searchId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`http://localhost:5000/api/shipments/${searchId}`);
      if (!res.ok) throw new Error('Tracking ID not found');
      const json = await res.json();
      if (json.shipment.owner_email && json.shipment.owner_email !== user.email && user.role === 'CUSTOMER') {
        throw new Error('You do not have permission to view this shipment');
      }
      setData(json);
      if (searchId !== id) navigate(`/customer/${searchId}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setData(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) fetchTracking(id);

    const handleUpdate = (payload) => {
      setData(prev => {
        if (!prev || prev.shipment.id !== payload.shipment.id) return prev;
        // Compute live message
        const chain = payload.shipment.chain;
        const arrived = chain.find(c => c.status === 'Arrived');
        const waiting = chain.find(c => c.status === 'Waiting');
        const active = chain.find(c => c.status === 'Active');

        if (payload.shipment.status === 'Delivered') {
          setLiveMsg('✅ Your package has been delivered!');
        } else if (arrived) {
          setLiveMsg(`📦 Package arrived at ${arrived.stage}. Waiting for delivery agent to scan and accept.`);
        } else if (waiting) {
          setLiveMsg(`🔄 Agent is scanning the package at ${waiting.stage}…`);
        } else if (active) {
          setLiveMsg(`🚛 Package is in transit at ${active.stage}.`);
        }
        return payload;
      });
    };

    socket.on('shipment-update', handleUpdate);
    return () => socket.off('shipment-update', handleUpdate);
  }, [id, user.email, user.role]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchTracking(trackingId);
  };

  // Map helpers
  let routePath = [];
  if (data?.shipment?.route_data) {
    try {
      const parsed = JSON.parse(data.shipment.route_data);
      routePath = parsed.map(pt => [pt[1], pt[0]]);
    } catch (_) {}
  }

  const stageCoords = data?.shipment?.chain?.filter(c => c.lat && c.lng).map(c => [c.lat, c.lng]) || [];
  const boundsCoords = routePath.length > 0 ? routePath : stageCoords;

  const activeOrArrived = data?.shipment?.chain?.find(
    c => c.status === 'Active' || c.status === 'Arrived' || c.status === 'Waiting'
  );
  const mapCenter = activeOrArrived?.lat
    ? [activeOrArrived.lat, activeOrArrived.lng]
    : [20.5937, 78.9629]; // India centre

  const statusCfg = SHIPMENT_STATUS_BANNER[data?.shipment?.status] || SHIPMENT_STATUS_BANNER['Created'];

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Enter Tracking ID (e.g. PKG123456)"
            value={trackingId}
            onChange={e => setTrackingId(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono tracking-wider text-sm"
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm">
          Track
        </button>
      </form>

      {loading && <p className="text-center text-slate-500 py-6">Fetching from database…</p>}
      {error && <p className="text-center text-red-500 py-6 bg-red-50 rounded-xl border border-red-100">{error}</p>}

      {data && data.shipment && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── LEFT PANEL ─────────────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-5">

            {/* Status Card */}
            <div className={`p-5 rounded-2xl border ${statusCfg.bg}`}>
              <div className="flex justify-between items-start mb-3">
                <h2 className="text-2xl font-bold font-mono">{data.shipment.id}</h2>
                <span className="text-2xl">{statusCfg.icon}</span>
              </div>
              <p className="font-bold text-lg">{statusCfg.label}</p>
              <p className="flex items-center gap-1 mt-1 text-sm opacity-80"><MapPin size={14} />{data.shipment.source} → {data.shipment.destination}</p>
            </div>

            {/* Confidence Score Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-700 text-sm">Chain Confidence Score</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  data.shipment.confidence_score >= 80 ? 'bg-green-100 text-green-700' :
                  data.shipment.confidence_score >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {data.shipment.confidence_score >= 80 ? 'High Trust' :
                   data.shipment.confidence_score >= 50 ? 'Medium Trust' : 'Low Trust'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="28" cy="28" r="24" stroke="#f1f5f9" strokeWidth="5" fill="transparent" />
                    <circle cx="28" cy="28" r="24" stroke={
                      data.shipment.confidence_score >= 80 ? '#22c55e' :
                      data.shipment.confidence_score >= 50 ? '#f59e0b' : '#ef4444'
                    } strokeWidth="5" fill="transparent"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 * (1 - (data.shipment.confidence_score || 100) / 100)} />
                  </svg>
                  <span className="absolute font-mono font-bold text-slate-800 text-sm">{data.shipment.confidence_score || 100}%</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {data.shipment.confidence_score >= 80 ? 'Perfect custody transitions with authenticated QR code handovers.' :
                     data.shipment.confidence_score >= 50 ? 'Minor delays or hub conflicts detected but resolved successfully.' :
                     'High volume of handoff conflicts or active incidents reported in this chain.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Proof of Package */}
            {data.shipment.status === 'Delivered' && data.shipment.proof_of_delivery && (() => {
              try {
                const pod = JSON.parse(data.shipment.proof_of_delivery);
                return (
                  <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg border border-slate-800 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-blue-400">Secure Delivery Certificate</p>
                        <h4 className="font-bold text-base tracking-tight mt-0.5">📦 Proof of Package</h4>
                      </div>
                      <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                        {pod.status || "VERIFIED"}
                      </span>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3 space-y-2.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Method</span>
                        <span className="font-semibold text-slate-200">{pod.verification_method}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Delivered At</span>
                        <span className="font-semibold text-slate-200">{new Date(pod.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Coordinates</span>
                        <span className="font-mono text-slate-200">{pod.final_coordinates?.lat.toFixed(4)}, {pod.final_coordinates?.lng.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Delivering Courier</span>
                        <span className="font-semibold text-slate-200">{pod.agent_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Verification ID</span>
                        <span className="font-mono text-blue-300">{pod.signature_token}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-4 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Customer Digital Signature</p>
                      <p className="font-serif italic text-xl text-blue-300 py-1 font-semibold tracking-wider select-none">
                        {pod.agent_name.split(' ')[0]} Verified
                      </p>
                      <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto mt-1"></div>
                    </div>
                  </div>
                );
              } catch (_) { return null; }
            })()}

            {/* Live Update Banner */}
            {liveMsg && (
              <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-sm text-blue-800 text-sm flex items-start gap-2">
                <Bell size={16} className="shrink-0 mt-0.5" />
                <span>{liveMsg}</span>
              </div>
            )}

            {/* Active Incidents */}
            {data.shipment.incidents.filter(i => i.status === 'Active').map(inc => (
              <div key={inc.id} className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700">
                <p className="font-bold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Issue Reported</p>
                <p className="text-sm mt-1">{inc.issue} <span className="font-bold">({inc.severity})</span></p>
                <p className="text-xs text-red-500 mt-0.5">Reported: {new Date(inc.createdAt).toLocaleString()}</p>
              </div>
            ))}

            {/* ─── Full Chain Timeline ──────────────────────────── */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-5 text-base">Logistics Chain</h3>
              <div className="space-y-5">
                {data.shipment.chain.map((link) => {
                  const cfg = STAGE_STATUS[link.status] || STAGE_STATUS.Pending;
                  const handler = data.handlers[link.handler_id];
                  return (
                    <div key={link.id} className={`relative pl-7 border-l-2 ${cfg.line} last:border-transparent pb-1`}>
                      {/* dot */}
                      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${cfg.dot} ${cfg.iconColor}`}>
                        {cfg.icon}
                      </div>

                      <div>
                        <p className={`font-semibold text-sm ${link.status === 'Pending' ? 'text-slate-400' : 'text-slate-800'} flex flex-wrap items-center gap-1`}>
                          {link.stage} {cfg.badge}
                        </p>

                        {/* Arrived: show waiting message */}
                        {link.status === 'Arrived' && (
                          <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700">
                            <p className="font-semibold">📦 Package reached hub</p>
                            <p>Waiting for <strong>{handler?.name || 'delivery agent'}</strong> to scan and accept the package.</p>
                            {link.arrived_at && <p className="text-orange-500 mt-0.5">Arrived: {new Date(link.arrived_at).toLocaleTimeString()}</p>}
                          </div>
                        )}

                        {/* Waiting: agent scanning */}
                        {link.status === 'Waiting' && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                            <p className="font-semibold flex items-center gap-1"><Loader size={12} className="animate-spin" /> Agent is scanning the package…</p>
                            <p><strong>{handler?.name || 'Agent'}</strong> is accepting the handover at this checkpoint.</p>
                          </div>
                        )}

                        {/* Active: in transit */}
                        {link.status === 'Active' && handler && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                            <User size={12} />
                            <span>Currently handled by <strong>{handler.name}</strong></span>
                          </div>
                        )}

                        {/* Completed: show who handled + time */}
                        {link.status === 'Completed' && (
                          <div className="mt-1 text-xs text-slate-400 space-y-0.5">
                            {handler && <p className="flex items-center gap-1"><User size={11} /> Handled by <strong className="text-slate-600">{handler.name}</strong></p>}
                            {link.accepted_at && <p className="flex items-center gap-1"><Clock size={11} /> Accepted: {new Date(link.accepted_at).toLocaleTimeString()}</p>}
                          </div>
                        )}

                        {/* Pending: show upcoming agent */}
                        {link.status === 'Pending' && handler && (
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <User size={11} /> Next up: <strong className="text-slate-500">{handler.name}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL: MAP ──────────────────────────────────── */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col" style={{ minHeight: 640 }}>
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Package size={16} /> Live Route Map
              </div>
              <div className="flex items-center gap-3">
                {data.shipment.status === 'Awaiting Handover' && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium animate-pulse">⏳ Handover in Progress</span>
                )}
                {data.shipment.simulation_state === 'ACTIVE' && data.shipment.status !== 'Delivered' && (
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1">
              <MapContainer center={mapCenter} zoom={6} style={{ height: '100%', width: '100%', minHeight: 580, zIndex: 0 }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

                <MapBoundsHelper coords={boundsCoords} />

                {/* Route polyline */}
                {routePath.length > 0 && (
                  <Polyline positions={routePath} color="#3b82f6" weight={4} opacity={0.5} />
                )}

                {/* Hub markers with status color */}
                {data.shipment.chain.filter(c => c.lat && c.lng).map(link => {
                  const handler = data.handlers[link.handler_id];
                  const color = link.status === 'Completed' ? 'green' :
                                link.status === 'Active' ? 'blue' :
                                link.status === 'Arrived' || link.status === 'Waiting' ? 'orange' : 'grey';
                  const markerIcon = L.divIcon({
                    className: '',
                    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                  });
                  return (
                    <Marker key={link.id} position={[link.lat, link.lng]} icon={markerIcon}>
                      <Popup>
                        <div className="text-xs space-y-1">
                          <p className="font-bold">{link.stage}</p>
                          <p>Status: <strong>{link.status}</strong></p>
                          {handler && <p>Agent: <strong>{handler.name}</strong></p>}
                          {link.status === 'Arrived' && <p className="text-orange-600">📦 Awaiting agent scan</p>}
                          {link.status === 'Waiting' && <p className="text-amber-600">🔄 Agent scanning…</p>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
