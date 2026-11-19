const axios = require('axios');

const SLOT_SERVICE_URL = (process.env.SLOT_SERVICE_URL || 'http://localhost:8000').replace(
  /\/+$/,
  ''
);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

const slotHttp = axios.create({
  baseURL: SLOT_SERVICE_URL,
  timeout: 6000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject shared secret on every outgoing call to Python slot-service
slotHttp.interceptors.request.use((config) => {
  config.headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY || INTERNAL_API_KEY;
  return config;
});

const wrapSlotError = (error, actionLabel) => {
  if (error.response) {
    const status = error.response.status;
    const detail =
      error.response.data?.detail ||
      error.response.data?.message ||
      `Slot engine rejected request (${actionLabel}).`;

    // Auth misconfiguration between services
    if (status === 401 || status === 500) {
      console.error(`[SlotClient] ${actionLabel} failed (${status}):`, detail);
      const err = new Error('Slot service busy, please retry');
      err.statusCode = 503;
      err.publicMessage = 'Slot service busy, please retry';
      err.code = 'SLOT_SERVICE_UNAVAILABLE';
      throw err;
    }

    const err = new Error(detail);
    err.statusCode = status;
    err.code = status === 409 ? 'SLOT_FULL' : 'SLOT_VALIDATION_ERROR';
    throw err;
  }

  // Network error, ECONNREFUSED, timeout, DNS failure
  console.error(`[SlotClient] Python slot-service unreachable during ${actionLabel}:`, error.message);
  const err = new Error('Slot service busy, please retry');
  err.statusCode = 503;
  err.publicMessage = 'Slot service busy, please retry';
  err.code = 'SLOT_SERVICE_UNAVAILABLE';
  throw err;
};

const slotClient = {
  async checkHealth() {
    try {
      const { data } = await slotHttp.get('/health', { timeout: 2500 });
      return { reachable: true, ...data };
    } catch (err) {
      return { reachable: false, status: 'unreachable', error: err.message };
    }
  },

  async getDaySlots(pincode, date) {
    try {
      const { data } = await slotHttp.get('/slots', {
        params: { pincode, ...(date ? { date } : {}) },
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'getDaySlots');
    }
  },

  async getWeekSlots(pincode) {
    try {
      const { data } = await slotHttp.get('/slots/week', {
        params: { pincode },
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'getWeekSlots');
    }
  },

  async bookSlot({ pincode, date, slotId }) {
    try {
      const { data } = await slotHttp.post('/slots/book', {
        pincode,
        date,
        slot_id: slotId,
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'bookSlot');
    }
  },

  async releaseSlot({ pincode, date, slotId }) {
    try {
      const { data } = await slotHttp.post('/slots/release', {
        pincode,
        date,
        slot_id: slotId,
      });
      return data;
    } catch (err) {
      console.error('[SlotClient] releaseSlot warning:', err.message);
      return { success: false, released: false };
    }
  },

  async validateReschedule({ slotDate, slotStart, rescheduleCount, partnerTriggered = false }) {
    try {
      const { data } = await slotHttp.post('/slots/validate-reschedule', {
        slot_date: slotDate,
        slot_start: slotStart,
        reschedule_count: rescheduleCount,
        partner_triggered: partnerTriggered,
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'validateReschedule');
    }
  },

  async getUtilizationAnalytics({ pincode, days = 7 } = {}) {
    try {
      const { data } = await slotHttp.get('/analytics/utilization', {
        params: { ...(pincode ? { pincode } : {}), days },
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'getUtilizationAnalytics');
    }
  },

  async updateAdminCapacity({ pincode, date, slotId, capacity }) {
    try {
      const { data } = await slotHttp.put('/admin/capacity', {
        pincode,
        date,
        slot_id: slotId,
        capacity,
      });
      return data;
    } catch (err) {
      wrapSlotError(err, 'updateAdminCapacity');
    }
  },
};

module.exports = slotClient;
