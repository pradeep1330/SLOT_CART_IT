const express = require('express');
const crypto = require('crypto');
const { body, param } = require('express-validator');

const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Address = require('../models/Address');
const Notification = require('../models/Notification');
const slotClient = require('../services/slotClient');
const { SLOT_MAP, VALID_SLOT_IDS, formatDeliveryWindow } = require('../config/slotConstants');
const { protect } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');
const { buildCartResponse } = require('./cartRoutes');

const router = express.Router();

const generateOrderNumber = () => {
  const year = new Date().getFullYear();
  const suffix = crypto.randomInt(100000, 999999);
  return `SK-${year}-${suffix}`;
};

const generateOtp = () => String(crypto.randomInt(1000, 10000));

/**
 * Helper: restore stock for a list of { productId, quantity } entries (compensating rollback).
 */
const restoreStock = async (items) => {
  for (const item of items) {
    try {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
    } catch (err) {
      console.error(`[Rollback] Failed to restore stock for ${item.productId}:`, err.message);
    }
  }
};

// POST /api/orders  (Strict 5-step atomic checkout with compensating rollback)
router.post(
  '/',
  protect,
  [
    body('addressId').isMongoId().withMessage('Valid shipping addressId is required.'),
    body('slotDate')
      .trim()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Delivery slotDate must be in YYYY-MM-DD format.'),
    body('slotId')
      .trim()
      .isIn(VALID_SLOT_IDS)
      .withMessage('Please select a valid 2-hour delivery time slot.'),
    body('paymentMethod')
      .isIn(['COD', 'ONLINE_DEMO'])
      .withMessage('Payment method must be COD or ONLINE_DEMO.'),
  ],
  handleValidation,
  async (req, res, next) => {
    const decrementedItems = [];
    let slotBooked = false;
    let bookedSlotMeta = null;

    try {
      const { addressId, slotDate, slotId, paymentMethod } = req.body;

      // STEP 1: Validate cart & address server-side, compute authoritative totals from DB
      const address = await Address.findOne({ _id: addressId, userId: req.user.id }).lean();
      if (!address) {
        return res.status(404).json({ message: 'Selected shipping address not found.' });
      }

      const cartData = await buildCartResponse(req.user.id);
      if (!cartData.items || cartData.items.length === 0) {
        return res.status(400).json({ message: 'Your cart is empty. Add items before checkout.' });
      }

      // Quick pre-check on stock before mutations
      for (const item of cartData.items) {
        if (item.stock < item.quantity) {
          return res.status(409).json({
            message: `Insufficient stock for "${item.name}". Only ${item.stock} left.`,
          });
        }
      }

      // STEP 2: Atomically reduce stock per item (prevents overselling)
      for (const item of cartData.items) {
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true }
        );

        if (!updatedProduct) {
          await restoreStock(decrementedItems);
          return res.status(409).json({
            message: `"${item.name}" just ran out of stock. Please review your cart and try again.`,
          });
        }

        decrementedItems.push({ productId: item.productId, quantity: item.quantity });
      }

      // STEP 3: Call Python POST /slots/book (atomic $expr booking)
      bookedSlotMeta = { pincode: address.pincode, date: slotDate, slotId };
      await slotClient.bookSlot(bookedSlotMeta);
      slotBooked = true;

      // STEP 4: Create Order with generated 4-digit OTP and formatted delivery window
      const slotInfo = SLOT_MAP[slotId];
      const slotDisplayWindow = formatDeliveryWindow(slotDate, slotId);
      const otp = generateOtp();

      const orderItems = cartData.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        imageUrl: item.imageUrl,
        price: item.price,
        discount: item.discount,
        finalUnitPrice: item.finalUnitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      }));

      const order = await Order.create({
        orderNumber: generateOrderNumber(),
        userId: req.user.id,
        items: orderItems,
        shippingAddress: {
          label: address.label,
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2 || '',
          landmark: address.landmark || '',
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
        status: 'Placed',
        totals: {
          subtotal: cartData.summary.subtotal,
          gst: cartData.summary.gst,
          shipping: cartData.summary.shipping,
          total: cartData.summary.total,
        },
        paymentMethod,
        paymentStatus: paymentMethod === 'ONLINE_DEMO' ? 'Paid' : 'Pending',
        otp,
        slotDate,
        slotId,
        slotLabel: slotInfo.label,
        slotDisplayWindow,
        pincode: address.pincode,
        rescheduleCount: 0,
        statusHistory: [
          {
            status: 'Placed',
            note: `Order confirmed. Delivery slot reserved: ${slotDisplayWindow}.`,
            updatedBy: req.user.name,
          },
        ],
      });

      // Clear customer cart after successful order creation
      await Cart.findOneAndUpdate({ userId: req.user.id }, { $set: { items: [] } });

      // Simulated in-app notifications (confirmation + slot reminder)
      await Notification.insertMany([
        {
          userId: req.user.id,
          orderId: order._id,
          type: 'order',
          title: `Order ${order.orderNumber} Confirmed`,
          message: `${slotDisplayWindow}. Keep your 4-digit delivery OTP (${otp}) ready at handover.`,
        },
        {
          userId: req.user.id,
          orderId: order._id,
          type: 'slot_reminder',
          title: 'Reminder: slot starts in 1 hour',
          message: `Scheduled reminder for ${order.orderNumber}: ${slotDisplayWindow}. Be ready with OTP ${otp}.`,
        },
      ]);

      return res.status(201).json({
        message: 'Order placed and delivery slot reserved successfully.',
        order,
      });
    } catch (err) {
      // STEP 5: Roll back earlier steps on ANY failure
      if (slotBooked && bookedSlotMeta) {
        await slotClient.releaseSlot(bookedSlotMeta);
      }
      if (decrementedItems.length > 0) {
        await restoreStock(decrementedItems);
      }
      return next(err);
    }
  }
);

// GET /api/orders  (Customer's own orders — IDOR safe)
router.get('/', protect, async (req, res, next) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.status && req.query.status !== 'all') {
      filter.status = String(req.query.status);
    }

    const orders = await Order.find(filter)
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

// GET /api/orders/:id  (Owner or Admin only — IDOR safe)
router.get(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid order ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const queryObj =
        req.user.role === 'admin'
          ? { _id: req.params.id }
          : { _id: req.params.id, userId: req.user.id };

      const order = await Order.findOne(queryObj)
        .populate('deliveryPartnerId', 'name phone')
        .populate('userId', 'name email phone')
        .lean();

      if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
      }

      return res.json({ order });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/orders/:id/reschedule-eligibility
router.get(
  '/:id/reschedule-eligibility',
  protect,
  [param('id').isMongoId().withMessage('Invalid order ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
      }

      if (['Delivered', 'Cancelled'].includes(order.status)) {
        return res.json({
          allowed: false,
          code: 'INVALID_STATUS',
          reason: `Orders that are ${order.status} cannot be rescheduled.`,
          remaining_reschedules: Math.max(0, 2 - order.rescheduleCount),
        });
      }

      if (order.status === 'Out for Delivery' && !order.rescheduleRequested) {
        return res.json({
          allowed: false,
          code: 'OUT_FOR_DELIVERY',
          reason:
            'Your parcel is already out for delivery. If unavailable, the delivery partner can trigger a reschedule instead of return.',
          remaining_reschedules: Math.max(0, 2 - order.rescheduleCount),
        });
      }

      const slotMeta = SLOT_MAP[order.slotId];
      const validation = await slotClient.validateReschedule({
        slotDate: order.slotDate,
        slotStart: slotMeta ? slotMeta.startTime : '10:00',
        rescheduleCount: order.rescheduleCount,
        partnerTriggered: Boolean(order.rescheduleRequested),
      });

      return res.json(validation);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/orders/:id/reschedule
router.post(
  '/:id/reschedule',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid order ID.'),
    body('slotDate')
      .trim()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('New slotDate must be YYYY-MM-DD.'),
    body('slotId')
      .trim()
      .isIn(VALID_SLOT_IDS)
      .withMessage('Please select a valid 2-hour delivery slot.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { slotDate: newSlotDate, slotId: newSlotId } = req.body;
      const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });

      if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
      }

      if (['Delivered', 'Cancelled'].includes(order.status)) {
        return res.status(400).json({
          message: `Cannot reschedule an order that is already ${order.status}.`,
        });
      }

      if (order.status === 'Out for Delivery' && !order.rescheduleRequested) {
        return res.status(400).json({
          message: 'Cannot reschedule while parcel is Out for Delivery.',
        });
      }

      if (order.slotDate === newSlotDate && order.slotId === newSlotId) {
        return res.status(400).json({
          message: 'Please select a different date or time slot from your current window.',
        });
      }

      // Step 1: Ask Python engine to enforce max 2 reschedules + 3-hour cutoff
      const currentSlotMeta = SLOT_MAP[order.slotId];
      const check = await slotClient.validateReschedule({
        slotDate: order.slotDate,
        slotStart: currentSlotMeta ? currentSlotMeta.startTime : '10:00',
        rescheduleCount: order.rescheduleCount,
        partnerTriggered: Boolean(order.rescheduleRequested),
      });

      if (!check.allowed) {
        return res.status(400).json({
          message: check.reason,
          code: check.code,
        });
      }

      const oldSlot = {
        pincode: order.pincode,
        date: order.slotDate,
        slotId: order.slotId,
      };

      // Step 2: Atomically book the NEW slot first
      await slotClient.bookSlot({
        pincode: order.pincode,
        date: newSlotDate,
        slotId: newSlotId,
      });

      // Step 3: Release OLD slot safely
      await slotClient.releaseSlot(oldSlot);

      // Step 4: Persist updated order slot details
      const newSlotInfo = SLOT_MAP[newSlotId];
      const newDisplayWindow = formatDeliveryWindow(newSlotDate, newSlotId);

      order.slotDate = newSlotDate;
      order.slotId = newSlotId;
      order.slotLabel = newSlotInfo.label;
      order.slotDisplayWindow = newDisplayWindow;
      order.rescheduleCount += 1;
      order.rescheduleRequested = false;
      order.rescheduleReason = '';

      if (order.status === 'Reschedule Requested') {
        order.status = 'Packed';
      }

      order.statusHistory.push({
        status: order.status,
        note: `Delivery slot rescheduled (#${order.rescheduleCount}/2) to: ${newDisplayWindow}.`,
        updatedBy: req.user.name,
      });

      await order.save();

      await Notification.create({
        userId: req.user.id,
        orderId: order._id,
        type: 'reschedule',
        title: `Slot Rescheduled for ${order.orderNumber}`,
        message: `Your new delivery window is confirmed: ${newDisplayWindow}.`,
      });

      return res.json({
        message: 'Delivery slot rescheduled successfully.',
        order,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/orders/:id/cancel  (Allowed ONLY before Shipped)
router.post(
  '/:id/cancel',
  protect,
  [param('id').isMongoId().withMessage('Invalid order ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
      if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
      }

      if (!['Placed', 'Packed'].includes(order.status)) {
        return res.status(400).json({
          message: `Orders can only be cancelled before they are Shipped (current status: ${order.status}).`,
        });
      }

      // Restore stock & release slot capacity
      await restoreStock(order.items);
      await slotClient.releaseSlot({
        pincode: order.pincode,
        date: order.slotDate,
        slotId: order.slotId,
      });

      order.status = 'Cancelled';
      if (order.paymentMethod === 'ONLINE_DEMO' && order.paymentStatus === 'Paid') {
        order.paymentStatus = 'Refunded';
      }
      order.statusHistory.push({
        status: 'Cancelled',
        note: 'Cancelled by customer prior to shipment. Stock and delivery slot released.',
        updatedBy: req.user.name,
      });
      await order.save();

      await Notification.create({
        userId: req.user.id,
        orderId: order._id,
        type: 'order',
        title: `Order ${order.orderNumber} Cancelled`,
        message:
          order.paymentStatus === 'Refunded'
            ? 'Your order has been cancelled and your demo online payment has been marked Refunded.'
            : 'Your order has been cancelled and the reserved delivery slot has been freed.',
      });

      return res.json({ message: 'Order cancelled successfully.', order });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
