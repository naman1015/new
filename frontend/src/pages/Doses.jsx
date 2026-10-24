import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import DoseCard from '../components/DoseCard';
import { useSeniorMode } from '../context/SeniorModeContext';

const filters = ['all', 'pending', 'taken', 'missed', 'skipped'];

const getISTDateStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export default function Doses() {
  const { seniorMode } = useSeniorMode();
  const [doses, setDoses] = useState([]);
  const [filter, setFilter] = useState('all');
  const [date, setDate] = useState(getISTDateStr());
  const [loading, setLoading] = useState(true);

  const fetchDoses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (filter !== 'all') params.append('status', filter);
      const { data } = await api.get(`/doses?${params}`);
      setDoses(data.doses);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [date, filter]);

  useEffect(() => {
    fetchDoses(false);
    const interval = setInterval(() => fetchDoses(true), 3000);
    return () => clearInterval(interval);
  }, [fetchDoses]);

  const displayed = doses.filter(d => filter === 'all' || d.status === filter);

  return (
    <div className="page">
      <h2 style={{ marginBottom: seniorMode ? 20 : 20, fontSize: seniorMode ? '1.8rem' : '1.35rem' }}>Doses Search</h2>

      {/* Date picker */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        {seniorMode && <label style={{ fontSize: '1rem', fontWeight: 800 }}>Select Date:</label>}
        <input
          type="date"
          className="input"
          value={date}
          onChange={e => setDate(e.target.value)}
          max={getISTDateStr()}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 20 }}>
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flexShrink: 0,
              padding: seniorMode ? '10px 18px' : '6px 14px',
              borderRadius: 24,
              border: seniorMode ? '2px solid' : '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              background: filter === f ? 'var(--accent-dim)' : 'transparent',
              color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: seniorMode ? '0.95rem' : '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : (
        displayed.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: seniorMode ? 64 : 48, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: seniorMode ? '1.2rem' : '1rem' }}>
              No {filter === 'all' ? '' : filter} doses for this date
            </p>
          </div>
        ) : (
          displayed.map(dose => (
            <DoseCard key={dose._id} dose={dose} onUpdate={fetchDoses} />
          ))
        )
      )}
    </div>
  );
}
