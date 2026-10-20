import { useState, useEffect, useCallback } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';
import { useSeniorMode } from '../context/SeniorModeContext';
import api from '../api/axios';
import DoseCard from '../components/DoseCard';
import CountdownTimer from '../components/CountdownTimer';

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning 🌅';
  if (h < 17) return 'Good Afternoon ☀️';
  return 'Good Evening 🌙';
};

export default function Home() {
  const { user } = useAuth();
  const { seniorMode, speakText } = useSeniorMode();
  const [stats, setStats] = useState(null);
  const [todayDoses, setTodayDoses] = useState([]);
  const [nextDose, setNextDose] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [statsRes, dosesRes] = await Promise.all([
        api.get('/doses/stats?days=1'),
        api.get(`/doses?date=${today}`),
      ]);
      setStats(statsRes.data);
      const doses = dosesRes.data.doses;
      setTodayDoses(doses);

      const upcoming = doses
         .filter(d => d.status === 'pending')
         .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      setNextDose(upcoming[0] || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const adherence = stats?.adherencePercent ?? 0;
  const taken = stats?.taken ?? 0;
  const total = stats?.total ?? 0;
  const pending = stats?.pending ?? 0;

  const handleReadSchedule = () => {
    let msg = `${getGreeting()}, ${user?.name?.split(' ')[0] || 'there'}. `;
    if (todayDoses.length === 0) {
      msg += "You have no medicines scheduled for today. Have a beautiful day!";
    } else {
      msg += `Today you have ${total} doses scheduled. `;
      if (taken === total) {
        msg += "Outstanding! You have successfully taken all your medicines today.";
      } else {
        msg += `You have taken ${taken} of them, with ${pending} still pending. `;
        if (nextDose) {
          const time = new Date(nextDose.scheduledAt).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
          });
          msg += `Your next medicine is ${nextDose.medication?.name || 'unknown'} in slot number ${nextDose.slotIndex}, scheduled at ${time}.`;
        }
      }
    }
    speakText(msg);
  };

  return (
    <div className="page">
      {/* Header Greeting */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: seniorMode ? 24 : 28 
      }}>
        <div>
          <p style={{ 
            fontSize: seniorMode ? '1.15rem' : '0.85rem', 
            color: 'var(--text-muted)', 
            marginBottom: 4 
          }}>
            {getGreeting()}
          </p>
          <h1 style={{ 
            fontSize: seniorMode ? '2rem' : '1.5rem',
            fontWeight: 800 
          }}>
            Hello, {user?.name?.split(' ')[0]}!
          </h1>
        </div>
        <div style={{
          background: 'var(--accent-dim)',
          border: '1px solid var(--border-glow)',
          borderRadius: 14,
          padding: seniorMode ? '10px 18px' : '6px 14px',
          fontSize: seniorMode ? '1.05rem' : '0.78rem',
          fontWeight: 700,
          color: 'var(--accent)',
          textTransform: 'capitalize',
        }}>
          {user?.role}
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* Senior Voice Assistant Banner */}
          {seniorMode && (
            <button 
              className="btn btn-primary btn-full glow" 
              onClick={handleReadSchedule}
              style={{
                marginBottom: 20,
                padding: '18px',
                borderRadius: 20,
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: '1.6rem' }}>🔊</span>
              <span>Listen to Today's Schedule</span>
            </button>
          )}

          {/* Adherence Circle / Ring */}
          <div className="card glow" style={{ 
            padding: seniorMode ? '32px 24px' : '28px 24px', 
            marginBottom: 20, 
            textAlign: 'center' 
          }}>
            <div style={{ width: seniorMode ? 160 : 140, margin: '0 auto 20px' }}>
              <CircularProgressbar
                value={adherence}
                text={`${adherence}%`}
                styles={buildStyles({
                  textColor: 'var(--text-primary)',
                  pathColor: 'var(--accent)',
                  trailColor: 'var(--bg-card-hover)',
                  textSize: seniorMode ? '20px' : '18px',
                  pathTransitionDuration: 0.8,
                })}
              />
            </div>
            <p style={{ 
              fontWeight: 800, 
              color: 'var(--text-primary)', 
              fontSize: seniorMode ? '1.25rem' : '0.875rem' 
            }}>
              Today's Progress
            </p>
            <p style={{ 
              fontSize: seniorMode ? '1.05rem' : '0.78rem', 
              color: 'var(--text-secondary)', 
              marginTop: 6,
              fontWeight: seniorMode ? '600' : '400'
            }}>
              {taken} of {total - pending} doses completed today
            </p>
          </div>

          {/* Next Dose Highlight / Countdown */}
          {nextDose ? (
            <div className="card" style={{
              padding: seniorMode ? '22px 24px' : '18px 20px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderColor: 'var(--border-glow)',
              borderWidth: seniorMode ? '2px' : '1px',
            }}>
              <div>
                <p style={{ 
                  fontSize: seniorMode ? '1.05rem' : '0.78rem', 
                  color: 'var(--text-muted)', 
                  marginBottom: 6 
                }}>
                  🎯 Next Medicine Due:
                </p>
                <p style={{ 
                  fontWeight: 900, 
                  fontSize: seniorMode ? '1.5rem' : '1rem',
                  color: 'var(--text-primary)'
                }}>
                  {nextDose.medication?.name}
                </p>
                {seniorMode && (
                  <p style={{ fontSize: '1rem', color: 'var(--accent)', marginTop: 4, fontWeight: 700 }}>
                    Slot {nextDose.slotIndex} ({nextDose.medication?.slotColor} light)
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ 
                  fontSize: seniorMode ? '1.05rem' : '0.78rem', 
                  color: 'var(--text-muted)', 
                  marginBottom: 6 
                }}>
                  In
                </p>
                <p style={{ 
                  fontWeight: 900, 
                  fontSize: seniorMode ? '1.65rem' : '1.3rem',
                  color: 'var(--accent)'
                }}>
                  <CountdownTimer scheduledAt={nextDose.scheduledAt} />
                </p>
              </div>
              <span className="pulse" style={{
                width: seniorMode ? 14 : 10, 
                height: seniorMode ? 14 : 10, 
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent)',
                flexShrink: 0,
                marginLeft: 12,
              }} />
            </div>
          ) : (
            <div className="card" style={{ 
              padding: seniorMode ? '24px' : '18px 20px', 
              marginBottom: 24, 
              textAlign: 'center',
              borderWidth: seniorMode ? '2px' : '1px',
            }}>
              <p style={{ 
                color: 'var(--green)', 
                fontWeight: 800,
                fontSize: seniorMode ? '1.25rem' : '1rem' 
              }}>
                🎉 All done! No more doses today.
              </p>
            </div>
          )}

          {/* Today's Doses List */}
          <div className="section-header" style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: seniorMode ? '1.65rem' : '1.35rem' }}>Today's Medicine List</h2>
            <span style={{ 
              fontSize: seniorMode ? '1rem' : '0.8rem', 
              color: 'var(--text-secondary)',
              fontWeight: 600
            }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
          </div>

          {todayDoses.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: seniorMode ? 64 : 48, marginBottom: 12 }}>💊</div>
              <p style={{ fontSize: seniorMode ? '1.2rem' : '1rem' }}>No medicines scheduled for today</p>
            </div>
          ) : (
            todayDoses.map(dose => (
              <DoseCard key={dose._id} dose={dose} onUpdate={fetchData} />
            ))
          )}
        </>
      )}
    </div>
  );
}
