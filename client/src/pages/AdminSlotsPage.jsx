import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Save, RefreshCw, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { getTodayISTString } from '../utils/formatters';

const DEMO_PINCODES = ['302001', '302017', '324001'];

export default function AdminSlotsPage() {
  const [pincode, setPincode] = useState('302001');
  const [date, setDate] = useState(getTodayISTString(1)); // Default tomorrow IST
  const [dayData, setDayData] = useState(null);
  const [capInputs, setCapInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSlotId, setSavingSlotId] = useState(null);

  const loadSlots = useCallback(async () => {
    if (!/^\d{6}$/.test(pincode)) return;
    setLoading(true);
    try {
      const { data } = await api.get('/admin/slots', {
        params: { pincode, date },
      });
      setDayData(data);
      const nextInputs = {};
      (data.slots || []).forEach((s) => {
        nextInputs[s.slot_id] = s.capacity;
      });
      setCapInputs(nextInputs);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Slot service busy, please retry'));
      setDayData(null);
    } finally {
      setLoading(false);
    }
  }, [pincode, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleUpdateCapacity = async (slotId) => {
    const newCap = Number(capInputs[slotId]);
    if (Number.isNaN(newCap) || newCap < 0 || newCap > 500) {
      toast.error('Capacity must be between 0 and 500.');
      return;
    }

    setSavingSlotId(slotId);
    try {
      await api.put('/admin/slots/capacity', {
        pincode,
        date,
        slotId,
        capacity: newCap,
      });
      toast.success(`Updated capacity for ${slotId} to ${newCap}`);
      loadSlots();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingSlotId(null);
    }
  };

  return (
    <div className="container page-section">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={16} /> Back to Admin Dashboard
      </Link>

      <div className="dashboard-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <span className="eyebrow">Python FastAPI Slot Engine Control</span>
          <h1>Slot Capacity Management</h1>
          <p className="text-muted">
            Adjust maximum order capacity per pincode, date, and 2-hour IST window in real time.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="slot-admin-controls">
          <div className="form-group">
            <label>Pincode</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              />
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {DEMO_PINCODES.map((pin) => (
                  <button
                    key={pin}
                    type="button"
                    className={`btn btn-xs ${pincode === pin ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setPincode(pin)}
                  >
                    {pin}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Delivery Date (IST)</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <button type="button" className="btn btn-outline btn-sm" onClick={loadSlots}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Capacity Table */}
      <div className="card">
        <div className="card-header-row" style={{ marginBottom: '1rem' }}>
          <h3>
            {dayData
              ? `${dayData.display_date} — Pincode ${dayData.pincode}`
              : 'Delivery Slots'}
          </h3>
          {dayData?.recommended_slot_id && (
            <span className="badge badge-emerald">
              <Sparkles size={13} /> Engine Recommended: {dayData.recommended_slot_id}
            </span>
          )}
        </div>

        {loading ? (
          <div className="skeleton-box" style={{ height: '240px' }} />
        ) : !dayData ? (
          <div className="alert alert-warning">
            Unable to fetch slots from Python engine. Ensure slot-service is running and retry.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>2-Hour Slot Window</th>
                  <th>Booked</th>
                  <th>Utilization</th>
                  <th>Status</th>
                  <th>Max Capacity</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {dayData.slots.map((slot) => (
                  <tr key={slot.slot_id}>
                    <td>
                      <div className="slot-cell">
                        <Clock size={15} className="text-emerald" />
                        <div>
                          <strong>{slot.label}</strong>
                          <div>
                            <small className="text-muted">{slot.slot_id}</small>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{slot.booked}</strong> orders
                    </td>
                    <td style={{ minWidth: '170px' }}>
                      <div className="slot-progress-track">
                        <div
                          className={`slot-progress-fill fill-${
                            slot.status === 'full'
                              ? 'full'
                              : slot.status === 'filling_fast'
                                ? 'fast'
                                : 'open'
                          }`}
                          style={{ width: `${Math.min(100, slot.utilization_pct)}%` }}
                        />
                      </div>
                      <small className="text-muted">{slot.utilization_pct}% full</small>
                    </td>
                    <td>
                      <span
                        className={`slot-status-pill ${
                          slot.status === 'full'
                            ? 'slot-status-full'
                            : slot.status === 'filling_fast'
                              ? 'slot-status-fast'
                              : 'slot-status-open'
                        }`}
                      >
                        {slot.status === 'filling_fast'
                          ? 'Filling fast'
                          : slot.status === 'full'
                            ? 'Full'
                            : 'Available'}
                      </span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={slot.booked}
                        max={500}
                        style={{ width: '90px' }}
                        value={capInputs[slot.slot_id] ?? slot.capacity}
                        onChange={(e) =>
                          setCapInputs((prev) => ({
                            ...prev,
                            [slot.slot_id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-emerald btn-xs"
                        disabled={savingSlotId === slot.slot_id}
                        onClick={() => handleUpdateCapacity(slot.slot_id)}
                      >
                        <Save size={14} />{' '}
                        {savingSlotId === slot.slot_id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
