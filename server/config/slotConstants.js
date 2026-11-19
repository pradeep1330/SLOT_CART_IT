const SLOT_DEFINITIONS = [
  {
    slotId: 'SLOT_10_12',
    label: '10:00 AM - 12:00 PM',
    startTime: '10:00',
    endTime: '12:00',
    startHour: 10,
    endHour: 12,
  },
  {
    slotId: 'SLOT_12_14',
    label: '12:00 PM - 2:00 PM',
    startTime: '12:00',
    endTime: '14:00',
    startHour: 12,
    endHour: 14,
  },
  {
    slotId: 'SLOT_14_16',
    label: '2:00 PM - 4:00 PM',
    startTime: '14:00',
    endTime: '16:00',
    startHour: 14,
    endHour: 16,
  },
  {
    slotId: 'SLOT_16_18',
    label: '4:00 PM - 6:00 PM',
    startTime: '16:00',
    endTime: '18:00',
    startHour: 16,
    endHour: 18,
  },
  {
    slotId: 'SLOT_18_20',
    label: '6:00 PM - 8:00 PM',
    startTime: '18:00',
    endTime: '20:00',
    startHour: 18,
    endHour: 20,
  },
];

const SLOT_MAP = SLOT_DEFINITIONS.reduce((acc, slot) => {
  acc[slot.slotId] = slot;
  return acc;
}, {});

const VALID_SLOT_IDS = Object.keys(SLOT_MAP);

/**
 * Returns today's date in YYYY-MM-DD using IST (Asia/Kolkata).
 */
const getTodayIST = (offsetDays = 0) => {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formats 'YYYY-MM-DD' + slotId into:
 * "Arriving Friday, 14 Nov between 2:00 PM - 4:00 PM"
 */
const formatDeliveryWindow = (dateStr, slotId) => {
  const slot = SLOT_MAP[slotId];
  const label = slot ? slot.label : slotId;
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const weekday = utcDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata',
  });
  const monthShort = utcDate.toLocaleDateString('en-IN', {
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

  return `Arriving ${weekday}, ${day} ${monthShort} between ${label}`;
};

const maskPhone = (phone = '') => {
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length < 4) return '******';
  return `******${clean.slice(-4)}`;
};

module.exports = {
  SLOT_DEFINITIONS,
  SLOT_MAP,
  VALID_SLOT_IDS,
  getTodayIST,
  formatDeliveryWindow,
  maskPhone,
};
