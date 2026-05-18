import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertTriangle, Truck, User, MapPin, Package, Clock, CheckCircle, ScanLine, XCircle } from 'lucide-react';

const INCIDENT_OPTIONS = [
  { label: 'Vehicle Accident', icon: '🚗', severity: 'Critical' },
  { label: 'Package Damaged', icon: '📦', severity: 'High' },
  { label: 'Heavy Rain / Flood', icon: '🌧️', severity: 'High' },
  { label: 'Road Blocked', icon: '🚧', severity: 'Medium' },
  { label: 'Customer Unavailable', icon: '🚪', severity: 'Low' },
  { label: 'Theft Attempt', icon: '🚨', severity: 'Critical' },
];

export default function DeliveryPortal() {
  const [scannedId, setScannedId] = useState('');
  const [manualId, setManualId] = useState('');
  const [shipmentData, setShipmentData] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // {ok, message, code}
  const [reportMsg, setReportMsg] = useState('');
  const [cameraStarted, setCameraStarted] = useState(false);
  const qrRef = useRef(null);
  const scannerRef = useRef(null);

  const agent = JSON.parse(localStorage.getItem('user') || '{}');

  // ── Camera: always render the div, use useEffect to start after DOM update ──
  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.stop()
        .then(() => { scannerRef.current?.clear(); scannerRef.current = null; })
        .catch(() => { scannerRef.current = null; });
    }
    setCameraStarted(false);
  };

  // Start scanner AFTER cameraStarted=true causes re-render (div now exists in DOM)
  useEffect(() => {
    if (!cameraStarted) return;
    let cancelled = false;

    const initScanner = async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader');
        if (cancelled) return;
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (cancelled) return;
            stopCamera();
            handlePackageId(decodedText.trim().toUpperCase());
          },
          () => {} // error callback (per-frame decode failure) — ignore
        );
      } catch (err) {
        console.error('Camera start error:', err);
        if (!cancelled) setCameraStarted(false);
      }
    };

    initScanner();
    return () => { cancelled = true; };
  }, [cameraStarted]); // eslint-disable-line

  useEffect(() => {
    return () => stopCamera(); // cleanup on unmount
  }, []);

  // ── Load shipment data ───────────────────────────────────────
  const handlePackageId = async (id) => {
    setScannedId(id);
    setScanResult(null);
    setReportMsg('');
    setFetching(true);
    try {
      const res = await fetch(`http://localhost:5000/api/shipments/${id}`);
      if (!res.ok) throw new Error('Package not found');
      const data = await res.json();
      setShipmentData(data);

      // Load scan history
      const logRes = await fetch(`http://localhost:5000/api/scanlogs/${id}`);
      if (logRes.ok) setScanLogs(await logRes.json());
    } catch (e) {
      setShipmentData(null);
      setScanResult({ ok: false, message: e.message });
    }
    setFetching(false);
  };

  // ── Accept Package (POST scan to backend) ────────────────────
  const acceptPackage = async () => {
    if (!scannedId || !agent.id) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(`http://localhost:5000/api/shipments/${scannedId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id })
      });
      const data = await res.json();
      setScanResult(data);
      if (data.ok) {
        await handlePackageId(scannedId); // Refresh
      }
    } catch (e) {
      setScanResult({ ok: false, message: 'Server error. Try again.' });
    }
    setScanning(false);
  };

  const reportIncident = async (issue, severity) => {
    if (!scannedId) return;
    setReportMsg('');
    try {
      await fetch('http://localhost:5000/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: scannedId, issue, severity })
      });
      setReportMsg(`✅ Incident "${issue}" reported. Admin notified.`);
      handlePackageId(scannedId);
    } catch { setReportMsg('❌ Failed to report.'); }
  };

  const reset = () => {
    setScannedId('');
    setManualId('');
    setShipmentData(null);
    setScanResult(null);
    setScanLogs([]);
    setReportMsg('');
  };

  const chain = shipmentData?.shipment?.chain || [];
  const activeStage = chain.find(c => c.status === 'Active' || c.status === 'Waiting' || c.status === 'Arrived');
  const nextStage = chain.find(c => c.status === 'Pending');
  const isMyPackage = activeStage?.handler_id === agent.id;
  const canAccept = activeStage && (activeStage.status === 'Arrived' || activeStage.status === 'Waiting');

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <Truck size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Delivery Partner Portal</h2>
        <p className="text-slate-500 text-sm">
          Welcome, <strong>{agent.name}</strong>
          {agent.hub && <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">Hub: {agent.hub}</span>}
        </p>
      </div>

      {/* ── No package yet: Scan UI ── */}
      {!scannedId && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          
          {/* Camera QR Scanner */}
          <div className="text-center">
            <h3 className="font-bold text-slate-700 mb-3 flex items-center justify-center gap-2">
              <ScanLine size={20} className="text-blue-500" /> Scan Package QR Code
            </h3>

            {/* qr-reader div is ALWAYS in DOM — scanner needs the element to exist */}
            <div
              id="qr-reader"
              className={`w-full max-w-sm mx-auto rounded-xl overflow-hidden border border-slate-200 ${cameraStarted ? 'block' : 'hidden'}`}
            />

            {!cameraStarted ? (
              <button
                onClick={() => setCameraStarted(true)}
                className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition"
              >
                <ScanLine size={24} /> Start Camera
              </button>
            ) : (
              <button onClick={stopCamera} className="mt-3 text-sm text-red-500 hover:underline">
                Cancel Scan
              </button>
            )}
          </div>

          {/* Manual Entry */}
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm text-slate-500 text-center mb-3">Or enter Package ID manually</p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <input
                type="text"
                placeholder="e.g. PKG918284"
                value={manualId}
                onChange={e => setManualId(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-mono uppercase text-sm tracking-wider"
              />
              <button
                onClick={() => { if (manualId) handlePackageId(manualId); }}
                className="bg-slate-800 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-slate-700 transition text-sm"
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Package Loaded ── */}
      {scannedId && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={reset} className="text-blue-600 text-sm font-semibold hover:underline flex items-center gap-1">
              ← Scan Another
            </button>
            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-sm">{scannedId}</span>
          </div>

          {fetching && <p className="text-center text-slate-500 py-6">Loading package details…</p>}

          {/* Scan Result Banner */}
          {scanResult && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${scanResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {scanResult.ok ? <CheckCircle size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
              <div>
                <p className="font-semibold text-sm">{scanResult.ok ? 'Scan Accepted' : 'Scan Conflict Detected'}</p>
                <p className="text-sm mt-0.5">{scanResult.message}</p>
                {scanResult.code === 'WRONG_AGENT' && (
                  <p className="text-xs mt-2 font-medium">Expected agent: <strong>{scanResult.expectedAgent}</strong>. This conflict has been logged and the Admin has been notified.</p>
                )}
              </div>
            </div>
          )}

          {reportMsg && (
            <p className={`p-3 rounded-xl text-sm font-medium border ${reportMsg.startsWith('✅') ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              {reportMsg}
            </p>
          )}

          {shipmentData && (
            <>
              {/* Package Summary */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={18} className="text-blue-500" />
                      <h3 className="text-xl font-bold font-mono text-slate-800">{shipmentData.shipment.id}</h3>
                    </div>
                    <p className="text-slate-500 text-sm flex items-center gap-1">
                      <MapPin size={13} /> {shipmentData.shipment.source} → {shipmentData.shipment.destination}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                    shipmentData.shipment.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                    shipmentData.shipment.status === 'Issue' ? 'bg-red-100 text-red-700' :
                    shipmentData.shipment.status === 'Awaiting Handover' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{shipmentData.shipment.status}</span>
                </div>

                {/* Current Stage Info */}
                {activeStage && (
                  <div className={`p-4 rounded-xl mb-4 ${
                    activeStage.status === 'Arrived' ? 'bg-orange-50 border border-orange-200' :
                    activeStage.status === 'Waiting' ? 'bg-amber-50 border border-amber-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1 text-slate-500 flex items-center gap-1">
                      <Clock size={12} /> Current Checkpoint
                    </p>
                    <p className="font-bold text-slate-800">{activeStage.stage}</p>
                    {activeStage.status === 'Arrived' && (
                      <p className="text-orange-700 text-sm mt-1 font-medium">📦 Package arrived. Awaiting your scan to accept.</p>
                    )}
                    {activeStage.status === 'Waiting' && (
                      <p className="text-amber-700 text-sm mt-1 font-medium">⏳ Scan acceptance in progress…</p>
                    )}
                    {activeStage.status === 'Active' && isMyPackage && (
                      <p className="text-blue-700 text-sm mt-1 font-medium">✅ You are currently responsible for this package.</p>
                    )}
                    {activeStage.status === 'Active' && !isMyPackage && (
                      <p className="text-slate-500 text-sm mt-1">Handled by {shipmentData.handlers[activeStage.handler_id]?.name || 'another agent'}.</p>
                    )}
                  </div>
                )}

                {/* Accept Button */}
                {canAccept && (
                  <button
                    onClick={acceptPackage}
                    disabled={scanning}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2 text-lg"
                  >
                    <ScanLine size={22} />
                    {scanning ? 'Processing Scan…' : '📲 Accept Package (Scan Confirmation)'}
                  </button>
                )}

                {/* Next Stage */}
                {nextStage && (
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Next Checkpoint</p>
                    <p className="font-semibold text-slate-700 text-sm">{nextStage.stage}</p>
                    {nextStage.handler_id && shipmentData.handlers[nextStage.handler_id] && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <User size={12} /> Next agent: <strong>{shipmentData.handlers[nextStage.handler_id].name}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Incident Report */}
              {shipmentData.shipment.status !== 'Delivered' && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" /> Report Incident
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {INCIDENT_OPTIONS.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => reportIncident(opt.label, opt.severity)}
                        className="p-3 border border-red-100 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-sm font-medium flex items-center gap-2 transition"
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <div className="text-left">
                          <p className="text-sm">{opt.label}</p>
                          <p className="text-xs text-red-400">{opt.severity}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scan History */}
              {scanLogs.length > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-700 mb-4">Scan History</h4>
                  <div className="space-y-2">
                    {scanLogs.map(log => (
                      <div key={log.id} className={`flex items-center gap-3 p-3 rounded-lg text-sm border ${
                        log.result === 'SUCCESS' ? 'bg-green-50 border-green-100' :
                        log.result === 'CONFLICT' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
                      }`}>
                        <span className="text-lg shrink-0">
                          {log.result === 'SUCCESS' ? '✅' : log.result === 'CONFLICT' ? '⚠️' : '❌'}
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-700">{log.agent_name} — {log.result}</p>
                          {log.reason && <p className="text-xs text-slate-500 mt-0.5">{log.reason}</p>}
                        </div>
                        <p className="text-xs text-slate-400 shrink-0">{new Date(log.scanned_at).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Chain */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h4 className="font-bold text-slate-700 mb-4">Delivery Chain</h4>
                <div className="space-y-2">
                  {chain.map(link => {
                    const handler = shipmentData.handlers[link.handler_id];
                    return (
                      <div key={link.id} className={`flex items-start gap-3 p-3 rounded-lg text-sm border ${
                        link.status === 'Active' ? 'bg-blue-50 border-blue-100' :
                        link.status === 'Arrived' ? 'bg-orange-50 border-orange-100' :
                        link.status === 'Waiting' ? 'bg-amber-50 border-amber-100' :
                        link.status === 'Completed' ? 'bg-green-50 border-green-100' :
                        'bg-slate-50 border-slate-100'
                      }`}>
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          link.status === 'Completed' ? 'bg-green-500' :
                          link.status === 'Active' ? 'bg-blue-500 animate-pulse' :
                          link.status === 'Arrived' ? 'bg-orange-400 animate-pulse' :
                          link.status === 'Waiting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'
                        }`}></div>
                        <div className="flex-1">
                          <p className={`font-semibold ${link.status === 'Pending' ? 'text-slate-400' : 'text-slate-800'}`}>{link.stage}</p>
                          {handler && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><User size={11} /> {handler.name} {handler.hub ? `(${handler.hub})` : ''}</p>}
                          {link.status === 'Arrived' && <p className="text-orange-600 text-xs mt-1">📦 Awaiting agent scan</p>}
                          {link.status === 'Waiting' && <p className="text-amber-600 text-xs mt-1">🔄 Scan in progress…</p>}
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{link.status.toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
