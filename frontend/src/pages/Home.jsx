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
  const [meds, setMeds] = useState([]);
  const [device, setDevice] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedMedId, setSelectedMedId] = useState('');
  const [reminderTime, setReminderTime] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toTimeString().slice(0, 5);
  });
  const [scheduling, setScheduling] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    if (seniorMode) speakText(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Live 1-second clock so user sees exact synced time
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetDeviceId =
        (user?.device && (typeof user.device === 'object' ? user.device.deviceId : user.device)) ||
        'DISPENSER_01';

      const [statsRes, dosesRes, medsRes, devRes] = await Promise.all([
        api.get('/doses/stats?days=1'),
        api.get(`/doses?date=${today}`),
        api.get('/medications').catch(() => ({ data: { medications: [] } })),
        api.get(`/device/${targetDeviceId}`).catch(() => ({ data: { device: null } })),
      ]);
      setStats(statsRes.data);
      const doses = dosesRes.data.doses;
      setTodayDoses(doses);
      const medications = medsRes.data.medications || [];
      setMeds(medications);
      if (medications.length > 0) {
        setSelectedMedId(prev => prev || medications[0]._id);
      }
      if (devRes.data?.device) {
        setDevice(devRes.data.device);
      }

      const upcoming = doses
         .filter(d => d.status === 'pending')
         .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      setNextDose(upcoming[0] || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLinkEsp32 = async () => {
    setScheduling(true);
    try {
      const { data } = await api.post('/device/link', { deviceId: 'DISPENSER_01' });
      setDevice(data.device);
      showToast('ESP32 (DISPENSER_01) linked & synced!');
      fetchData();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to link ESP32', 'error');
    } finally {
      setScheduling(false);
    }
  };

  const handleSetClockReminder = async (e) => {
    e.preventDefault();
    if (!reminderTime) return;
    setScheduling(true);
    try {
      await api.post('/doses/schedule-reminder', {
        mode: 'clock',
        clockTime: reminderTime,
        medicationId: selectedMedId || undefined,
      });
      showToast(`Reminder set for ${reminderTime} & synced to ESP32!`);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to set reminder', 'error');
    } finally {
      setScheduling(false);
    }
  };

  const handleStartFiveMinTest = async () => {
    setScheduling(true);
    try {
      await api.post('/doses/schedule-reminder', {
        mode: 'timer',
        alertInSeconds: 275, // 4m 35s alert mark in 5-min test
        medicationId: selectedMedId || undefined,
      });
      showToast('5-Min counter started! Alert (Red LED + Buzzer) at 4:35.');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to start timer', 'error');
    } finally {
      setScheduling(false);
    }
  };

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

          {/* ESP32 Live Time Sync & Reminder Scheduler Card */}
          <div className="card" style={{
            padding: seniorMode ? '22px 20px' : '18px 18px',
            marginBottom: 20,
            borderColor: device?.isOnline ? 'var(--green)' : 'var(--border-glow)',
            borderWidth: seniorMode ? '2px' : '1px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: device?.isOnline ? 'var(--green)' : 'var(--amber)',
                  boxShadow: device?.isOnline ? '0 0 10px var(--green)' : '0 0 8px var(--amber)',
                  display: 'inline-block',
                }} />
                <div>
                  <p style={{ fontWeight: 800, fontSize: seniorMode ? '1.1rem' : '0.9rem', color: 'var(--text-primary)' }}>
                    {device?.isOnline ? 'ESP32 Connected & Time Synced' : 'ESP32 Dispenser (DISPENSER_01)'}
                  </p>
                  <p style={{ fontSize: seniorMode ? '0.9rem' : '0.74rem', color: 'var(--text-muted)' }}>
                    {device?.isOnline
                      ? `Synced with device • Last check-in ${new Date(device.lastHeartbeat?.receivedAt || Date.now()).toLocaleTimeString('en-IN')}`
                      : 'Power on ESP32 to auto-sync device clock & reminders'}
                  </p>
                </div>
              </div>
              <div style={{
                textAlign: 'right',
                background: 'var(--bg-secondary)',
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>DEVICE TIME</p>
                <p style={{ fontWeight: 900, fontSize: seniorMode ? '1.15rem' : '0.95rem', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </p>
              </div>
            </div>

            {!device && (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={handleLinkEsp32}
                disabled={scheduling}
                style={{ marginBottom: 12, fontSize: '0.82rem' }}
              >
                🔗 Link ESP32 (DISPENSER_01) to Account
              </button>
            )}

            {/* Set Medicine Reminder Time Options */}
            <div style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 14,
              marginTop: 4,
            }}>
              <p style={{
                fontWeight: 800,
                fontSize: seniorMode ? '1.05rem' : '0.84rem',
                color: 'var(--text-primary)',
                marginBottom: 10,
              }}>
                ⏰ Set Medicine Reminder Time
              </p>

              {meds.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <select
                    className="input"
                    value={selectedMedId}
                    onChange={e => setSelectedMedId(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                  >
                    {meds.map(m => (
                      <option key={m._id} value={m._id}>
                        Slot {m.slotIndex}: {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleSetClockReminder} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="time"
                  className="input"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  style={{ flex: 1, fontWeight: 700 }}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={scheduling}
                  style={{ whiteSpace: 'nowrap', padding: '0 16px', fontSize: '0.84rem' }}
                >
                  Set Time
                </button>
              </form>

              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={handleStartFiveMinTest}
                disabled={scheduling}
                style={{
                  fontSize: seniorMode ? '0.95rem' : '0.8rem',
                  borderColor: 'var(--border-glow)',
                  color: 'var(--accent)',
                  fontWeight: 700,
                }}
              >
                ⏱️ Start 5-Min Test Counter (Red LED & Buzzer at 4:35)
              </button>
            </div>
          </div>

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

      {toast && (
        <div className={`toast ${toast.type}`} style={{
          fontSize: seniorMode ? '1.05rem' : '0.875rem',
          padding: seniorMode ? '16px 24px' : '12px 20px',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
