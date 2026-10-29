import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useSeniorMode } from '../context/SeniorModeContext';
import api from '../api/axios';

const SLOT_COLORS = ['red', 'green', 'blue', 'yellow', 'white'];

export default function Profile() {
  const { user, logout } = useAuth();
  const { seniorMode, speakText } = useSeniorMode();
  const navigate = useNavigate();

  const [telegramId, setTelegramId] = useState(user?.telegramChatId || '');
  const [patientEmail, setPatientEmail] = useState('');
  const [deviceId, setDeviceId] = useState(
    (user?.device && (typeof user.device === 'object' ? user.device.deviceId : user.device)) || 'DISPENSER_01'
  );
  const [linkedDevice, setLinkedDevice] = useState({ deviceId: 'DISPENSER_01', isOnline: true });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDeviceStatus = async () => {
      const targetId = deviceId || (user?.device && (typeof user.device === 'object' ? user.device.deviceId : user.device));
      if (targetId) {
        try {
          const { data } = await api.get(`/device/${targetId}`);
          setLinkedDevice({ ...data.device, isOnline: true });
          if (!deviceId) setDeviceId(data.device.deviceId);
        } catch (e) {
          console.error('Error fetching device status:', e);
        }
      }
    };
    fetchDeviceStatus();
    const interval = setInterval(fetchDeviceStatus, 5000);
    return () => clearInterval(interval);
  }, [user, deviceId]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    if (seniorMode) {
      speakText(msg);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const saveTelegram = async () => {
    setLoading(true);
    try {
      await api.patch('/auth/telegram', { telegramChatId: telegramId });
      showToast('Telegram ID saved! You will now receive alerts.');
    } catch {
      showToast('Failed to save.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveDevice = async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data } = await api.post('/device/link', { deviceId });
      setLinkedDevice(data.device);
      showToast('Dispenser linked successfully!');
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to link device.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const linkPatient = async () => {
    if (!patientEmail) return;
    setLoading(true);
    try {
      await api.patch('/auth/link-patient', { patientEmail });
      showToast(`Patient linked successfully!`);
      setPatientEmail('');
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to link patient.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    if (seniorMode) {
      speakText('Signed out successfully.');
    }
    navigate('/login');
  };

  const roleColor = {
    patient: 'var(--accent)',
    caretaker: 'var(--green)',
    doctor: 'var(--amber)',
    admin: 'var(--red)',
  }[user?.role] || 'var(--accent)';

  return (
    <div className="page">
      {/* Profile Header */}
      <div className="card" style={{ 
        padding: seniorMode ? '30px 20px' : '24px 20px', 
        marginBottom: 20, 
        textAlign: 'center',
        borderWidth: seniorMode ? '2px' : '1px'
      }}>
        <div style={{
          width: seniorMode ? 90 : 72, 
          height: seniorMode ? 90 : 72,
          background: `${roleColor}22`,
          border: `3px solid ${roleColor}55`,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: seniorMode ? 36 : 28, 
          margin: '0 auto 14px',
          fontWeight: 700,
        }}>
          {user?.name?.[0]?.toUpperCase()}
        </div>
        <h2 style={{ marginBottom: 6, fontSize: seniorMode ? '1.75rem' : '1.35rem' }}>{user?.name}</h2>
        <p style={{ marginBottom: 12, fontSize: seniorMode ? '1.05rem' : '0.85rem' }}>{user?.email}</p>
        <span style={{
          display: 'inline-block',
          padding: seniorMode ? '6px 18px' : '4px 14px',
          borderRadius: 20,
          background: `${roleColor}22`,
          color: roleColor,
          fontSize: seniorMode ? '0.95rem' : '0.78rem',
          fontWeight: 800,
          textTransform: 'capitalize',
          border: `2px solid ${roleColor}44`,
        }}>
          {user?.role}
        </span>
      </div>

      {/* Telegram Linking */}
      <div className="card" style={{ padding: '20px', marginBottom: 16, borderWidth: seniorMode ? '2px' : '1px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: seniorMode ? 28 : 22 }}>📲</span>
          <div>
            <h3 style={{ fontSize: seniorMode ? '1.35rem' : '1.1rem' }}>Telegram Notifications</h3>
            <p style={{ fontSize: seniorMode ? '0.95rem' : '0.78rem', marginTop: 2 }}>
              Get automatic messages on your phone about your doses
            </p>
          </div>
        </div>

        <div style={{ 
          marginBottom: 10, 
          fontSize: seniorMode ? '0.95rem' : '0.78rem', 
          color: 'var(--text-muted)',
          lineHeight: 1.5 
        }}>
          1. Open Telegram app and search for <strong style={{ color: 'var(--accent)' }}>@BotFather</strong><br />
          2. Type <code style={{ color: 'var(--accent)' }}>/start</code> to get your Chat ID number<br />
          3. Paste it below:
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            className="input"
            placeholder="Your Telegram Chat ID"
            value={telegramId}
            onChange={e => setTelegramId(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={saveTelegram} disabled={loading}>
            Save
          </button>
        </div>

        {user?.telegramChatId && (
          <p style={{ fontSize: seniorMode ? '0.95rem' : '0.75rem', color: 'var(--green)', marginTop: 8, fontWeight: 700 }}>
            ✅ Telegram alerts are active
          </p>
        )}
      </div>

      {/* Dispenser Device Linking (Patient only) */}
      {user?.role === 'patient' && (
        <div className="card" style={{ padding: '20px', marginBottom: 16, borderWidth: seniorMode ? '2px' : '1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: seniorMode ? 28 : 22 }}>📟</span>
            <div>
              <h3 style={{ fontSize: seniorMode ? '1.35rem' : '1.1rem' }}>Dispenser Device</h3>
              <p style={{ fontSize: seniorMode ? '0.95rem' : '0.78rem', marginTop: 2 }}>
                Link your physical pill dispenser box
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="e.g. DISPENSER_01"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={saveDevice} disabled={loading}>
              Link
            </button>
          </div>

          {linkedDevice && (
            <div style={{ 
              marginTop: 14, 
              borderTop: '2px solid var(--border)', 
              paddingTop: 12, 
              fontSize: seniorMode ? '1rem' : '0.8rem' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <span style={{ fontWeight: 800, color: linkedDevice.isOnline ? 'var(--green)' : 'var(--red)' }}>
                  {linkedDevice.isOnline ? '🟢 Connected / Online' : '🔴 Disconnected / Offline'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Signal Strength:</span>
                <span style={{ fontWeight: 700 }}>
                  {linkedDevice.lastHeartbeat?.wifiStrength ? `${linkedDevice.lastHeartbeat.wifiStrength} dBm` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Uptime:</span>
                <span style={{ fontWeight: 700 }}>
                  {linkedDevice.lastHeartbeat?.uptimeSeconds ? `${Math.round(linkedDevice.lastHeartbeat.uptimeSeconds / 60)} mins` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Connection:</span>
                <span style={{ fontWeight: 700 }}>
                  {linkedDevice.lastHeartbeat?.receivedAt ? new Date(linkedDevice.lastHeartbeat.receivedAt).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Link Patient (caretaker/doctor only) */}
      {['caretaker', 'doctor', 'admin'].includes(user?.role) && (
        <div className="card" style={{ padding: '20px', marginBottom: 16, borderWidth: seniorMode ? '2px' : '1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: seniorMode ? 28 : 22 }}>🔗</span>
            <div>
              <h3 style={{ fontSize: seniorMode ? '1.35rem' : '1.1rem' }}>Link a Patient</h3>
              <p style={{ fontSize: seniorMode ? '0.95rem' : '0.78rem', marginTop: 2 }}>Monitor patient status & receive copy of alerts</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Patient's email address"
              value={patientEmail}
              onChange={e => setPatientEmail(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={linkPatient} disabled={loading}>
              Link
            </button>
          </div>
        </div>
      )}

      {/* Logout */}
      <button 
        className="btn btn-danger btn-full" 
        onClick={handleLogout} 
        style={{ 
          marginTop: 8,
          padding: seniorMode ? '16px' : '12px',
          fontSize: seniorMode ? '1.15rem' : '0.925rem',
        }}
      >
        Sign Out / Exit Account
      </button>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`} style={{
          fontSize: seniorMode ? '1.05rem' : '0.875rem',
          padding: seniorMode ? '16px 24px' : '12px 20px',
          borderWidth: seniorMode ? '2px' : '1px',
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
