import { Link } from 'react-router-dom';
import { Package, Truck, ShieldAlert } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-extrabold text-slate-800 tracking-tight">TrackSync AI</h1>
        <p className="text-xl text-slate-500 max-w-2xl">
          End-to-End Shipment Intelligence & Delivery Accountability Platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
        <Link to="/customer" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col items-center text-center space-y-4 group">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
            <Package size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-700">Customer Portal</h2>
          <p className="text-slate-500">Track your package live, view the timeline, and verify delivery agents.</p>
        </Link>

        <Link to="/delivery" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col items-center text-center space-y-4 group">
          <div className="p-4 bg-green-50 text-green-600 rounded-full group-hover:scale-110 transition-transform">
            <Truck size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-700">Delivery Partner</h2>
          <p className="text-slate-500">Scan QR codes, receive assignments, and report incidents instantly.</p>
        </Link>

        <Link to="/admin" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col items-center text-center space-y-4 group">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-full group-hover:scale-110 transition-transform">
            <ShieldAlert size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-700">Admin Control</h2>
          <p className="text-slate-500">Manage shipments, control the simulation, and resolve conflicts.</p>
        </Link>
      </div>
    </div>
  );
}
