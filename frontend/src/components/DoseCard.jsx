import { useState } from 'react';
import api from '../api/axios';
import { useSeniorMode } from '../context/SeniorModeContext';

const statusConfig = {
  taken:   { label: 'Taken',   cls: 'taken',   icon: '✅' },
  missed:  { label: 'Missed',  cls: 'missed',  icon: '❌' },
  pending: { label: 'Pending', cls: 'pending', icon: '⏳' },
  skipped: { label: 'Skipped', cls: 'skipped', icon: '⏭️' },
};

export default function DoseCard({ dose, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const { seniorMode, speakText } = useSeniorMode();
  const med = dose.medication;
  const slotColor = med?.slotColor || 'white';
  const status = statusConfig[dose.status] || statusConfig.pending;
  const time = new Date(dose.scheduledAt).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const handleSkip = async () => {
    setLoading(true);
    try {
      await api.post(`/doses/skip/${dose._id}`, { reason: 'Skipped by patient' });
      onUpdate?.();
      if (seniorMode) {
        speakText(`Medication ${med?.name || ''} skipped.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = (e) => {
    e.stopPropagation(); // Avoid triggering card click if any
    const statusText = dose.status === 'pending' ? 'is due' : `status is ${dose.status}`;
    const textToSpeak = `Medication: ${med?.name || 'Unknown'}. Take ${med?.dosageAmount || ''} ${med?.dosageUnit || ''} from slot number ${dose.slotIndex}. Scheduled for ${time}. The status ${statusText}.`;
    speakText(textToSpeak);
  };

  // Human friendly slot color label
  const colorEmoji = {
    red: '🔴 Red',
    green: '🟢 Green',
    blue: '🔵 Blue',
    yellow: '🟡 Yellow',
    white: '⚪ White',
  }[slotColor] || '⚪';

  return (
    <div
      className="card"
      style={{
        padding: seniorMode ? '20px' : '16px',
        marginBottom: '16px',
        borderLeft: seniorMode ? `6px solid var(--slot-${slotColor})` : `3px solid var(--slot-${slotColor})`,
        position: 'relative',
        overflow: 'hidden',
        borderWidth: seniorMode ? '2px' : '1px',
      }}
    >
      {/* Soft color glow in bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 0% 50%, rgba(var(--slot-${slotColor}-rgb, 0,212,255), 0.08) 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', gap: seniorMode ? 16 : 0, justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* Large Slot Badge for Senior Citizens */}
        {seniorMode && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 75,
            height: 75,
            borderRadius: 14,
            border: `3px solid var(--slot-${slotColor})`,
            background: 'var(--bg-secondary)',
            flexShrink: 0,
            boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>SLOT</span>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: `var(--slot-${slotColor})`, lineHeight: 1.1 }}>
              {dose.slotIndex}
            </span>
          </div>
        )}

        <div style={{ flex: 1 }}>
          <h3 style={{ 
            fontSize: seniorMode ? '1.45rem' : '1.1rem',
            fontWeight: 800,
            marginBottom: 4, 
            color: 'var(--text-primary)' 
          }}>
            {med?.name || 'Unknown'}
          </h3>
          <p style={{ 
            fontSize: seniorMode ? '1.05rem' : '0.8rem', 
            color: 'var(--text-secondary)', 
            marginBottom: 6 
          }}>
            {med?.dosageAmount} {med?.dosageUnit} {!seniorMode && `· Slot ${dose.slotIndex}`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ 
              fontSize: seniorMode ? '1.1rem' : '0.825rem', 
              color: 'var(--accent)', 
              fontWeight: 700 
            }}>
              🕐 {time}
            </p>
            {seniorMode && (
              <span style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                background: 'var(--bg-card-hover)',
                padding: '2px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)'
              }}>
                Light: {colorEmoji}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
          <span className={`badge ${status.cls}`} style={{
            fontSize: seniorMode ? '1rem' : '0.75rem',
            padding: seniorMode ? '6px 12px' : '3px 10px',
            border: seniorMode ? '2px solid' : 'none',
          }}>
            {status.icon} {status.label}
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* Voice readout button */}
            <button
              className="btn btn-ghost"
              style={{ 
                padding: seniorMode ? '8px 16px' : '5px 10px', 
                fontSize: seniorMode ? '0.95rem' : '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              onClick={handleSpeak}
              title="Read instructions out loud"
            >
              🔊 {seniorMode && 'Listen'}
            </button>

            {dose.status === 'pending' && (
              <button
                className="btn btn-danger"
                style={{ 
                  padding: seniorMode ? '8px 16px' : '5px 10px', 
                  fontSize: seniorMode ? '0.95rem' : '0.75rem' 
                }}
                onClick={handleSkip}
                disabled={loading}
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {dose.verifiedByHardware && (
        <p style={{ fontSize: seniorMode ? '0.9rem' : '0.72rem', color: 'var(--green)', marginTop: 10, fontWeight: 700 }}>
          📡 Verified by dispenser sensor
        </p>
      )}
    </div>
  );
}
