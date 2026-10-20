import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'patient' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.user, data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64,
          background: 'var(--accent-dim)',
          borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
          border: '1px solid var(--border-glow)',
          boxShadow: 'var(--accent-glow)',
          fontSize: 32,
        }}>💊</div>
        <h1 className="gradient-text" style={{ fontSize: '1.6rem' }}>DoseTrack</h1>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 400, padding: '28px 24px' }}>
        <h2 style={{ marginBottom: 24 }}>Create account</h2>

        {error && (
          <div style={{
            background: 'var(--red-dim)', border: '1px solid rgba(255,71,87,0.3)',
            borderRadius: 'var(--radius-md)', padding: '10px 14px',
            color: 'var(--red)', fontSize: '0.875rem', marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label>Full Name</label>
            <input className="input" placeholder="John Doe"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@example.com"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input className="input" type="password" placeholder="Min 6 characters"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>I am a</label>
            <select className="input" value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="patient">Patient</option>
              <option value="caretaker">Caretaker / Family Member</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
