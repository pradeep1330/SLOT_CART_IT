require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const { SLOT_DEFINITIONS, getTodayIST, formatDeliveryWindow } = require('../config/slotConstants');
const slotClient = require('../services/slotClient');

const User = require('../models/User');
const Address = require('../models/Address');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Slot = require('../models/Slot');
const Review = require('../models/Review');
const Notification = require('../models/Notification');

const { CATEGORIES, PRODUCTS } = require('./seedData');

const runSeed = async ({ onlyIfEmpty = false } = {}) => {
  const existingUsers = await User.countDocuments();
  const existingProducts = await Product.countDocuments();

  if (onlyIfEmpty && existingUsers > 0 && existingProducts > 0) {
    console.log('[Seed] Database already populated — skipping auto-seed.');
    return { skipped: true };
  }

  console.log('[Seed] Initializing SlotKart demo dataset...');

  // 1. Seed canonical Slot metadata collection (idempotent)
  for (const s of SLOT_DEFINITIONS) {
    await Slot.updateOne({ slotId: s.slotId }, { $setOnInsert: s }, { upsert: true });
  }

  // 2. Seed 6 Categories (idempotent)
  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: cat.slug },
      { $setOnInsert: cat },
      { upsert: true, new: true }
    );
    categoryMap[cat.slug] = doc._id;
  }

  // 3. Seed 36 Products (idempotent)
  const seededProducts = [];
  for (const item of PRODUCTS) {
    const { categorySlug, ...rest } = item;
    const doc = await Product.findOneAndUpdate(
      { slug: item.slug },
      {
        $setOnInsert: {
          ...rest,
          category: categoryMap[categorySlug],
        },
      },
      { upsert: true, new: true }
    );
    seededProducts.push(doc);
  }

  // 4. Seed 3 Demo Users (admin, customer, delivery)
  const demoUsers = [
    {
      name: 'Arjun Sharma (Admin)',
      email: 'admin@demo.com',
      phone: '9829011111',
      passwordPlain: 'Admin@123',
      role: 'admin',
    },
    {
      name: 'Priya Verma',
      email: 'customer@demo.com',
      phone: '9829022222',
      passwordPlain: 'Customer@123',
      role: 'customer',
    },
    {
      name: 'Vikram Singh (Partner)',
      email: 'delivery@demo.com',
      phone: '9829033333',
      passwordPlain: 'Delivery@123',
      role: 'delivery',
    },
  ];

  const userMap = {};
  for (const u of demoUsers) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      const passwordHash = await bcrypt.hash(u.passwordPlain, 10);
      user = await User.create({
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash,
        role: u.role,
      });
    }
    userMap[u.role] = user;
  }

  const customer = userMap.customer;
  const deliveryPartner = userMap.delivery;

  // 5. Seed 1 default saved address for customer@demo.com (Jaipur 302001)
  let address = await Address.findOne({ userId: customer._id });
  if (!address) {
    address = await Address.create({
      userId: customer._id,
      label: 'Home',
      fullName: 'Priya Verma',
      phone: '9829022222',
      line1: 'Flat 402, Emerald Heights, MI Road',
      line2: 'Near Panch Batti Circle',
      landmark: 'Opposite Central Park Gate 2',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
      isDefault: true,
    });
  }

  // 6. Seed 2 realistic sample orders for customer@demo.com (only if none exist)
  const existingOrders = await Order.countDocuments({ userId: customer._id });
  if (existingOrders === 0 && seededProducts.length >= 4) {
    const todayDate = getTodayIST(0);
    const tomorrowDate = getTodayIST(1);

    const p1 = seededProducts[0]; // Sony Headphones
    const p2 = seededProducts[3]; // JBL Flip 6
    const p3 = seededProducts[6]; // Nike Sneakers

    const calcTotals = (items) => {
      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      const gst = Math.round(subtotal * 0.18);
      const shipping = subtotal >= 999 ? 0 : 49;
      return { subtotal, gst, shipping, total: subtotal + gst + shipping };
    };

    const makeSnapshot = (prod, qty) => {
      const unit = Math.round(prod.price * (1 - (prod.discount || 0) / 100));
      return {
        productId: prod._id,
        name: prod.name,
        imageUrl: prod.imageUrl,
        price: prod.price,
        discount: prod.discount,
        finalUnitPrice: unit,
        quantity: qty,
        lineTotal: unit * qty,
      };
    };

    const order1Items = [makeSnapshot(p2, 1)];
    const order2Items = [makeSnapshot(p1, 1), makeSnapshot(p3, 1)];

    const order1SlotId = 'SLOT_18_20';
    const order2SlotId = 'SLOT_14_16';

    const order1Window = formatDeliveryWindow(todayDate, order1SlotId);
    const order2Window = formatDeliveryWindow(tomorrowDate, order2SlotId);

    // Order 1: Today, Out for Delivery, assigned to delivery@demo.com (ready for OTP handover demo!)
    const order1 = await Order.create({
      orderNumber: 'SK-2026-100101',
      userId: customer._id,
      items: order1Items,
      shippingAddress: {
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      status: 'Out for Delivery',
      totals: calcTotals(order1Items),
      paymentMethod: 'ONLINE_DEMO',
      paymentStatus: 'Paid',
      otp: '4829',
      slotDate: todayDate,
      slotId: order1SlotId,
      slotLabel: '6:00 PM - 8:00 PM',
      slotDisplayWindow: order1Window,
      pincode: '302001',
      rescheduleCount: 0,
      deliveryPartnerId: deliveryPartner._id,
      statusHistory: [
        { status: 'Placed', note: `Order placed. Reserved ${order1Window}.`, updatedBy: customer.name },
        { status: 'Packed', note: 'Packed and quality checked at Jaipur Hub.', updatedBy: 'Admin' },
        { status: 'Shipped', note: 'Assigned to delivery partner Vikram Singh.', updatedBy: 'Admin' },
        { status: 'Out for Delivery', note: 'Partner is on the way for your 6:00 PM - 8:00 PM slot.', updatedBy: deliveryPartner.name },
      ],
    });

    // Order 2: Tomorrow, Packed (ready for Reschedule & Admin assignment demo!)
    const order2 = await Order.create({
      orderNumber: 'SK-2026-100102',
      userId: customer._id,
      items: order2Items,
      shippingAddress: {
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      status: 'Packed',
      totals: calcTotals(order2Items),
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      otp: '7391',
      slotDate: tomorrowDate,
      slotId: order2SlotId,
      slotLabel: '2:00 PM - 4:00 PM',
      slotDisplayWindow: order2Window,
      pincode: '302001',
      rescheduleCount: 0,
      deliveryPartnerId: deliveryPartner._id,
      statusHistory: [
        { status: 'Placed', note: `Order placed. Reserved ${order2Window}.`, updatedBy: customer.name },
        { status: 'Packed', note: 'Packed and awaiting dispatch for tomorrow.', updatedBy: 'Admin' },
      ],
    });

    // Sync seeded order bookings into Python slot-service (best-effort if running)
    try {
      await slotClient.bookSlot({ pincode: '302001', date: tomorrowDate, slotId: order2SlotId });
    } catch (_err) {
      // Non-fatal if Python slot-service isn't up yet during seed
    }

    // Seed sample notifications
    await Notification.insertMany([
      {
        userId: customer._id,
        orderId: order1._id,
        type: 'out_for_delivery',
        title: 'Out for delivery, arriving in your slot',
        message: `Order ${order1.orderNumber} is out for delivery! ${order1Window}. Share OTP 4829 at handover.`,
      },
      {
        userId: customer._id,
        orderId: order1._id,
        type: 'slot_reminder',
        title: 'Reminder: slot starts in 1 hour',
        message: `Your delivery partner Vikram Singh will arrive in your 6:00 PM - 8:00 PM window.`,
      },
      {
        userId: customer._id,
        orderId: order2._id,
        type: 'order',
        title: `Order ${order2.orderNumber} Packed`,
        message: `${order2Window}. You can reschedule up to 3 hours before the slot starts.`,
      },
    ]);

    // Seed initial product reviews
    await Review.updateOne(
      { productId: p1._id, userId: customer._id },
      {
        $setOnInsert: {
          productId: p1._id,
          userId: customer._id,
          userName: customer.name,
          rating: 5,
          comment: 'Incredible noise cancellation and delivered right on time during my chosen 2-hour slot!',
        },
      },
      { upsert: true }
    );
  }

  console.log(
    `[Seed] Completed: ${CATEGORIES.length} categories, ${seededProducts.length} products, 3 demo users, 1 address, 2 sample orders.`
  );
  return { skipped: false };
};

// Allow standalone CLI execution: `npm run seed`
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await runSeed({ onlyIfEmpty: false });
      process.exit(0);
    } catch (err) {
      console.error('[Seed] Fatal error:', err);
      process.exit(1);
    }
  })();
}

module.exports = runSeed;
