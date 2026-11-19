import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Reuse exact seeded categories & 36 products from /server/seed/seedData.js
const { CATEGORIES: RAW_CATEGORIES, PRODUCTS: RAW_PRODUCTS } = require('./server/seed/seedData.js');

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'slotkart_preview_jwt_secret_2026';
const COOKIE_NAME = 'slotkart_token';
const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FEE = 49;
const GST_RATE = 0.18;
const DEFAULT_SLOT_CAPACITY = 5;

const SLOTS = [
  { slot_id: 'SLOT_10_12', label: '10:00 AM - 12:00 PM', start_hour: 10, end_hour: 12 },
  { slot_id: 'SLOT_12_14', label: '12:00 PM - 2:00 PM', start_hour: 12, end_hour: 14 },
  { slot_id: 'SLOT_14_16', label: '2:00 PM - 4:00 PM', start_hour: 14, end_hour: 16 },
  { slot_id: 'SLOT_16_18', label: '4:00 PM - 6:00 PM', start_hour: 16, end_hour: 18 },
  { slot_id: 'SLOT_18_20', label: '6:00 PM - 8:00 PM', start_hour: 18, end_hour: 20 },
];

const SEED_PINCODES = ['302001', '302017', '324001'];

// ---------------------------------------------------------------------------
// IST Date / Time Utilities
// ---------------------------------------------------------------------------
function getISTDateParts(offsetDays = 0) {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000 + offsetDays * 86400000;
  const d = new Date(istMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const weekday = d.getUTCDay();
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dateStr,
    dayName: dayNames[weekday],
    fullDayName: fullDayNames[weekday],
    dayNumber: day,
    monthShort: monthShorts[month],
    displayDate: `${fullDayNames[weekday]}, ${day} ${monthShorts[month]}`,
    shortLabel: `${day} ${monthShorts[month]}`,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${fullDayNames[d.getDay()]}, ${d.getDate()} ${monthShorts[d.getMonth()]}`;
}

function buildSlotDisplayWindow(dateStr: string, slotLabel: string) {
  return `Arriving ${formatDisplayDate(dateStr)} between ${slotLabel}`;
}

function isSlotPast(dateStr: string, startHour: number) {
  const slotStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00+05:30`);
  return Date.now() >= slotStart.getTime();
}

function hoursUntilSlotStart(dateStr: string, startHour: number) {
  const slotStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00+05:30`);
  return (slotStart.getTime() - Date.now()) / (1000 * 60 * 60);
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function maskPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '******';
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// In-Memory Demo Store (Mirrors MongoDB + Python Slot Engine)
// ---------------------------------------------------------------------------
interface UserRec {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin' | 'delivery';
  passwordHash: string;
  failedLoginAttempts: number;
  lockUntil: number | null;
  createdAt: string;
}

interface SlotCapRec {
  pincode: string;
  date: string;
  slot_id: string;
  capacity: number;
  booked: number;
}

const users: UserRec[] = [
  {
    _id: 'usr_customer_1',
    name: 'Aarav Sharma',
    email: 'customer@demo.com',
    phone: '9876542222',
    role: 'customer',
    passwordHash: bcrypt.hashSync('Customer@123', 8),
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    _id: 'usr_admin_1',
    name: 'Priya Verma',
    email: 'admin@demo.com',
    phone: '9876541111',
    role: 'admin',
    passwordHash: bcrypt.hashSync('Admin@123', 8),
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    _id: 'usr_delivery_1',
    name: 'Vikram Singh',
    email: 'delivery@demo.com',
    phone: '9876543333',
    role: 'delivery',
    passwordHash: bcrypt.hashSync('Delivery@123', 8),
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
];

const categories: any[] = RAW_CATEGORIES.map((c: any, idx: number) => ({
  _id: `cat_${idx + 1}`,
  ...c,
}));

const catBySlug = new Map(categories.map((c) => [c.slug, c]));

const products: any[] = RAW_PRODUCTS.map((p: any, idx: number) => {
  const cat = catBySlug.get(p.categorySlug) || categories[0];
  const finalPrice = Math.round(p.price * (1 - (p.discount || 0) / 100));
  return {
    _id: `prod_${idx + 1}`,
    ...p,
    category: cat,
    finalPrice,
    createdAt: new Date(Date.now() - (40 - idx) * 3600000).toISOString(),
  };
});

const reviews: any[] = [
  {
    _id: 'rev_1',
    productId: products[0]._id,
    userId: 'usr_customer_1',
    userName: 'Aarav Sharma',
    rating: 5,
    comment: 'Superb ANC headphones and the 2-hour delivery slot arrived right on time at 2:15 PM!',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    _id: 'rev_2',
    productId: products[6]._id,
    userId: 'usr_customer_1',
    userName: 'Aarav Sharma',
    rating: 5,
    comment: 'Super comfortable sneakers and OTP handover felt very secure.',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];

const addresses: any[] = [
  {
    _id: 'addr_1',
    userId: 'usr_customer_1',
    label: 'Home',
    fullName: 'Aarav Sharma',
    phone: '9876542222',
    line1: 'Flat 402, Emerald Heights, MI Road',
    line2: 'Near Central Park',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    isDefault: true,
  },
  {
    _id: 'addr_2',
    userId: 'usr_customer_1',
    label: 'Office',
    fullName: 'Aarav Sharma',
    phone: '9876542222',
    line1: 'Tower B, Tech Park, Sitapura',
    line2: 'Tonk Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302017',
    isDefault: false,
  },
];

// Carts & wishlists keyed by userId
const carts = new Map<string, Array<{ productId: string; quantity: number }>>();
const wishlists = new Map<string, string[]>();
wishlists.set('usr_customer_1', [products[0]._id, products[1]._id, products[6]._id]);

// Smart Slot Capacity Store keyed by `${pincode}|${date}|${slot_id}`
const slotCapacities = new Map<string, SlotCapRec>();

function slotKey(pincode: string, date: string, slotId: string) {
  return `${pincode}|${date}|${slotId}`;
}

function ensureDaySlots(pincode: string, dateStr: string, demoPattern = false) {
  SLOTS.forEach((s, idx) => {
    const k = slotKey(pincode, dateStr, s.slot_id);
    if (!slotCapacities.has(k)) {
      let booked = 0;
      if (demoPattern) {
        // Seed realistic utilization so Available, Filling fast (>=70%), Full & Recommended all show clearly
        const dayOffsetSeed = Number(dateStr.slice(-2)) % 3;
        const patterns = [
          [4, 2, 1, 5, 3],
          [3, 4, 0, 2, 5],
          [1, 5, 4, 2, 1],
        ];
        booked = patterns[dayOffsetSeed][idx];
      }
      slotCapacities.set(k, {
        pincode,
        date: dateStr,
        slot_id: s.slot_id,
        capacity: DEFAULT_SLOT_CAPACITY,
        booked,
      });
    }
  });
}

// Seed 7 days for default pincodes
for (const pin of SEED_PINCODES) {
  for (let d = 0; d < 7; d++) {
    ensureDaySlots(pin, getISTDateParts(d).dateStr, true);
  }
}

function computeSlotStatus(booked: number, capacity: number) {
  if (capacity <= 0 || booked >= capacity) return 'full';
  if (booked / capacity >= 0.7) return 'filling_fast';
  return 'available';
}

function getDaySlotsPayload(pincode: string, dateStr: string) {
  ensureDaySlots(pincode, dateStr, SEED_PINCODES.includes(pincode));
  const items = SLOTS.map((s) => {
    const rec = slotCapacities.get(slotKey(pincode, dateStr, s.slot_id))!;
    const past = isSlotPast(dateStr, s.start_hour);
    const status = computeSlotStatus(rec.booked, rec.capacity);
    const remaining = Math.max(0, rec.capacity - rec.booked);
    const utilization_pct = rec.capacity > 0 ? Math.round((rec.booked / rec.capacity) * 100) : 100;
    const is_bookable = !past && status !== 'full';
    return {
      slot_id: s.slot_id,
      label: s.label,
      start_hour: s.start_hour,
      end_hour: s.end_hour,
      capacity: rec.capacity,
      booked: rec.booked,
      remaining,
      utilization_pct,
      status,
      is_past: past,
      is_bookable,
      recommended: false,
    };
  });

  // Least-loaded upcoming bookable slot = Recommended
  const bookable = items.filter((i) => i.is_bookable);
  let recommended_slot_id: string | null = null;
  let recommended_reason: string | null = null;
  if (bookable.length > 0) {
    const best = [...bookable].sort((a, b) => a.utilization_pct - b.utilization_pct || a.start_hour - b.start_hour)[0];
    best.recommended = true;
    recommended_slot_id = best.slot_id;
    recommended_reason = `${best.label} has the lowest load (${best.booked}/${best.capacity} booked) for fastest on-time arrival in pincode ${pincode}.`;
  }

  return {
    pincode,
    date: dateStr,
    display_date: formatDisplayDate(dateStr),
    recommended_slot_id,
    recommended_reason,
    slots: items,
  };
}

function getWeekSummaryPayload(pincode: string) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const parts = getISTDateParts(i);
    const dayData = getDaySlotsPayload(pincode, parts.dateStr);
    const openSlots = dayData.slots.filter((s) => s.is_bookable);
    const totalBooked = dayData.slots.reduce((acc, s) => acc + s.booked, 0);
    const totalCap = dayData.slots.reduce((acc, s) => acc + s.capacity, 0);
    const status =
      openSlots.length === 0 ? 'full' : totalCap > 0 && totalBooked / totalCap >= 0.7 ? 'filling_fast' : 'available';
    days.push({
      date: parts.dateStr,
      day_name: parts.dayName,
      day_number: parts.dayNumber,
      month_short: parts.monthShort,
      display_date: parts.displayDate,
      is_today: i === 0,
      available_slots_count: openSlots.length,
      status,
    });
  }
  return { pincode, days };
}

function getUtilizationAnalytics(pincodeFilter?: string) {
  const targetPins = pincodeFilter ? [pincodeFilter] : SEED_PINCODES;
  const byDate: any[] = [];
  const slotAgg = new Map<string, { slot_id: string; label: string; total_booked: number; total_capacity: number }>();
  SLOTS.forEach((s) => slotAgg.set(s.slot_id, { slot_id: s.slot_id, label: s.label, total_booked: 0, total_capacity: 0 }));

  let grandBooked = 0;
  let grandCap = 0;
  let fillingFastCount = 0;
  let fullSlotsCount = 0;

  for (let d = 0; d < 7; d++) {
    const parts = getISTDateParts(d);
    let dayBooked = 0;
    let dayCap = 0;
    for (const pin of targetPins) {
      ensureDaySlots(pin, parts.dateStr, true);
      for (const s of SLOTS) {
        const rec = slotCapacities.get(slotKey(pin, parts.dateStr, s.slot_id))!;
        dayBooked += rec.booked;
        dayCap += rec.capacity;
        grandBooked += rec.booked;
        grandCap += rec.capacity;
        const st = computeSlotStatus(rec.booked, rec.capacity);
        if (st === 'filling_fast') fillingFastCount++;
        if (st === 'full') fullSlotsCount++;
        const agg = slotAgg.get(s.slot_id)!;
        agg.total_booked += rec.booked;
        agg.total_capacity += rec.capacity;
      }
    }
    byDate.push({
      date: parts.dateStr,
      short_label: parts.shortLabel,
      total_booked: dayBooked,
      total_capacity: dayCap,
      utilization_pct: dayCap > 0 ? Math.round((dayBooked / dayCap) * 100) : 0,
    });
  }

  const bySlot = Array.from(slotAgg.values()).map((s) => ({
    ...s,
    utilization_pct: s.total_capacity > 0 ? Math.round((s.total_booked / s.total_capacity) * 100) : 0,
  }));
  const peak = [...bySlot].sort((a, b) => b.total_booked - a.total_booked)[0];

  return {
    by_date: byDate,
    by_slot: bySlot,
    summary: {
      total_booked: grandBooked,
      total_capacity: grandCap,
      overall_utilization_pct: grandCap > 0 ? Math.round((grandBooked / grandCap) * 100) : 0,
      filling_fast_count: fillingFastCount,
      full_slots_count: fullSlotsCount,
      peak_slot_label: peak ? peak.label : null,
    },
  };
}

// Seed 2 realistic orders
const todayIST = getISTDateParts(0).dateStr;
const tomorrowIST = getISTDateParts(1).dateStr;
const dayAfterIST = getISTDateParts(2).dateStr;

const orders: any[] = [
  {
    _id: 'ord_demo_1',
    orderNumber: 'SK-2026-1001',
    userId: 'usr_customer_1',
    items: [
      {
        productId: products[0]._id,
        name: products[0].name,
        imageUrl: products[0].imageUrl,
        price: products[0].price,
        discount: products[0].discount,
        finalUnitPrice: products[0].finalPrice,
        quantity: 1,
        lineTotal: products[0].finalPrice,
      },
    ],
    shippingAddress: { ...addresses[0] },
    pincode: '302001',
    slotDate: todayIST,
    slotId: 'SLOT_14_16',
    slotLabel: '2:00 PM - 4:00 PM',
    slotDisplayWindow: buildSlotDisplayWindow(todayIST, '2:00 PM - 4:00 PM'),
    rescheduleCount: 0,
    rescheduleRequested: false,
    rescheduleReason: '',
    otp: '4829',
    paymentMethod: 'ONLINE_DEMO',
    paymentStatus: 'Paid',
    status: 'Out for Delivery',
    deliveryPartnerId: 'usr_delivery_1',
    totals: {
      subtotal: products[0].finalPrice,
      gst: Math.round(products[0].finalPrice * GST_RATE),
      shipping: 0,
      total: products[0].finalPrice + Math.round(products[0].finalPrice * GST_RATE),
    },
    statusHistory: [
      { status: 'Placed', note: 'Order confirmed & 2-hour delivery slot reserved.', timestamp: new Date(Date.now() - 6 * 3600000).toISOString() },
      { status: 'Packed', note: 'Packed at Jaipur Central Fulfillment Hub.', timestamp: new Date(Date.now() - 4 * 3600000).toISOString() },
      { status: 'Shipped', note: 'Assigned to delivery partner Vikram Singh.', timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
      { status: 'Out for Delivery', note: 'Out for delivery, arriving in your 2:00 PM - 4:00 PM slot.', timestamp: new Date(Date.now() - 45 * 60000).toISOString() },
    ],
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    _id: 'ord_demo_2',
    orderNumber: 'SK-2026-1002',
    userId: 'usr_customer_1',
    items: [
      {
        productId: products[6]._id,
        name: products[6].name,
        imageUrl: products[6].imageUrl,
        price: products[6].price,
        discount: products[6].discount,
        finalUnitPrice: products[6].finalPrice,
        quantity: 1,
        lineTotal: products[6].finalPrice,
      },
    ],
    shippingAddress: { ...addresses[0] },
    pincode: '302001',
    slotDate: dayAfterIST,
    slotId: 'SLOT_10_12',
    slotLabel: '10:00 AM - 12:00 PM',
    slotDisplayWindow: buildSlotDisplayWindow(dayAfterIST, '10:00 AM - 12:00 PM'),
    rescheduleCount: 0,
    rescheduleRequested: false,
    rescheduleReason: '',
    otp: '7391',
    paymentMethod: 'COD',
    paymentStatus: 'Pending',
    status: 'Placed',
    deliveryPartnerId: 'usr_delivery_1',
    totals: {
      subtotal: products[6].finalPrice,
      gst: Math.round(products[6].finalPrice * GST_RATE),
      shipping: 0,
      total: products[6].finalPrice + Math.round(products[6].finalPrice * GST_RATE),
    },
    statusHistory: [
      { status: 'Placed', note: 'Order confirmed & 2-hour delivery slot reserved.', timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
    ],
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
];

const notifications: any[] = [
  {
    _id: 'notif_1',
    userId: 'usr_customer_1',
    orderId: 'ord_demo_1',
    title: 'Out for delivery, arriving in your slot',
    message: `Order SK-2026-1001 is out for delivery with Vikram Singh. ${buildSlotDisplayWindow(todayIST, '2:00 PM - 4:00 PM')}. Share OTP 4829 at handover.`,
    isRead: false,
    createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
  },
  {
    _id: 'notif_2',
    userId: 'usr_customer_1',
    orderId: 'ord_demo_1',
    title: 'Reminder: slot starts in 1 hour',
    message: 'Your 2:00 PM - 4:00 PM delivery window starts soon. Keep your 4-digit OTP (4829) handy.',
    isRead: false,
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
  },
];

function pushNotification(userId: string, title: string, message: string, orderId?: string) {
  notifications.unshift({
    _id: makeId('notif'),
    userId,
    orderId: orderId || null,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

function hydrateOrder(ord: any) {
  const u = users.find((x) => x._id === ord.userId);
  const partner = ord.deliveryPartnerId ? users.find((x) => x._id === ord.deliveryPartnerId) : null;
  return {
    ...ord,
    userId: u ? { _id: u._id, name: u.name, email: u.email, phone: u.phone } : ord.userId,
    deliveryPartnerId: partner ? { _id: partner._id, name: partner.name, phone: partner.phone } : null,
  };
}

function buildCartResponse(userId: string) {
  const raw = carts.get(userId) || [];
  const items = raw
    .map((entry) => {
      const prod = products.find((p) => p._id === entry.productId);
      if (!prod) return null;
      const lineTotal = prod.finalPrice * entry.quantity;
      return {
        productId: prod._id,
        name: prod.name,
        brand: prod.brand,
        imageUrl: prod.imageUrl,
        price: prod.price,
        discount: prod.discount,
        finalUnitPrice: prod.finalPrice,
        stock: prod.stock,
        quantity: entry.quantity,
        lineTotal,
      };
    })
    .filter(Boolean) as any[];

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const gst = Math.round(subtotal * GST_RATE);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + gst + shipping;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items,
    itemCount,
    summary: { subtotal, gst, shipping, total, freeShippingThreshold: FREE_SHIPPING_THRESHOLD },
  };
}

// ---------------------------------------------------------------------------
// Auth Helpers (Iframe-Safe Cookie Handling)
// ---------------------------------------------------------------------------
function publicUser(u: UserRec) {
  return { _id: u._id, id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

function setAuthCookie(req: express.Request, res: express.Response, user: UserRec) {
  const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAge = 7 * 24 * 60 * 60;
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=None; Secure; Partitioned`
    );
  } else {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: maxAge * 1000,
      path: '/',
    });
  }
}

function clearAuthCookie(req: express.Request, res: express.Response) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=None; Secure; Partitioned`
    );
  } else {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }
}

function getAuthUser(req: express.Request): UserRec | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    return users.find((u) => u._id === decoded.sub) || null;
  } catch {
    return null;
  }
}

function requireAuth(roles?: Array<'customer' | 'admin' | 'delivery'>): express.RequestHandler {
  return (req, res, next) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ message: 'Authentication required. Please sign in.' });
      return;
    }
    if (roles && !roles.includes(user.role)) {
      res.status(403).json({ message: 'You do not have permission to access this resource.' });
      return;
    }
    (req as any).user = user;
    next();
  };
}

// ---------------------------------------------------------------------------
// Express App Setup
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Health
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'slotkart-preview',
      database: 'connected',
      slotService: 'connected',
      todayIST: getISTDateParts(0).dateStr,
    });
  });

  // ---- AUTH ----
  app.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ user: null });
      return;
    }
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !phone || !password) {
      res.status(400).json({ message: 'All fields are required.' });
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, and a digit.',
      });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (users.some((u) => u.email === cleanEmail)) {
      res.status(409).json({ message: 'An account with this email already exists.' });
      return;
    }
    const newUser: UserRec = {
      _id: makeId('usr'),
      name: String(name).trim(),
      email: cleanEmail,
      phone: String(phone).trim(),
      role: 'customer',
      passwordHash: bcrypt.hashSync(password, 8),
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    setAuthCookie(req, res, newUser);
    res.status(201).json({ user: publicUser(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      res.status(423).json({ message: `Account temporarily locked. Try again in ${mins} minute(s).` });
      return;
    }
    if (!bcrypt.compareSync(String(password || ''), user.passwordHash)) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 5 * 60 * 1000;
        user.failedLoginAttempts = 0;
        res.status(423).json({ message: 'Too many failed attempts. Account locked for 5 minutes.' });
        return;
      }
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    setAuthCookie(req, res, user);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(req, res);
    res.json({ message: 'Signed out successfully.' });
  });

  app.put('/api/auth/profile', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const { name, phone } = req.body || {};
    if (name) user.name = String(name).trim();
    if (phone) user.phone = String(phone).trim();
    res.json({ user: publicUser(user) });
  });

  app.put('/api/auth/change-password', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const { currentPassword, newPassword } = req.body || {};
    if (!bcrypt.compareSync(String(currentPassword || ''), user.passwordHash)) {
      res.status(400).json({ message: 'Current password is incorrect.' });
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(newPassword || ''))) {
      res.status(400).json({
        message: 'New password must be at least 8 characters with uppercase, lowercase, and a digit.',
      });
      return;
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 8);
    res.json({ message: 'Password updated successfully.' });
  });

  // ---- CATEGORIES & PRODUCTS ----
  app.get('/api/categories', (_req, res) => {
    res.json({ categories });
  });

  app.get('/api/products', (req, res) => {
    const { search, category, minPrice, maxPrice, sort = 'newest', featured, deals } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));

    let list = [...products];
    if (featured === 'true') list = list.filter((p) => p.isFeatured);
    if (deals === 'true') list = list.filter((p) => p.isDeal);
    if (category) {
      const c = String(category).toLowerCase();
      list = list.filter((p) => p.category?.slug === c || p.category?._id === category);
    }
    if (search) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.tags || []).some((t: string) => t.toLowerCase().includes(q))
      );
    }
    if (minPrice !== undefined && minPrice !== '') {
      list = list.filter((p) => p.finalPrice >= Number(minPrice));
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      list = list.filter((p) => p.finalPrice <= Number(maxPrice));
    }

    if (sort === 'price_asc') list.sort((a, b) => a.finalPrice - b.finalPrice);
    else if (sort === 'price_desc') list.sort((a, b) => b.finalPrice - a.finalPrice);
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else if (sort === 'discount') list.sort((a, b) => b.discount - a.discount);
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = list.slice((page - 1) * limit, page * limit);
    res.json({ products: slice, pagination: { page, limit, total, totalPages } });
  });

  app.get('/api/products/:id', (req, res) => {
    const product = products.find((p) => p._id === req.params.id || p.slug === req.params.id);
    if (!product) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    const prodReviews = reviews
      .filter((r) => r.productId === product._id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ product, reviews: prodReviews });
  });

  app.post('/api/products/:id/reviews', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const product = products.find((p) => p._id === req.params.id);
    if (!product) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    const rating = Math.min(5, Math.max(1, Number(req.body?.rating) || 5));
    const comment = String(req.body?.comment || '').trim();
    if (comment.length < 3) {
      res.status(400).json({ message: 'Please enter a review comment (min 3 characters).' });
      return;
    }
    const rev = {
      _id: makeId('rev'),
      productId: product._id,
      userId: user._id,
      userName: user.name,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    };
    reviews.unshift(rev);
    product.numReviews += 1;
    const prodRevs = reviews.filter((r) => r.productId === product._id);
    const avg = prodRevs.reduce((s, r) => s + r.rating, 0) / prodRevs.length;
    product.rating = Number(avg.toFixed(1));
    res.status(201).json({ review: rev });
  });

  // ---- CART ----
  app.get('/api/cart', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    res.json(buildCartResponse(user._id));
  });

  app.post('/api/cart/items', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const { productId, quantity = 1 } = req.body || {};
    const prod = products.find((p) => p._id === productId);
    if (!prod) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    if (prod.stock <= 0) {
      res.status(400).json({ message: 'Product is out of stock.' });
      return;
    }
    const list = carts.get(user._id) || [];
    const existing = list.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity = Math.min(prod.stock, 20, existing.quantity + Number(quantity));
    } else {
      list.push({ productId, quantity: Math.min(prod.stock, 20, Math.max(1, Number(quantity))) });
    }
    carts.set(user._id, list);
    res.json(buildCartResponse(user._id));
  });

  app.put('/api/cart/items/:productId', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const qty = Number(req.body?.quantity);
    const list = carts.get(user._id) || [];
    if (qty <= 0) {
      carts.set(
        user._id,
        list.filter((i) => i.productId !== req.params.productId)
      );
    } else {
      const prod = products.find((p) => p._id === req.params.productId);
      const item = list.find((i) => i.productId === req.params.productId);
      if (item && prod) {
        item.quantity = Math.min(prod.stock, 20, qty);
      }
    }
    res.json(buildCartResponse(user._id));
  });

  app.delete('/api/cart/items/:productId', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const list = carts.get(user._id) || [];
    carts.set(
      user._id,
      list.filter((i) => i.productId !== req.params.productId)
    );
    res.json(buildCartResponse(user._id));
  });

  app.delete('/api/cart', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    carts.set(user._id, []);
    res.json(buildCartResponse(user._id));
  });

  // ---- WISHLIST ----
  app.get('/api/wishlist', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const ids = wishlists.get(user._id) || [];
    const list = ids.map((id) => products.find((p) => p._id === id)).filter(Boolean);
    res.json({ products: list });
  });

  app.post('/api/wishlist/toggle', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const { productId } = req.body || {};
    const ids = wishlists.get(user._id) || [];
    let added = false;
    let next: string[];
    if (ids.includes(productId)) {
      next = ids.filter((id) => id !== productId);
    } else {
      next = [productId, ...ids];
      added = true;
    }
    wishlists.set(user._id, next);
    const list = next.map((id) => products.find((p) => p._id === id)).filter(Boolean);
    res.json({ added, products: list });
  });

  // ---- ADDRESSES ----
  app.get('/api/addresses', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    res.json({ addresses: addresses.filter((a) => a.userId === user._id) });
  });

  app.post('/api/addresses', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const body = req.body || {};
    if (!/^\d{6}$/.test(String(body.pincode || ''))) {
      res.status(400).json({ message: 'Please enter a valid 6-digit Indian pincode.' });
      return;
    }
    if (body.isDefault) {
      addresses.filter((a) => a.userId === user._id).forEach((a) => (a.isDefault = false));
    }
    const created = {
      _id: makeId('addr'),
      userId: user._id,
      label: body.label || 'Home',
      fullName: body.fullName || user.name,
      phone: body.phone || user.phone,
      line1: body.line1 || '',
      line2: body.line2 || '',
      landmark: body.landmark || '',
      city: body.city || 'Jaipur',
      state: body.state || 'Rajasthan',
      pincode: String(body.pincode),
      isDefault: Boolean(body.isDefault),
    };
    addresses.unshift(created);
    res.status(201).json({ address: created });
  });

  app.put('/api/addresses/:id', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const addr = addresses.find((a) => a._id === req.params.id && a.userId === user._id);
    if (!addr) {
      res.status(404).json({ message: 'Address not found.' });
      return;
    }
    const body = req.body || {};
    if (body.isDefault) {
      addresses.filter((a) => a.userId === user._id).forEach((a) => (a.isDefault = false));
    }
    Object.assign(addr, {
      label: body.label ?? addr.label,
      fullName: body.fullName ?? addr.fullName,
      phone: body.phone ?? addr.phone,
      line1: body.line1 ?? addr.line1,
      line2: body.line2 ?? addr.line2,
      city: body.city ?? addr.city,
      state: body.state ?? addr.state,
      pincode: body.pincode ?? addr.pincode,
      isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : addr.isDefault,
    });
    res.json({ address: addr });
  });

  app.delete('/api/addresses/:id', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const idx = addresses.findIndex((a) => a._id === req.params.id && a.userId === user._id);
    if (idx === -1) {
      res.status(404).json({ message: 'Address not found.' });
      return;
    }
    addresses.splice(idx, 1);
    res.json({ message: 'Address deleted.' });
  });

  // ---- SMART DELIVERY SLOT ENGINE ENDPOINTS ----
  app.get('/api/slots/week', (req, res) => {
    const pincode = String(req.query.pincode || '302001').trim();
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ message: 'Valid 6-digit pincode is required.' });
      return;
    }
    res.json(getWeekSummaryPayload(pincode));
  });

  app.get('/api/slots', (req, res) => {
    const pincode = String(req.query.pincode || '302001').trim();
    const date = String(req.query.date || getISTDateParts(0).dateStr).trim();
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ message: 'Valid 6-digit pincode is required.' });
      return;
    }
    res.json(getDaySlotsPayload(pincode, date));
  });

  // ---- ORDERS ----
  app.get('/api/orders', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const status = req.query.status ? String(req.query.status) : '';
    let list = orders.filter((o) => o.userId === user._id);
    if (status && status !== 'all') {
      list = list.filter((o) => o.status === status);
    }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ orders: list.map(hydrateOrder) });
  });

  app.get('/api/orders/:id', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const ord = orders.find((o) => o._id === req.params.id);
    if (!ord || (user.role === 'customer' && ord.userId !== user._id)) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    res.json({ order: hydrateOrder(ord) });
  });

  app.post('/api/orders', requireAuth(['customer', 'admin']), (req, res) => {
    const user: UserRec = (req as any).user;
    const { addressId, slotDate, slotId, paymentMethod = 'COD' } = req.body || {};

    const cartData = buildCartResponse(user._id);
    if (cartData.items.length === 0) {
      res.status(400).json({ message: 'Your cart is empty.' });
      return;
    }
    const addr = addresses.find((a) => a._id === addressId && a.userId === user._id);
    if (!addr) {
      res.status(400).json({ message: 'Selected delivery address not found.' });
      return;
    }
    const slotMeta = SLOTS.find((s) => s.slot_id === slotId);
    if (!slotMeta || !slotDate) {
      res.status(400).json({ message: 'Please pick a valid 2-hour delivery slot.' });
      return;
    }
    if (isSlotPast(slotDate, slotMeta.start_hour)) {
      res.status(400).json({ message: 'Selected delivery window has already started or passed.' });
      return;
    }

    // Step 1: Validate & decrement stock
    for (const item of cartData.items) {
      const prod = products.find((p) => p._id === item.productId);
      if (!prod || prod.stock < item.quantity) {
        res.status(400).json({ message: `Insufficient stock for ${item.name}.` });
        return;
      }
    }

    // Step 2: Atomic slot booking check
    ensureDaySlots(addr.pincode, slotDate, SEED_PINCODES.includes(addr.pincode));
    const capRec = slotCapacities.get(slotKey(addr.pincode, slotDate, slotId))!;
    if (capRec.booked >= capRec.capacity) {
      res.status(409).json({ message: 'Sorry! That 2-hour slot just filled up. Please choose another window.' });
      return;
    }
    capRec.booked += 1;

    // Decrement product stock
    for (const item of cartData.items) {
      const prod = products.find((p) => p._id === item.productId)!;
      prod.stock -= item.quantity;
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const orderNum = `SK-2026-${1001 + orders.length}`;
    const displayWindow = buildSlotDisplayWindow(slotDate, slotMeta.label);

    const newOrder = {
      _id: makeId('ord'),
      orderNumber: orderNum,
      userId: user._id,
      items: cartData.items,
      shippingAddress: { ...addr },
      pincode: addr.pincode,
      slotDate,
      slotId,
      slotLabel: slotMeta.label,
      slotDisplayWindow: displayWindow,
      rescheduleCount: 0,
      rescheduleRequested: false,
      rescheduleReason: '',
      otp,
      paymentMethod,
      paymentStatus: paymentMethod === 'ONLINE_DEMO' ? 'Paid' : 'Pending',
      status: 'Placed',
      deliveryPartnerId: 'usr_delivery_1',
      totals: {
        subtotal: cartData.summary.subtotal,
        gst: cartData.summary.gst,
        shipping: cartData.summary.shipping,
        total: cartData.summary.total,
      },
      statusHistory: [
        {
          status: 'Placed',
          note: `Order confirmed. ${displayWindow}.`,
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    orders.unshift(newOrder);
    carts.set(user._id, []);

    pushNotification(
      user._id,
      'Order Confirmed & Slot Reserved',
      `${orderNum}: ${displayWindow}. Your 4-digit handover OTP is ${otp}.`,
      newOrder._id
    );

    res.status(201).json({ order: hydrateOrder(newOrder) });
  });

  app.get('/api/orders/:id/reschedule-eligibility', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const ord = orders.find((o) => o._id === req.params.id && (o.userId === user._id || user.role === 'admin'));
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    if (['Delivered', 'Cancelled'].includes(ord.status)) {
      res.json({ allowed: false, reason: `Cannot reschedule an order with status "${ord.status}".` });
      return;
    }
    if (ord.rescheduleCount >= 2 && !ord.rescheduleRequested) {
      res.json({
        allowed: false,
        reason: 'Maximum limit of 2 reschedules per order has already been reached.',
      });
      return;
    }
    const slotMeta = SLOTS.find((s) => s.slot_id === ord.slotId);
    const hrsLeft = slotMeta ? hoursUntilSlotStart(ord.slotDate, slotMeta.start_hour) : 0;
    if (!ord.rescheduleRequested && hrsLeft < 3) {
      res.json({
        allowed: false,
        reason: `Rescheduling is only permitted at least 3 hours before the slot starts (${Math.max(0, hrsLeft).toFixed(1)}h remaining).`,
      });
      return;
    }
    res.json({
      allowed: true,
      reason: ord.rescheduleRequested
        ? 'Partner-triggered Reschedule instead of Return enabled — pick any open 2-hour slot below.'
        : `Eligible to reschedule (${2 - ord.rescheduleCount} reschedule(s) remaining, ${hrsLeft.toFixed(1)}h before slot start).`,
    });
  });

  app.post('/api/orders/:id/reschedule', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const ord = orders.find((o) => o._id === req.params.id && (o.userId === user._id || user.role === 'admin'));
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    const { slotDate, slotId } = req.body || {};
    const newSlotMeta = SLOTS.find((s) => s.slot_id === slotId);
    if (!newSlotMeta || !slotDate) {
      res.status(400).json({ message: 'Select a valid date and 2-hour delivery slot.' });
      return;
    }
    if (ord.rescheduleCount >= 2 && !ord.rescheduleRequested) {
      res.status(400).json({ message: 'Maximum limit of 2 reschedules reached.' });
      return;
    }
    const oldSlotMeta = SLOTS.find((s) => s.slot_id === ord.slotId);
    const hrsLeft = oldSlotMeta ? hoursUntilSlotStart(ord.slotDate, oldSlotMeta.start_hour) : 0;
    if (!ord.rescheduleRequested && hrsLeft < 3) {
      res.status(400).json({ message: 'Reschedule cutoff passed (must be at least 3 hours before slot start).' });
      return;
    }
    if (isSlotPast(slotDate, newSlotMeta.start_hour)) {
      res.status(400).json({ message: 'Chosen slot has already started or passed.' });
      return;
    }

    // Book new slot atomically
    ensureDaySlots(ord.pincode, slotDate, SEED_PINCODES.includes(ord.pincode));
    const newCap = slotCapacities.get(slotKey(ord.pincode, slotDate, slotId))!;
    if (newCap.booked >= newCap.capacity) {
      res.status(409).json({ message: 'Selected new slot is full. Please pick another window.' });
      return;
    }
    newCap.booked += 1;

    // Release old slot safely
    const oldCap = slotCapacities.get(slotKey(ord.pincode, ord.slotDate, ord.slotId));
    if (oldCap) oldCap.booked = Math.max(0, oldCap.booked - 1);

    const newDisplay = buildSlotDisplayWindow(slotDate, newSlotMeta.label);
    ord.slotDate = slotDate;
    ord.slotId = slotId;
    ord.slotLabel = newSlotMeta.label;
    ord.slotDisplayWindow = newDisplay;
    if (!ord.rescheduleRequested) {
      ord.rescheduleCount += 1;
    }
    ord.rescheduleRequested = false;
    ord.rescheduleReason = '';
    if (ord.status === 'Reschedule Requested') {
      ord.status = 'Shipped';
    }
    ord.statusHistory.push({
      status: ord.status,
      note: `Rescheduled delivery window: ${newDisplay}.`,
      timestamp: new Date().toISOString(),
    });

    pushNotification(
      ord.userId,
      'Delivery Slot Rescheduled',
      `Order ${ord.orderNumber} updated: ${newDisplay}.`,
      ord._id
    );

    res.json({ message: 'Delivery slot rescheduled successfully!', order: hydrateOrder(ord) });
  });

  app.post('/api/orders/:id/cancel', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const ord = orders.find((o) => o._id === req.params.id && (o.userId === user._id || user.role === 'admin'));
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    if (!['Placed', 'Packed'].includes(ord.status)) {
      res.status(400).json({ message: 'Orders can only be cancelled before they are Shipped.' });
      return;
    }
    ord.status = 'Cancelled';
    ord.statusHistory.push({
      status: 'Cancelled',
      note: 'Order cancelled by customer. Stock and delivery slot released.',
      timestamp: new Date().toISOString(),
    });
    // Release stock and slot
    for (const item of ord.items) {
      const prod = products.find((p) => p._id === item.productId);
      if (prod) prod.stock += item.quantity;
    }
    const cap = slotCapacities.get(slotKey(ord.pincode, ord.slotDate, ord.slotId));
    if (cap) cap.booked = Math.max(0, cap.booked - 1);

    res.json({ message: 'Order cancelled and delivery slot released.', order: hydrateOrder(ord) });
  });

  // ---- NOTIFICATIONS ----
  app.get('/api/notifications', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const list = notifications.filter((n) => n.userId === user._id);
    const unreadCount = list.filter((n) => !n.isRead).length;
    res.json({ notifications: list, unreadCount });
  });

  app.patch('/api/notifications/read-all', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    notifications.filter((n) => n.userId === user._id).forEach((n) => (n.isRead = true));
    res.json({ message: 'Marked all read.' });
  });

  app.patch('/api/notifications/:id/read', requireAuth(), (req, res) => {
    const user: UserRec = (req as any).user;
    const n = notifications.find((x) => x._id === req.params.id && x.userId === user._id);
    if (n) n.isRead = true;
    res.json({ message: 'Marked read.' });
  });

  // ---- ADMIN ----
  app.get('/api/admin/dashboard', requireAuth(['admin']), (req, res) => {
    const pincodeFilter = req.query.pincode ? String(req.query.pincode) : undefined;
    const today = getISTDateParts(0).dateStr;
    const nonCancelled = orders.filter((o) => o.status !== 'Cancelled');
    const totalRevenue = nonCancelled.reduce((s, o) => s + (o.totals?.total || 0), 0);
    const todaysDeliveries = nonCancelled.filter((o) => o.slotDate === today).length;
    const lowStockCount = products.filter((p) => p.stock <= 10).length;

    res.json({
      stats: {
        totalOrders: orders.length,
        totalCustomers: users.filter((u) => u.role === 'customer').length,
        totalRevenue,
        todaysDeliveries,
        todayIST: today,
        lowStockCount,
        totalProducts: products.length,
      },
      slotServiceAvailable: true,
      slotAnalytics: getUtilizationAnalytics(pincodeFilter),
      recentOrders: orders.slice(0, 10).map(hydrateOrder),
    });
  });

  app.get('/api/admin/orders', requireAuth(['admin']), (req, res) => {
    const status = req.query.status ? String(req.query.status) : '';
    let list = [...orders];
    if (status && status !== 'all') list = list.filter((o) => o.status === status);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ orders: list.map(hydrateOrder) });
  });

  app.get('/api/admin/delivery-partners', requireAuth(['admin']), (_req, res) => {
    res.json({ partners: users.filter((u) => u.role === 'delivery').map(publicUser) });
  });

  app.patch('/api/admin/orders/:id/status', requireAuth(['admin']), (req, res) => {
    const ord = orders.find((o) => o._id === req.params.id);
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    const { status, deliveryPartnerId } = req.body || {};
    if (status) ord.status = status;
    if (deliveryPartnerId !== undefined) ord.deliveryPartnerId = deliveryPartnerId || null;
    ord.statusHistory.push({
      status: ord.status,
      note: `Admin updated order status to ${ord.status}.`,
      timestamp: new Date().toISOString(),
    });
    if (ord.status === 'Out for Delivery') {
      pushNotification(
        ord.userId,
        'Out for delivery, arriving in your slot',
        `Order ${ord.orderNumber} is out for delivery. ${ord.slotDisplayWindow}. Keep OTP ${ord.otp} ready.`,
        ord._id
      );
    }
    res.json({ message: `Order ${ord.orderNumber} updated to ${ord.status}.`, order: hydrateOrder(ord) });
  });

  app.post('/api/admin/categories', requireAuth(['admin']), (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ message: 'Category name is required.' });
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const created = { _id: makeId('cat'), name, slug, description: `${name} collection` };
    categories.push(created);
    res.status(201).json({ category: created });
  });

  app.post('/api/admin/products', requireAuth(['admin']), (req, res) => {
    const b = req.body || {};
    const cat = categories.find((c) => c._id === b.category) || categories[0];
    const price = Number(b.price) || 999;
    const discount = Number(b.discount) || 0;
    const created = {
      _id: makeId('prod'),
      name: String(b.name || 'New Product').trim(),
      slug: String(b.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
      brand: b.brand || 'SlotKart',
      category: cat,
      categorySlug: cat.slug,
      price,
      discount,
      finalPrice: Math.round(price * (1 - discount / 100)),
      stock: Number(b.stock) || 0,
      rating: 4.5,
      numReviews: 0,
      imageUrl: b.imageUrl || products[0].imageUrl,
      description: b.description || 'Quality product eligible for 2-hour smart slot delivery.',
      isFeatured: Boolean(b.isFeatured),
      isDeal: Boolean(b.isDeal),
      tags: [],
      createdAt: new Date().toISOString(),
    };
    products.unshift(created);
    res.status(201).json({ product: created });
  });

  app.put('/api/admin/products/:id', requireAuth(['admin']), (req, res) => {
    const prod = products.find((p) => p._id === req.params.id);
    if (!prod) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    const b = req.body || {};
    const cat = b.category ? categories.find((c) => c._id === b.category) : prod.category;
    const price = b.price !== undefined ? Number(b.price) : prod.price;
    const discount = b.discount !== undefined ? Number(b.discount) : prod.discount;
    Object.assign(prod, {
      name: b.name ?? prod.name,
      brand: b.brand ?? prod.brand,
      category: cat || prod.category,
      price,
      discount,
      finalPrice: Math.round(price * (1 - discount / 100)),
      stock: b.stock !== undefined ? Number(b.stock) : prod.stock,
      imageUrl: b.imageUrl ?? prod.imageUrl,
      description: b.description ?? prod.description,
      isFeatured: b.isFeatured !== undefined ? Boolean(b.isFeatured) : prod.isFeatured,
      isDeal: b.isDeal !== undefined ? Boolean(b.isDeal) : prod.isDeal,
    });
    res.json({ product: prod });
  });

  app.delete('/api/admin/products/:id', requireAuth(['admin']), (req, res) => {
    const idx = products.findIndex((p) => p._id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    products.splice(idx, 1);
    res.json({ message: 'Product deleted.' });
  });

  app.get('/api/admin/slots', requireAuth(['admin']), (req, res) => {
    const pincode = String(req.query.pincode || '302001').trim();
    const date = String(req.query.date || tomorrowIST).trim();
    res.json(getDaySlotsPayload(pincode, date));
  });

  app.put('/api/admin/slots/capacity', requireAuth(['admin']), (req, res) => {
    const { pincode, date, slotId, capacity } = req.body || {};
    ensureDaySlots(pincode, date, SEED_PINCODES.includes(pincode));
    const rec = slotCapacities.get(slotKey(pincode, date, slotId));
    if (!rec) {
      res.status(404).json({ message: 'Slot not found.' });
      return;
    }
    const capNum = Number(capacity);
    if (Number.isNaN(capNum) || capNum < rec.booked) {
      res.status(400).json({ message: `Capacity cannot be less than already booked orders (${rec.booked}).` });
      return;
    }
    rec.capacity = capNum;
    res.json({ message: 'Slot capacity updated.', slot: rec });
  });

  // ---- DELIVERY PARTNER ----
  app.get('/api/delivery/orders', requireAuth(['delivery', 'admin']), (req, res) => {
    const user: UserRec = (req as any).user;
    const today = getISTDateParts(0).dateStr;
    const slotOrder = (id: string) => SLOTS.find((s) => s.slot_id === id)?.start_hour ?? 99;

    const assigned = orders
      .filter((o) => (user.role === 'admin' ? true : o.deliveryPartnerId === user._id))
      .filter((o) => o.status !== 'Cancelled')
      .sort((a, b) => a.slotDate.localeCompare(b.slotDate) || slotOrder(a.slotId) - slotOrder(b.slotId))
      .map((o) => {
        const cust = users.find((u) => u._id === o.userId);
        // Strip raw OTP and mask phone for delivery partner privacy & security
        const { otp: _hiddenOtp, ...safeOrder } = o;
        return {
          ...safeOrder,
          customerName: cust?.name || o.shippingAddress?.fullName || 'Customer',
          shippingAddress: {
            ...o.shippingAddress,
            phone: maskPhone(o.shippingAddress?.phone),
          },
        };
      });

    const todaysOrders = assigned.filter((o) => o.slotDate === today && o.status !== 'Delivered');
    const upcomingOrders = assigned.filter((o) => o.slotDate > today && o.status !== 'Delivered');
    const completedOrders = assigned.filter((o) => o.status === 'Delivered');

    res.json({
      todayIST: today,
      orders: assigned,
      todaysOrders,
      upcomingOrders,
      completedOrders,
    });
  });

  app.patch('/api/delivery/orders/:id/out-for-delivery', requireAuth(['delivery', 'admin']), (req, res) => {
    const ord = orders.find((o) => o._id === req.params.id);
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    ord.status = 'Out for Delivery';
    ord.statusHistory.push({
      status: 'Out for Delivery',
      note: 'Delivery partner started delivery for your scheduled 2-hour window.',
      timestamp: new Date().toISOString(),
    });
    pushNotification(
      ord.userId,
      'Out for delivery, arriving in your slot',
      `Order ${ord.orderNumber} is on the way! ${ord.slotDisplayWindow}. Share OTP ${ord.otp} on handover.`,
      ord._id
    );
    res.json({ message: 'Marked Out for Delivery & notified customer!' });
  });

  app.post('/api/delivery/orders/:id/deliver', requireAuth(['delivery', 'admin']), (req, res) => {
    const ord = orders.find((o) => o._id === req.params.id);
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    const providedOtp = String(req.body?.otp || '').trim();
    if (providedOtp !== ord.otp) {
      res.status(400).json({ message: 'Invalid 4-digit OTP. Ask customer to check their order page.' });
      return;
    }
    ord.status = 'Delivered';
    ord.paymentStatus = 'Paid';
    ord.rescheduleRequested = false;
    ord.statusHistory.push({
      status: 'Delivered',
      note: '4-digit OTP verified at doorstep. Parcel handed over successfully.',
      timestamp: new Date().toISOString(),
    });
    pushNotification(
      ord.userId,
      'Order Delivered Successfully',
      `Order ${ord.orderNumber} was handed over with OTP verification. Thank you for shopping with SlotKart!`,
      ord._id
    );
    res.json({ message: `OTP verified! Order ${ord.orderNumber} marked Delivered.` });
  });

  app.post('/api/delivery/orders/:id/unavailable', requireAuth(['delivery', 'admin']), (req, res) => {
    const ord = orders.find((o) => o._id === req.params.id);
    if (!ord) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    ord.status = 'Reschedule Requested';
    ord.rescheduleRequested = true;
    ord.rescheduleReason =
      req.body?.reason || 'Customer not available at doorstep during assigned 2-hour slot.';
    ord.statusHistory.push({
      status: 'Reschedule Requested',
      note: 'Customer unavailable — Reschedule instead of Return triggered.',
      timestamp: new Date().toISOString(),
    });
    pushNotification(
      ord.userId,
      'Missed Delivery — Reschedule Instead of Return',
      `We tried delivering ${ord.orderNumber} in your slot. Pick a fresh 2-hour delivery window instead of returning your order!`,
      ord._id
    );
    res.json({ message: 'Triggered "Reschedule instead of Return" notification for customer!' });
  });

  // ---- VITE MIDDLEWARE (DEV) OR STATIC DIST (PROD) ----
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SlotKart Preview] Full-stack preview running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
