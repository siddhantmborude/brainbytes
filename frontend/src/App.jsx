import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import CustomerPortal from './pages/CustomerPortal';
import DeliveryPortal from './pages/DeliveryPortal';
import Login from './pages/Login';
import Register from './pages/Register';

function Navigation() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
      <Link to="/" className="text-xl font-bold tracking-wider">TrackSync AI</Link>
      <div className="space-x-4 flex items-center">
        {user ? (
          <>
            <span className="text-blue-200 text-sm border-r border-blue-400 pr-4 mr-2">
              {user.name} ({user.role})
            </span>
            {user.role === 'ADMIN' && <Link to="/admin" className="hover:text-blue-200">Admin</Link>}
            {user.role === 'CUSTOMER' && <Link to="/customer" className="hover:text-blue-200">Customer</Link>}
            {user.role === 'DELIVERY' && <Link to="/delivery" className="hover:text-blue-200">Delivery Partner</Link>}
            <button onClick={handleLogout} className="ml-4 bg-white text-blue-600 px-3 py-1 rounded hover:bg-slate-100 text-sm font-bold">Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:text-blue-200 font-medium">Login</Link>
            <Link to="/register" className="bg-white text-blue-600 px-3 py-1 rounded hover:bg-slate-100 text-sm font-bold">Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  );
}

// Simple Protected Route wrapper
function ProtectedRoute({ children, role }) {
  const u = localStorage.getItem('user');
  if (!u) return <div className="text-center mt-20 text-xl font-bold">Please <Link to="/login" className="text-blue-600 underline">Login</Link> first.</div>;
  const user = JSON.parse(u);
  if (role && user.role !== role) return <div className="text-center mt-20 text-xl font-bold text-red-500">Access Denied</div>;
  return children;
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Navigation />
        <main className="container mx-auto p-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/customer" element={<ProtectedRoute role="CUSTOMER"><CustomerPortal /></ProtectedRoute>} />
            <Route path="/customer/:id" element={<ProtectedRoute role="CUSTOMER"><CustomerPortal /></ProtectedRoute>} />
            <Route path="/delivery" element={<ProtectedRoute role="DELIVERY"><DeliveryPortal /></ProtectedRoute>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
