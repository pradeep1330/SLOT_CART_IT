export const formatINR = (amount = 0) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
};

export const formatDateTime = (isoDate) => {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const SLOT_START_HOURS = {
  SLOT_10_12: 10,
  SLOT_12_14: 12,
  SLOT_14_16: 14,
  SLOT_16_18: 16,
  SLOT_18_20: 18,
};

/**
 * Computes human-readable countdown to the start of an IST delivery slot.
 */
export const getSlotCountdown = (slotDate, slotId) => {
  if (!slotDate || !slotId) return 'Scheduled';
  const startHour = SLOT_START_HOURS[slotId] ?? 10;
  const paddedHour = String(startHour).padStart(2, '0');
  const slotStartIso = `${slotDate}T${paddedHour}:00:00+05:30`;
  const targetMs = new Date(slotStartIso).getTime();
  const diffMs = targetMs - Date.now();

  if (Number.isNaN(targetMs)) return 'Scheduled';
  if (diffMs <= 0 && diffMs > -2 * 60 * 60 * 1000) {
    return 'Delivery window active now';
  }
  if (diffMs <= -2 * 60 * 60 * 1000) {
    return 'Window elapsed';
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Starts in ${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
};

export const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Placed':
      return 'badge badge-indigo';
    case 'Packed':
      return 'badge badge-blue';
    case 'Shipped':
      return 'badge badge-purple';
    case 'Out for Delivery':
      return 'badge badge-emerald';
    case 'Delivered':
      return 'badge badge-success';
    case 'Cancelled':
      return 'badge badge-danger';
    case 'Reschedule Requested':
      return 'badge badge-amber';
    default:
      return 'badge badge-neutral';
  }
};

export const getTodayISTString = (offsetDays = 0) => {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  const d = new Date(istMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
