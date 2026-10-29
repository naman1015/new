import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../api/axios';
import { useSeniorMode } from '../context/SeniorModeContext';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '2px solid var(--border)',
      borderRadius: 10, padding: '10px 16px', fontSize: '0.95rem',
    }}>
      <p style={{ color: 'var(--accent)', fontWeight: 800 }}>{payload[0].value}% Adherence</p>
    </div>
  );
};

export default function History() {
  const { seniorMode } = useSeniorMode();
  const [range, setRange] = useState(7);
  const [stats, setStats] = useState(null);
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/doses/stats?days=${range}`);
      setStats(data);

      // Build per-day chart data
      const days = [];
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({
          label: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }),
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d),
          adherence: 0,
        });
      }

      // Fetch per-day data
      const results = await Promise.all(
        days.map(async (day) => {
          try {
            const { data: d } = await api.get(`/doses?date=${day.date}`);
            const dayDoses = d.doses || [];
            const completed = dayDoses.filter(x => x.status !== 'pending');
            const takenCount = dayDoses.filter(x => x.status === 'taken').length;
            const adherence = completed.length > 0 ? Math.round((takenCount / completed.length) * 100) : 0;
            return { ...day, adherence };
          } catch {
            return day;
          }
        })
      );
      setWeekData(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="page">
      <div className="section-header" style={{ marginBottom: seniorMode ? 20 : 24 }}>
        <h2 style={{ fontSize: seniorMode ? '1.8rem' : '1.35rem' }}>Adherence History</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {[7, 14, 30].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: seniorMode ? '8px 16px' : '5px 12px',
                borderRadius: 20,
                border: seniorMode ? '2px solid' : '1px solid',
                borderColor: range === r ? 'var(--accent)' : 'var(--border)',
                background: range === r ? 'var(--accent-dim)' : 'transparent',
                color: range === r ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: seniorMode ? '0.95rem' : '0.75rem', 
                fontWeight: 800, 
                cursor: 'pointer', 
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
            >
              {r} Days
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Adherence', value: `${stats?.adherencePercent ?? 0}%`, color: 'var(--accent)' },
              { label: 'Taken', value: stats?.taken ?? 0, color: 'var(--green)' },
              { label: 'Missed', value: stats?.missed ?? 0, color: 'var(--red)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ 
                padding: seniorMode ? '20px 12px' : '16px 12px', 
                textAlign: 'center',
                borderWidth: seniorMode ? '2px' : '1px'
              }}>
                <p style={{ 
                  fontSize: seniorMode ? '1.8rem' : '1.4rem', 
                  fontWeight: 900, 
                  color: s.color, 
                  marginBottom: 6 
                }}>
                  {s.value}
                </p>
                <p style={{ 
                  fontSize: seniorMode ? '0.95rem' : '0.7rem', 
                  color: 'var(--text-muted)',
                  fontWeight: 700 
                }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="card" style={{ 
            padding: '20px 8px 12px', 
            marginBottom: 24,
            borderWidth: seniorMode ? '2px' : '1px'
          }}>
            <p style={{ 
              fontSize: seniorMode ? '1.05rem' : '0.8rem', 
              fontWeight: 700, 
              color: 'var(--text-secondary)', 
              paddingLeft: 12, 
              marginBottom: 16 
            }}>
              Daily Adherence percentage (last {range} days)
            </p>
            <ResponsiveContainer width="100%" height={seniorMode ? 190 : 160}>
              <BarChart data={weekData} barSize={seniorMode ? 24 : 20}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: seniorMode ? 13 : 11, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-card-hover)' }} />
                <Bar dataKey="adherence" radius={[6, 6, 0, 0]}>
                  {weekData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.adherence >= 80 ? 'var(--green)' : entry.adherence >= 50 ? 'var(--amber)' : 'var(--red)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Table */}
          <div className="card" style={{ padding: '20px 24px', borderWidth: seniorMode ? '2px' : '1px' }}>
            <h3 style={{ marginBottom: 16, fontSize: seniorMode ? '1.35rem' : '1.1rem' }}>Detailed Summary</h3>
            {[
              { label: 'Total Scheduled Doses', val: stats?.total },
              { label: 'Successfully Taken',   val: stats?.taken,   color: 'var(--green)' },
              { label: 'Missed Medication',    val: stats?.missed,  color: 'var(--red)'   },
              { label: 'Skipped by Choice',    val: stats?.skipped, color: 'var(--amber)' },
              { label: 'Pending/Upcoming',     val: stats?.pending, color: 'var(--accent)' },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: seniorMode ? '14px 0' : '10px 0', 
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ 
                  color: 'var(--text-secondary)', 
                  fontSize: seniorMode ? '1.05rem' : '0.9rem',
                  fontWeight: 600 
                }}>{row.label}</span>
                <span style={{ 
                  fontWeight: 800, 
                  color: row.color || 'var(--text-primary)', 
                  fontSize: seniorMode ? '1.05rem' : '0.9rem' 
                }}>
                  {row.val ?? 0}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
