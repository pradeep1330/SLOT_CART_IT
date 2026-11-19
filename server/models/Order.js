const mongoose = require('mongoose');
const { VALID_SLOT_IDS } = require('../config/slotConstants');

const orderItemSnapshotSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    finalUnitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String, default: 'system' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSnapshotSchema],
      required: true,
    },
    shippingAddress: {
      label: { type: String, default: 'Home' },
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: { type: String, default: '' },
      landmark: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    status: {
      type: String,
      enum: [
        'Placed',
        'Packed',
        'Shipped',
        'Out for Delivery',
        'Delivered',
        'Cancelled',
        'Reschedule Requested',
      ],
      default: 'Placed',
      index: true,
    },
    totals: {
      subtotal: { type: Number, required: true },
      gst: { type: Number, required: true },
      shipping: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    paymentMethod: {
      type: String,
      enum: ['COD', 'ONLINE_DEMO'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Refunded'],
      default: 'Pending',
    },
    otp: {
      type: String,
      required: true,
      match: /^\d{4}$/,
    },
    slotDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    slotId: {
      type: String,
      required: true,
      enum: VALID_SLOT_IDS,
    },
    slotLabel: {
      type: String,
      required: true,
    },
    slotDisplayWindow: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
      match: /^\d{6}$/,
      index: true,
    },
    rescheduleCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },
    rescheduleRequested: {
      type: Boolean,
      default: false,
    },
    rescheduleReason: {
      type: String,
      default: '',
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ deliveryPartnerId: 1, slotDate: 1 });

module.exports = mongoose.model('Order', orderSchema);
