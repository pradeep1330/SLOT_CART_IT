import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Calendar,
  MapPin,
} from 'lucide-react';
import api, { getErrorMessage } from '../api/axios';

export default function SlotPicker({
  pincode,
  selectedDate,
  selectedSlotId,
  onSelect,
  excludeSlot = null, // Optional { date, slotId } when rescheduling
}) {
  const [weekDays, setWeekDays] = useState([]);
  const [activeDate, setActiveDate] = useState(selectedDate || '');
  const [dayPayload, setDayPayload] = useState(null);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchWeek = useCallback(async () => {
    if (!pincode || !/^\d{6}$/.test(pincode)) return;
    setLoadingWeek(true);
    setErrorMsg('');
    try {
      const { data } = await api.get('/slots/week', { params: { pincode } });
      const days = data.days || [];
      setWeekDays(days);

      // Pick existing selectedDate if valid, else first day that still has open slots
      if (!activeDate || !days.some((d) => d.date === activeDate)) {
        const firstBookableDay = days.find((d) => d.available_slots_count > 0) || days[0];
        if (firstBookableDay) {
          setActiveDate(firstBookableDay.date);
        }
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Slot service busy, please retry'));
    } finally {
      setLoadingWeek(false);
    }
  }, [pincode, activeDate]);

  const fetchDay = useCallback(async (dateToLoad) => {
    if (!pincode || !dateToLoad) return;
    setLoadingDay(true);
    setErrorMsg('');
    try {
      const { data } = await api.get('/slots', {
        params: { pincode, date: dateToLoad },
      });
      setDayPayload(data);
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Slot service busy, please retry'));
      setDayPayload(null);
    } finally {
      setLoadingDay(false);
    }
  }, [pincode]);

  useEffect(() => {
    setActiveDate(selectedDate || '');
  }, [pincode, selectedDate]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  useEffect(() => {
    if (activeDate) {
      fetchDay(activeDate);
    }
  }, [activeDate, fetchDay]);

  const handleDateClick = (dateStr) => {
    setActiveDate(dateStr);
  };

  const handleSlotCardClick = (slot) => {
    const isCurrentSame =
      excludeSlot && excludeSlot.date === activeDate && excludeSlot.slotId === slot.slot_id;
    if (!slot.is_bookable || isCurrentSame) return;

    onSelect({
      slotDate: activeDate,
      slotId: slot.slot_id,
      slotLabel: slot.label,
      displayDate: dayPayload?.display_date || activeDate,
    });
  };

  const getStatusLabel = (slot) => {
    if (slot.is_past) return 'Window Passed';
    if (slot.status === 'full') return 'Full';
    if (slot.status === 'filling_fast') return 'Filling fast';
    return 'Available';
  };

  const getStatusClass = (slot) => {
    if (slot.is_past || slot.status === 'full') return 'slot-status-full';
    if (slot.status === 'filling_fast') return 'slot-status-fast';
    return 'slot-status-open';
  };

  return (
    <div className="slot-picker-wrapper">
      <div className="slot-picker-header">
        <div>
          <div className="slot-picker-title-row">
            <Clock size={20} className="text-emerald" />
            <h3>Choose Your 2-Hour Delivery Window</h3>
          </div>
          <p className="text-muted">
            Live slot capacity for pincode <strong>{pincode}</strong> (IST / Asia/Kolkata)
          </p>
        </div>
        <span className="pincode-pill">
          <MapPin size={14} /> {pincode}
        </span>
      </div>

      {/* Resilient Error / Retry Banner */}
      {errorMsg && (
        <div className="alert alert-warning slot-retry-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => {
              fetchWeek();
              if (activeDate) fetchDay(activeDate);
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* 7-Day Date Tabs */}
      <div className="date-tabs-strip" role="tablist" aria-label="Next 7 delivery days">
        {loadingWeek && weekDays.length === 0
          ? [1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="skeleton-box date-tab-skeleton" />
            ))
          : weekDays.map((day) => {
              const isSelected = activeDate === day.date;
              const isFull = day.available_slots_count === 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`date-tab ${isSelected ? 'active' : ''} ${isFull ? 'full' : ''}`}
                  onClick={() => handleDateClick(day.date)}
                >
                  <span className="date-tab-day">{day.is_today ? 'Today' : day.day_name}</span>
                  <strong className="date-tab-num">
                    {day.day_number} {day.month_short}
                  </strong>
                  <span className={`date-tab-dot dot-${day.status}`}>
                    {isFull ? 'Full' : `${day.available_slots_count} open`}
                  </span>
                </button>
              );
            })}
      </div>

      {/* Python Engine Recommendation Banner */}
      {dayPayload?.recommended_slot_id && dayPayload?.recommended_reason && (
        <div className="recommended-banner">
          <Sparkles size={18} />
          <div>
            <strong>Smart Engine Recommendation:</strong> {dayPayload.recommended_reason}
          </div>
        </div>
      )}

      {/* 5 Slot Cards Grid */}
      {loadingDay ? (
        <div className="slot-cards-grid">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="skeleton-box" style={{ height: '132px', borderRadius: '14px' }} />
          ))}
        </div>
      ) : dayPayload?.slots?.length > 0 ? (
        <div className="slot-cards-grid">
          {dayPayload.slots.map((slot) => {
            const isSelected =
              selectedDate === activeDate && selectedSlotId === slot.slot_id;
            const isCurrentSame =
              excludeSlot &&
              excludeSlot.date === activeDate &&
              excludeSlot.slotId === slot.slot_id;
            const disabled = !slot.is_bookable || isCurrentSame;

            const fillPercent = Math.min(100, Math.round(slot.utilization_pct || 0));

            return (
              <button
                key={slot.slot_id}
                type="button"
                disabled={disabled}
                onClick={() => handleSlotCardClick(slot)}
                className={`slot-card ${isSelected ? 'selected' : ''} ${
                  slot.recommended && !disabled ? 'recommended' : ''
                } ${disabled ? 'disabled' : ''}`}
              >
                {slot.recommended && !disabled && (
                  <span className="recommended-ribbon">
                    <Sparkles size={12} /> Recommended
                  </span>
                )}

                <div className="slot-card-top">
                  <span className="slot-time-window">
                    <Clock size={16} />
                    {slot.label}
                  </span>
                  {isSelected && <CheckCircle2 size={18} className="slot-check-icon" />}
                </div>

                <div className="slot-card-mid">
                  <span className={`slot-status-pill ${getStatusClass(slot)}`}>
                    {isCurrentSame ? 'Current Slot' : getStatusLabel(slot)}
                  </span>
                  <span className="slot-capacity-text">
                    {slot.is_past
                      ? 'Closed'
                      : `${slot.booked} / ${slot.capacity} booked`}
                  </span>
                </div>

                {/* Live Capacity Progress Bar */}
                <div className="slot-progress-track">
                  <div
                    className={`slot-progress-fill fill-${
                      slot.is_past || slot.status === 'full'
                        ? 'full'
                        : slot.status === 'filling_fast'
                          ? 'fast'
                          : 'open'
                    }`}
                    style={{ width: `${slot.is_past ? 100 : fillPercent}%` }}
                  />
                </div>

                <div className="slot-card-foot">
                  {slot.is_past
                    ? 'Slot start time has passed'
                    : slot.status === 'full'
                      ? 'No delivery capacity remaining'
                      : `${slot.remaining} spot(s) remaining`}
                </div>
              </button>
            );
          })}
        </div>
      ) : !errorMsg ? (
        <div className="alert alert-neutral">
          <Calendar size={16} /> Select a date above to view available 2-hour delivery slots.
        </div>
      ) : null}
    </div>
  );
}
