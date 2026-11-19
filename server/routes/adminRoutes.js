const express = require('express');
const { body, param, query } = require('express-validator');

const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const Notification = require('../models/Notification');
const slotClient = require('../services/slotClient');
const { VALID_SLOT_IDS, getTodayIST } = require('../config/slotConstants');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// Every route below requires authenticated Admin
router.use(protect, authorize('admin'));

const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const todayIST = getTodayIST(0);

    const [
      totalOrders,
      revenueAgg,
      todaysDeliveries,
      totalProducts,
      lowStockCount,
      totalCustomers,
      recentOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, totalRevenue: { $sum: '$totals.total' } } },
      ]),
      Order.countDocuments({ slotDate: todayIST, status: { $ne: 'Cancelled' } }),
      Product.countDocuments(),
      Product.countDocuments({ stock: { $lte: 5 } }),
      User.countDocuments({ role: 'customer' }),
      Order.find()
        .populate('userId', 'name email')
        .populate('deliveryPartnerId', 'name')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    // Fetch live slot utilization chart data from Python engine (resilient fallback)
    let slotAnalytics = null;
    let slotServiceAvailable = true;
    try {
      slotAnalytics = await slotClient.getUtilizationAnalytics({
        pincode: req.query.pincode || undefined,
        days: 7,
      });
    } catch (err) {
      slotServiceAvailable = false;
      console.warn('[AdminDashboard] Slot analytics fallback:', err.message);
    }

    return res.json({
      stats: {
        totalOrders,
        totalRevenue: revenueAgg[0]?.totalRevenue || 0,
        todaysDeliveries,
        totalProducts,
        lowStockCount,
        totalCustomers,
        todayIST,
      },
      recentOrders,
      slotServiceAvailable,
      slotAnalytics,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/delivery-partners
router.get('/delivery-partners', async (_req, res, next) => {
  try {
    const partners = await User.find({ role: 'delivery' })
      .select('_id name email phone')
      .sort({ name: 1 })
      .lean();
    return res.json({ partners });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/orders
router.get('/orders', async (req, res, next) => {
  try {
    const { status, date, pincode } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = String(status);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) filter.slotDate = String(date);
    if (pincode && /^\d{6}$/.test(String(pincode))) filter.pincode = String(pincode);

    const orders = await Order.find(filter)
      .populate('userId', 'name email phone')
      .populate('deliveryPartnerId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/admin/orders/:id/status
router.patch(
  '/orders/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid order ID.'),
    body('status')
      .optional()
      .isIn([
        'Placed',
        'Packed',
        'Shipped',
        'Out for Delivery',
        'Delivered',
        'Cancelled',
        'Reschedule Requested',
      ])
      .withMessage('Invalid order status.'),
    body('deliveryPartnerId')
      .optional({ nullable: true })
      .custom((v) => v === '' || v === null || /^[0-9a-fA-F]{24}$/.test(v))
      .withMessage('Invalid deliveryPartnerId.'),
    body('note').optional().trim().isLength({ max: 240 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
      }

      const { status, deliveryPartnerId, note } = req.body;
      const previousStatus = order.status;

      if (deliveryPartnerId !== undefined) {
        if (!deliveryPartnerId) {
          order.deliveryPartnerId = null;
        } else {
          const partner = await User.findOne({ _id: deliveryPartnerId, role: 'delivery' });
          if (!partner) {
            return res.status(404).json({ message: 'Delivery partner not found.' });
          }
          order.deliveryPartnerId = partner._id;
        }
      }

      if (status && status !== previousStatus) {
        order.status = status;
        if (status === 'Delivered') {
          order.paymentStatus = 'Paid';
          order.deliveredAt = new Date();
        }
        if (status === 'Cancelled') {
          await slotClient.releaseSlot({
            pincode: order.pincode,
            date: order.slotDate,
            slotId: order.slotId,
          });
          for (const item of order.items) {
            await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
          }
        }

        order.statusHistory.push({
          status,
          note: note || `Order status updated to ${status} by Admin.`,
          updatedBy: req.user.name,
        });

        // Trigger simulated in-app notifications on key milestones
        if (status === 'Out for Delivery') {
          await Notification.insertMany([
            {
              userId: order.userId,
              orderId: order._id,
              type: 'out_for_delivery',
              title: 'Out for delivery, arriving in your slot',
              message: `Order ${order.orderNumber} is out for delivery! ${order.slotDisplayWindow}. Share OTP ${order.otp} at handover.`,
            },
            {
              userId: order.userId,
              orderId: order._id,
              type: 'slot_reminder',
              title: 'Reminder: slot starts in 1 hour',
              message: `Your delivery partner is heading your way for ${order.slotLabel}. Keep OTP ${order.otp} ready.`,
            },
          ]);
        } else if (status === 'Shipped') {
          await Notification.create({
            userId: order.userId,
            orderId: order._id,
            type: 'order',
            title: `Order ${order.orderNumber} Shipped`,
            message: `Your order has been dispatched for ${order.slotDisplayWindow}.`,
          });
        } else if (status === 'Delivered') {
          await Notification.create({
            userId: order.userId,
            orderId: order._id,
            type: 'delivered',
            title: `Order ${order.orderNumber} Delivered`,
            message: 'Your parcel has been delivered safely. Thank you for shopping with SlotKart!',
          });
        }
      }

      await order.save();
      await order.populate('userId', 'name email phone');
      await order.populate('deliveryPartnerId', 'name email phone');

      return res.json({ message: 'Order updated successfully.', order });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/admin/products
router.post(
  '/products',
  [
    body('name').trim().isLength({ min: 2, max: 140 }).withMessage('Product name is required.'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1200 })
      .withMessage('Description must be at least 10 characters.'),
    body('category').isMongoId().withMessage('Valid category ID is required.'),
    body('price').isFloat({ min: 1 }).withMessage('Price must be greater than 0.'),
    body('discount').optional().isFloat({ min: 0, max: 90 }).withMessage('Discount must be 0..90.'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be 0 or more.'),
    body('imageUrl').trim().isURL().withMessage('Valid image URL is required.'),
    body('brand').optional().trim().isLength({ max: 80 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const cat = await Category.findById(req.body.category);
      if (!cat) {
        return res.status(404).json({ message: 'Category not found.' });
      }

      const baseSlug = slugify(req.body.name);
      const uniqueSlug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

      const product = await Product.create({
        name: req.body.name,
        slug: uniqueSlug,
        description: req.body.description,
        brand: req.body.brand || 'SlotKart Select',
        category: req.body.category,
        price: Number(req.body.price),
        discount: Number(req.body.discount || 0),
        stock: Number(req.body.stock),
        imageUrl: req.body.imageUrl,
        isFeatured: Boolean(req.body.isFeatured),
        isDeal: Boolean(req.body.isDeal),
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      });

      await product.populate('category', 'name slug icon');
      return res.status(201).json({ message: 'Product created.', product });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/admin/products/:id
router.put(
  '/products/:id',
  [
    param('id').isMongoId().withMessage('Invalid product ID.'),
    body('name').optional().trim().isLength({ min: 2, max: 140 }),
    body('description').optional().trim().isLength({ min: 10, max: 1200 }),
    body('category').optional().isMongoId(),
    body('price').optional().isFloat({ min: 1 }),
    body('discount').optional().isFloat({ min: 0, max: 90 }),
    body('stock').optional().isInt({ min: 0 }),
    body('imageUrl').optional().trim().isURL(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const allowedFields = [
        'name',
        'description',
        'brand',
        'category',
        'price',
        'discount',
        'stock',
        'imageUrl',
        'isFeatured',
        'isDeal',
      ];
      const updates = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('category', 'name slug icon');

      if (!product) {
        return res.status(404).json({ message: 'Product not found.' });
      }

      return res.json({ message: 'Product updated.', product });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/admin/products/:id
router.delete(
  '/products/:id',
  [param('id').isMongoId().withMessage('Invalid product ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Product not found.' });
      }
      return res.json({ message: 'Product deleted.' });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/admin/categories
router.post(
  '/categories',
  [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Category name is required.'),
    body('description').optional().trim().isLength({ max: 240 }),
    body('icon').optional().trim().isLength({ max: 40 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const category = await Category.create({
        name: req.body.name,
        slug: slugify(req.body.name),
        description: req.body.description || '',
        icon: req.body.icon || 'Package',
      });
      return res.status(201).json({ message: 'Category created.', category });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/admin/categories/:id
router.delete(
  '/categories/:id',
  [param('id').isMongoId().withMessage('Invalid category ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const linkedCount = await Product.countDocuments({ category: req.params.id });
      if (linkedCount > 0) {
        return res.status(400).json({
          message: `Cannot delete category because ${linkedCount} product(s) belong to it.`,
        });
      }
      const deleted = await Category.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Category not found.' });
      }
      return res.json({ message: 'Category deleted.' });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/admin/slots?pincode=&date=  (proxies to Python engine)
router.get(
  '/slots',
  [
    query('pincode')
      .trim()
      .matches(/^\d{6}$/)
      .withMessage('Valid 6-digit pincode is required.'),
    query('date')
      .optional()
      .trim()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Date must be YYYY-MM-DD.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const data = await slotClient.getDaySlots(req.query.pincode, req.query.date);
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/admin/slots/capacity  (proxies to Python PUT /admin/capacity)
router.put(
  '/slots/capacity',
  [
    body('pincode')
      .trim()
      .matches(/^\d{6}$/)
      .withMessage('Valid 6-digit pincode is required.'),
    body('date')
      .trim()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Date must be YYYY-MM-DD.'),
    body('slotId').trim().isIn(VALID_SLOT_IDS).withMessage('Valid slotId is required.'),
    body('capacity').isInt({ min: 0, max: 500 }).withMessage('Capacity must be between 0 and 500.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const updated = await slotClient.updateAdminCapacity({
        pincode: req.body.pincode,
        date: req.body.date,
        slotId: req.body.slotId,
        capacity: Number(req.body.capacity),
      });
      return res.json({ message: 'Slot capacity updated.', slot: updated });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
