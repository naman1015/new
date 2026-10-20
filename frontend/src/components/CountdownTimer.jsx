import { useState, useEffect } from 'react';

export default function CountdownTimer({ scheduledAt }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(scheduledAt) - new Date();
      if (diff <= 0) {
        setIsPast(true);
        setTimeLeft('Now!');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledAt]);

  return (
    <span style={{ color: isPast ? 'var(--green)' : 'var(--accent)' }}>
      {timeLeft}
    </span>
  );
}
