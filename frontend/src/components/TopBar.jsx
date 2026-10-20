import { useSeniorMode } from '../context/SeniorModeContext';

export default function TopBar() {
  const { seniorMode, toggleSeniorMode, speakText } = useSeniorMode();

  const handleToggle = () => {
    const nextMode = !seniorMode;
    toggleSeniorMode();
    if (nextMode) {
      speakText('Easy View activated. Larger text is now visible.');
    } else {
      speakText('Standard view activated.');
    }
  };

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: seniorMode ? '16px 20px' : '12px 20px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 101,
      backdropFilter: 'blur(12px)',
      webkitBackdropFilter: 'blur(12px)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: seniorMode ? '1.8rem' : '1.4rem' }}>💊</span>
        <span style={{
          fontWeight: 800,
          fontSize: seniorMode ? '1.4rem' : '1.1rem',
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}>
          DoseTrack
        </span>
      </div>

      <button
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: seniorMode ? '10px 18px' : '6px 12px',
          borderRadius: 20,
          border: '2px solid',
          borderColor: seniorMode ? 'var(--green)' : 'var(--border)',
          background: seniorMode ? 'var(--green-dim)' : 'var(--bg-card)',
          color: seniorMode ? 'var(--green)' : 'var(--text-secondary)',
          fontSize: seniorMode ? '0.95rem' : '0.78rem',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.2s ease',
          boxShadow: seniorMode ? '0 4px 12px rgba(21, 128, 61, 0.15)' : 'none',
        }}
      >
        <span>👴</span>
        <span>{seniorMode ? 'Easy View: ON' : 'Easy View'}</span>
      </button>
    </header>
  );
}
