import React, { useEffect, useState } from 'react';
import { X, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import SlotPicker from './SlotPicker';

export default function RescheduleModal({ order, isOpen, onClose, onRescheduled }) {
  const [eligibility, setEligibility] = useState(null);
  const [checking, setChecking] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !order?._id) return;
    let active = true;

    const checkEligibility = async () => {
      setChecking(true);
      setSelectedSlot(null);
      try {
        const { data } = await api.get(`/orders/${order._id}/reschedule-eligibility`);
        if (active) setEligibility(data);
      } catch (err) {
        if (active) {
          setEligibility({
            allowed: false,
            reason: getErrorMessage(err, 'Slot service busy, please retry'),
          });
        }
      } finally {
        if (active) setChecking(false);
      }
    };

    checkEligibility();
    return () => {
      active = false;
    };
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const handleConfirm = async () => {
    if (!selectedSlot) {
      toast.error('Please pick a new date and 2-hour delivery slot.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post(`/orders/${order._id}/reschedule`, {
        slotDate: selectedSlot.slotDate,
        slotId: selectedSlot.slotId,
      });
      toast.success(data.message || 'Delivery slot rescheduled!');
      onRescheduled(data.order);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reschedule delivery slot.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarClock size={22} className="text-emerald" />
            <div>
              <h3>Reschedule Delivery Slot</h3>
              <small className="text-muted">
                Order {order.orderNumber} &bull; Reschedules used: {order.rescheduleCount} / 2
              </small>
            </div>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="current-slot-box">
            <span className="text-muted">Current Window:</span>
            <strong>{order.slotDisplayWindow}</strong>
          </div>

          {checking ? (
            <div className="skeleton-box" style={{ height: '140px', marginTop: '1rem' }} />
          ) : eligibility && !eligibility.allowed ? (
            <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
              <AlertTriangle size={18} />
              <div>
                <strong>Rescheduling Unavailable</strong>
                <p style={{ marginTop: '0.2rem' }}>{eligibility.reason}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="alert alert-emerald" style={{ margin: '1rem 0' }}>
                <CheckCircle2 size={18} />
                <span>{eligibility?.reason || 'Eligible to reschedule.'}</span>
              </div>

              <SlotPicker
                pincode={order.pincode}
                selectedDate={selectedSlot?.slotDate || ''}
                selectedSlotId={selectedSlot?.slotId || ''}
                excludeSlot={{ date: order.slotDate, slotId: order.slotId }}
                onSelect={(choice) => setSelectedSlot(choice)}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          {eligibility?.allowed && (
            <button
              type="button"
              className="btn btn-emerald"
              disabled={!selectedSlot || submitting}
              onClick={handleConfirm}
            >
              {submitting ? 'Confirming New Slot...' : 'Confirm New Delivery Slot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
