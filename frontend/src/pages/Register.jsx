import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [hub, setHub] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, hub })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      
      // Auto login
      localStorage.setItem('user', JSON.stringify(data));
      
      if (data.role === 'ADMIN') navigate('/admin');
      else if (data.role === 'DELIVERY') navigate('/delivery');
      else navigate('/customer');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
      <h2 className="text-3xl font-bold text-slate-800 text-center mb-6">Create Account</h2>
      {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4 text-center">{error}</p>}
      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input 
            type="text" 
            required 
            className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            value={name} 
            onChange={e => setName(e.target.value)} 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input 
            type="email" 
            required 
            className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            value={email} 
            onChange={e => setEmail(e.target.value)} 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input 
            type="password" 
            required 
            className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            value={password} 
            onChange={e => setPassword(e.target.value)} 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
          <select 
            value={role} 
            onChange={e => setRole(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="CUSTOMER">Customer</option>
            <option value="DELIVERY">Delivery Partner</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        {role === 'DELIVERY' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Hub</label>
            <select 
              required
              value={hub} 
              onChange={e => setHub(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">Select a Hub...</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Lonavala">Lonavala</option>
              <option value="Khopoli">Khopoli</option>
              <option value="Pune">Pune</option>
            </select>
          </div>
        )}
        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition mt-4">
          Register
        </button>
      </form>
      <p className="text-center mt-6 text-slate-500">
        Already have an account? <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
      </p>
    </div>
  );
}
