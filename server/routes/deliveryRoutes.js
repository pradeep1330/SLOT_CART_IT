const express = require('express');
const crypto = require('crypto');
const { body, param } = require('express-validator');

const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { SLOT_MAP, getTodayIST, maskPhone } = require('../config/slotConstants');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// Every route below requires authenticated Delivery Partner
router.use(protect, authorize('delivery'));

/**
 * Strip raw OTP and mask customer phone before sending to Delivery Partner.
 */
const serializeDeliveryOrder = (order) => {
  const slotMeta = SLOT_MAP[order.slotId] || { startHour: 24 };
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    slotDate: order.slotDate,
    slotId: order.slotId,
    slotLabel: order.slotLabel,
    slotDisplayWindow: order.slotDisplayWindow,
    slotStartHour: slotMeta.startHour,
    pincode: order.pincode,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    totals: order.totals,
    items: order.items,
    rescheduleCount: order.rescheduleCount,
    rescheduleRequested: order.rescheduleRequested,
    shippingAddress: {
      ...order.shippingAddress,
      phone: maskPhone(order.shippingAddress?.phone),
    },
    customerName: order.shippingAddress?.fullName || order.userId?.name || 'Customer',
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
  };
};

// GET /api/delivery/orders
router.get('/orders', async (req, res, next) => {
  try {
    const todayIST = getTodayIST(0);
    const orders = await Order.find({
      deliveryPartnerId: req.user.id,
      status: { $ne: 'Cancelled' },
    })
      .populate('userId', 'name')
      .lean();

    const sanitized = orders.map(serializeDeliveryOrder).sort((a, b) => {
      if (a.slotDate !== b.slotDate) return a.slotDate.localeCompare(b.slotDate);
      return a.slotStartHour - b.slotStartHour;
    });

    const todaysOrders = sanitized.filter((o) => o.slotDate === todayIST);
    const upcomingOrders = sanitized.filter((o) => o.slotDate > todayIST);
    const completedOrders = sanitized.filter((o) => o.status === 'Delivered');

    return res.json({
      todayIST,
      orders: sanitized,
      todaysOrders,
      upcomingOrders,
      completedOrders,
    });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/delivery/orders/:id/out-for-delivery
router.patch(
  '/orders/:id/out-for-delivery',
  [param('id').isMongoId().withMessage('Invalid order ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findOne({
        _id: req.params.id,
        deliveryPartnerId: req.user.id,
      });

      if (!order) {
        return res.status(404).json({ message: 'Assigned order not found.' });
      }

      if (['Delivered', 'Cancelled'].includes(order.status)) {
        return res.status(400).json({ message: `Order is already ${order.status}.` });
      }

      order.status = 'Out for Delivery';
      order.statusHistory.push({
        status: 'Out for Delivery',
        note: `Delivery partner ${req.user.name} started delivery for slot ${order.slotLabel}.`,
        updatedBy: req.user.name,
      });
      await order.save();

      await Notification.insertMany([
        {
          userId: order.userId,
          orderId: order._id,
          type: 'out_for_delivery',
          title: 'Out for delivery, arriving in your slot',
          message: `${req.user.name} is on the way! ${order.slotDisplayWindow}. Share OTP ${order.otp} at handover.`,
        },
        {
          userId: order.userId,
          orderId: order._id,
          type: 'slot_reminder',
          title: 'Reminder: slot starts in 1 hour',
          message: `Be available during ${order.slotLabel} for order ${order.orderNumber}.`,
        },
      ]);

      return res.json({
        message: 'Order marked Out for Delivery. Customer notified.',
        order: serializeDeliveryOrder(order.toObject()),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/delivery/orders/:id/deliver  (Verify 4-digit OTP)
router.post(
  '/orders/:id/deliver',
  [
    param('id').isMongoId().withMessage('Invalid order ID.'),
    body('otp')
      .trim()
      .matches(/^\d{4}$/)
      .withMessage('Please enter a valid 4-digit delivery OTP.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findOne({
        _id: req.params.id,
        deliveryPartnerId: req.user.id,
      });

      if (!order) {
        return res.status(404).json({ message: 'Assigned order not found.' });
      }

      if (order.status === 'Delivered') {
        return res.status(400).json({ message: 'Order has already been delivered.' });
      }

      if (order.status === 'Cancelled') {
        return res.status(400).json({ message: 'Cancelled orders cannot be delivered.' });
      }

      const providedBuf = Buffer.from(String(req.body.otp), 'utf8');
      const expectedBuf = Buffer.from(String(order.otp), 'utf8');
      const otpMatches =
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!otpMatches) {
        return res.status(400).json({
          message: 'Invalid 4-digit OTP. Please verify the code with the customer.',
        });
      }

      order.status = 'Delivered';
      order.paymentStatus = 'Paid';
      order.deliveredAt = new Date();
      order.rescheduleRequested = false;
      order.statusHistory.push({
        status: 'Delivered',
        note: `Delivered on time in slot ${order.slotLabel}. 4-digit OTP verified by ${req.user.name}.`,
        updatedBy: req.user.name,
      });
      await order.save();

      await Notification.create({
        userId: order.userId,
        orderId: order._id,
        type: 'delivered',
        title: `Order ${order.orderNumber} Delivered`,
        message: `Delivered safely during your chosen window (${order.slotLabel}). Thank you for using SlotKart!`,
      });

      return res.json({
        message: 'OTP verified! Order marked as Delivered.',
        order: serializeDeliveryOrder(order.toObject()),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/delivery/orders/:id/unavailable  (Triggers "Reschedule instead of Return")
router.post(
  '/orders/:id/unavailable',
  [
    param('id').isMongoId().withMessage('Invalid order ID.'),
    body('reason').optional().trim().isLength({ max: 200 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findOne({
        _id: req.params.id,
        deliveryPartnerId: req.user.id,
      });

      if (!order) {
        return res.status(404).json({ message: 'Assigned order not found.' });
      }

      if (['Delivered', 'Cancelled'].includes(order.status)) {
        return res.status(400).json({
          message: `Cannot mark unavailable for a ${order.status} order.`,
        });
      }

      const reason =
        req.body.reason || 'Customer unavailable at doorstep during the scheduled delivery slot.';

      order.status = 'Reschedule Requested';
      order.rescheduleRequested = true;
      order.rescheduleReason = reason;
      order.statusHistory.push({
        status: 'Reschedule Requested',
        note: `${reason} Triggered "Reschedule instead of Return" for customer.`,
        updatedBy: req.user.name,
      });
      await order.save();

      await Notification.create({
        userId: order.userId,
        orderId: order._id,
        type: 'reschedule',
        title: 'We missed you! Reschedule instead of Return',
        message: `Delivery attempt for ${order.orderNumber} (${order.slotLabel}) could not be completed. Pick a new convenient 2-hour slot from My Orders so we do not return your parcel.`,
      });

      return res.json({
        message: 'Marked Customer Unavailable. Customer notified to reschedule instead of return.',
        order: serializeDeliveryOrder(order.toObject()),
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
