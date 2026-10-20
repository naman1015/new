import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useSeniorMode } from '../context/SeniorModeContext';

const COLORS = ['red', 'green', 'blue', 'yellow', 'white'];
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const slotColorStyle = (c) => ({
  width: 14, height: 14, borderRadius: '50%',
  background: `var(--slot-${c})`,
  boxShadow: `0 0 8px var(--slot-${c})`,
  display: 'inline-block', flexShrink: 0,
});

const emptyForm = {
  name: '', slotIndex: 1, slotColor: 'blue',
  dosageAmount: 1, dosageUnit: 'tablet',
  times: ['08:00'], daysOfWeek: [], stockCount: 30,
  notes: '',
};

export default function Medications() {
  const { seniorMode, speakText } = useSeniorMode();
  const [meds, setMeds]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);
  const [deleting, setDeleting] = useState(null);

  const openEditModal = (med) => {
    setEditingId(med._id);
    setForm({
      name: med.name || '',
      slotIndex: med.slotIndex || 1,
      slotColor: med.slotColor || 'blue',
      dosageAmount: med.dosageAmount || 1,
      dosageUnit: med.dosageUnit || 'tablet',
      times: med.times?.length ? [...med.times] : ['08:00'],
      daysOfWeek: med.daysOfWeek || [],
      stockCount: med.stockCount ?? 30,
      notes: med.notes || '',
    });
    setShowModal(true);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    if (seniorMode) {
      speakText(msg);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMeds = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/medications');
      setMeds(data.medications);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeds(); }, [fetchMeds]);

  // Toggle time entries
  const addTime = () => setForm(f => ({ ...f, times: [...f.times, '12:00'] }));
  const removeTime = (i) => setForm(f => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
  const updateTime = (i, val) => setForm(f => {
    const times = [...f.times]; times[i] = val; return { ...f, times };
  });

  // Toggle days of week
  const toggleDay = (d) => setForm(f => ({
    ...f,
    daysOfWeek: f.daysOfWeek.includes(d)
      ? f.daysOfWeek.filter(x => x !== d)
      : [...f.daysOfWeek, d].sort(),
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.times.length === 0) return showToast('Add at least one time.', 'error');
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/medications/${editingId}`, form);
        showToast('Reminder times updated & synced to ESP32!');
      } else {
        await api.post('/medications', form);
        showToast('Medication added & synced to ESP32!');
      }
      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchMeds();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, medName) => {
    if (window.confirm(`Are you sure you want to remove ${medName}?`)) {
      setDeleting(id);
      try {
        await api.delete(`/medications/${id}`);
        showToast(`Medication ${medName} removed.`);
        fetchMeds();
      } catch {
        showToast('Failed to remove.', 'error');
      } finally {
        setDeleting(null);
      }
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="section-header" style={{ marginBottom: seniorMode ? 20 : 24 }}>
        <h2 style={{ fontSize: seniorMode ? '1.8rem' : '1.35rem' }}>Your Medications</h2>
        <button
          className="btn btn-primary"
          style={{ 
            padding: seniorMode ? '14px 24px' : '8px 16px', 
            fontSize: seniorMode ? '1.1rem' : '0.85rem' 
          }}
          onClick={() => setShowModal(true)}
        >
          ➕ Add New
        </button>
      </div>

      {/* Slot usage bar */}
      <div className="card" style={{ 
        padding: seniorMode ? '18px 20px' : '14px 16px', 
        marginBottom: 24,
        borderWidth: seniorMode ? '2px' : '1px'
      }}>
        <p style={{ 
          fontSize: seniorMode ? '1.05rem' : '0.78rem', 
          color: 'var(--text-secondary)', 
          marginBottom: 12,
          fontWeight: 700 
        }}>
          Dispenser Slots ({meds.length} of 6 slots in use)
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map(slot => {
            const med = meds.find(m => m.slotIndex === slot);
            return (
              <div key={slot} style={{
                flex: 1, 
                height: seniorMode ? 14 : 8, 
                borderRadius: 7,
                background: med ? `var(--slot-${med.slotColor})` : 'var(--border)',
                boxShadow: med ? `0 0 10px var(--slot-${med.slotColor})` : 'none',
                transition: 'all 0.3s ease',
              }} title={med ? med.name : `Slot ${slot} empty`} />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(slot => (
            <div key={slot} style={{ 
              flex: 1, 
              textAlign: 'center', 
              fontSize: seniorMode ? '0.95rem' : '0.65rem', 
              color: 'var(--text-muted)',
              fontWeight: 800
            }}>
              Slot {slot}
            </div>
          ))}
        </div>
      </div>

      {/* Medication Cards */}
      {loading ? <div className="spinner" /> : (
        meds.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: seniorMode ? 64 : 52, marginBottom: 14 }}>💊</div>
            <p style={{ marginBottom: 20, fontSize: seniorMode ? '1.25rem' : '1rem' }}>No medications added yet</p>
            <button className="btn btn-primary btn-full" onClick={() => setShowModal(true)}>
              ➕ Add First Medication
            </button>
          </div>
        ) : (
          meds.map(med => (
            <div key={med._id} className="card" style={{
              padding: seniorMode ? '22px 20px' : '18px 16px',
              marginBottom: 16,
              borderLeft: seniorMode ? `6px solid var(--slot-${med.slotColor})` : `3px solid var(--slot-${med.slotColor})`,
              borderWidth: seniorMode ? '2px' : '1px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {seniorMode ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 50,
                      height: 50,
                      borderRadius: 10,
                      border: `2px solid var(--slot-${med.slotColor})`,
                      background: 'var(--bg-secondary)',
                      fontSize: '1.4rem',
                      fontWeight: 950,
                      color: `var(--slot-${med.slotColor})`,
                    }}>
                      {med.slotIndex}
                    </div>
                  ) : (
                    <div style={slotColorStyle(med.slotColor)} />
                  )}
                  <h3 style={{ fontSize: seniorMode ? '1.45rem' : '1.1rem', fontWeight: 800 }}>{med.name}</h3>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{
                      padding: seniorMode ? '8px 14px' : '4px 10px',
                      fontSize: seniorMode ? '0.95rem' : '0.75rem',
                    }}
                    onClick={() => openEditModal(med)}
                  >
                    ⏰ Edit Times
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ 
                      padding: seniorMode ? '8px 16px' : '4px 10px', 
                      fontSize: seniorMode ? '0.95rem' : '0.75rem' 
                    }}
                    onClick={() => handleDelete(med._id, med.name)}
                    disabled={deleting === med._id}
                  >
                    {deleting === med._id ? '...' : 'Remove'}
                  </button>
                </div>
              </div>

              {/* Info grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: seniorMode ? '12px 20px' : '8px 16px', 
                fontSize: seniorMode ? '1.05rem' : '0.82rem' 
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Slot number: </span>
                  <span style={{ fontWeight: 800 }}>{med.slotIndex}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Dosage: </span>
                  <span style={{ fontWeight: 800 }}>{med.dosageAmount} {med.dosageUnit}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Pills Stock: </span>
                  <span style={{
                    fontWeight: 800,
                    color: med.stockCount <= med.stockAlertThreshold ? 'var(--red)' : 'var(--green)',
                  }}>
                    {med.stockCount} left
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Schedule Days: </span>
                  <span style={{ fontWeight: 800 }}>
                    {med.daysOfWeek.length === 0 ? 'Every day' : med.daysOfWeek.map(d => DAYS[d]).join(', ')}
                  </span>
                </div>
              </div>

              {/* Times */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {med.times.map((t, i) => (
                  <span key={i} style={{
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    border: seniorMode ? '2px solid var(--border-glow)' : '1px solid var(--border-glow)',
                    borderRadius: 20,
                    padding: seniorMode ? '6px 14px' : '3px 10px',
                    fontSize: seniorMode ? '0.95rem' : '0.78rem',
                    fontWeight: 700,
                  }}>
                    🕐 {t}
                  </span>
                ))}
              </div>

              {med.notes && (
                <p style={{ 
                  fontSize: seniorMode ? '1rem' : '0.78rem', 
                  color: 'var(--text-muted)', 
                  marginTop: 14,
                  fontWeight: 600 
                }}>
                  📝 Notes: {med.notes}
                </p>
              )}
            </div>
          ))
        )
      )}

      {/* Add / Edit Medication Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEditingId(null); setForm(emptyForm); } }}>
          <div className="modal" style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <h2 style={{ marginBottom: 20 }}>{editingId ? 'Edit Medicine & Reminder Times' : 'Add Medication'}</h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Name */}
              <div className="form-group">
                <label>Medicine Name</label>
                <input className="input" placeholder="e.g. Paracetamol 500mg"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              {/* Slot */}
              <div className="form-group">
                <label>Dispenser Compartment (1 - 6)</label>
                <select className="input" value={form.slotIndex}
                  onChange={e => setForm(f => ({ ...f, slotIndex: Number(e.target.value), slotColor: 'red' }))}>
                  {[1, 2, 3, 4, 5, 6].map(s => (
                    <option key={s} value={s}
                      disabled={meds.some(m => m.slotIndex === s && m._id !== editingId)}>
                      Compartment {s}{meds.some(m => m.slotIndex === s && m._id !== editingId) ? ' (used)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dosage */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Amount / Quantity</label>
                  <input className="input" type="number" min="0.5" step="0.5"
                    value={form.dosageAmount}
                    onChange={e => setForm(f => ({ ...f, dosageAmount: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <select className="input" value={form.dosageUnit}
                    onChange={e => setForm(f => ({ ...f, dosageUnit: e.target.value }))}>
                    {['tablet', 'capsule', 'ml', 'mg'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Times */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ margin: 0 }}>Dose Times</label>
                  <button type="button" className="btn btn-ghost"
                    style={{ padding: seniorMode ? '8px 16px' : '4px 10px', fontSize: seniorMode ? '0.9rem' : '0.75rem' }} onClick={addTime}>
                    ➕ Add Time
                  </button>
                </div>
                {form.times.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="time" className="input" value={t}
                      onChange={e => updateTime(i, e.target.value)} style={{ flex: 1 }} />
                    {form.times.length > 1 && (
                      <button type="button" className="btn btn-danger"
                        style={{ padding: '8px 12px' }} onClick={() => removeTime(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Days of week */}
              <div className="form-group">
                <label>Days (empty = every day)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map((day, i) => (
                    <button key={i} type="button"
                      onClick={() => toggleDay(i)}
                      style={{
                        padding: seniorMode ? '10px 14px' : '6px 10px',
                        borderRadius: 20,
                        border: seniorMode ? '2px solid' : '1px solid',
                        borderColor: form.daysOfWeek.includes(i) ? 'var(--accent)' : 'var(--border)',
                        background: form.daysOfWeek.includes(i) ? 'var(--accent-dim)' : 'transparent',
                        color: form.daysOfWeek.includes(i) ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: seniorMode ? '0.9rem' : '0.75rem', 
                        fontWeight: 700, 
                        cursor: 'pointer', 
                        fontFamily: 'inherit',
                      }}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stock */}
              <div className="form-group">
                <label>Initial Stock (pills quantity)</label>
                <input className="input" type="number" min="1"
                  value={form.stockCount}
                  onChange={e => setForm(f => ({ ...f, stockCount: Number(e.target.value) }))} />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label>Notes (e.g. Take after breakfast)</label>
                <input className="input" placeholder="e.g. Take after food"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => { setShowModal(false); setEditingId(null); setForm(emptyForm); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Medication')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`} style={{
        fontSize: seniorMode ? '1.05rem' : '0.875rem',
        padding: seniorMode ? '16px 24px' : '12px 20px',
      }}>{toast.msg}</div>}
    </div>
  );
}
