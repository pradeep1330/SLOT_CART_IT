const express = require('express');
const { body, param } = require('express-validator');

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FEE = 49;
const GST_RATE = 0.18;

/**
 * Authoritative server-side cart builder & price calculator.
 * Never trusts client-side prices.
 */
const buildCartResponse = async (userId) => {
  const cart = await Cart.findOne({ userId }).populate({
    path: 'items.productId',
    populate: { path: 'category', select: 'name slug' },
  });

  if (!cart || !cart.items.length) {
    return {
      items: [],
      itemCount: 0,
      summary: {
        subtotal: 0,
        gst: 0,
        shipping: 0,
        total: 0,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      },
    };
  }

  const validItems = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const entry of cart.items) {
    const prod = entry.productId;
    if (!prod) continue;
    const finalUnitPrice = Math.round(prod.price * (1 - (prod.discount || 0) / 100));
    const lineTotal = finalUnitPrice * entry.quantity;
    subtotal += lineTotal;
    itemCount += entry.quantity;

    validItems.push({
      productId: prod._id.toString(),
      name: prod.name,
      slug: prod.slug,
      brand: prod.brand,
      imageUrl: prod.imageUrl,
      price: prod.price,
      discount: prod.discount,
      finalUnitPrice,
      stock: prod.stock,
      quantity: entry.quantity,
      lineTotal,
    });
  }

  const gst = Math.round(subtotal * GST_RATE);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + gst + shipping;

  return {
    items: validItems,
    itemCount,
    summary: {
      subtotal,
      gst,
      shipping,
      total,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    },
  };
};

// GET /api/cart
router.get('/', protect, async (req, res, next) => {
  try {
    const payload = await buildCartResponse(req.user.id);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

// POST /api/cart/items
router.post(
  '/items',
  protect,
  [
    body('productId').isMongoId().withMessage('Valid productId is required.'),
    body('quantity')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Quantity must be between 1 and 20.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const qty = Number(quantity);

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found.' });
      }
      if (product.stock < 1) {
        return res.status(400).json({ message: 'This product is currently out of stock.' });
      }

      let cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        cart = new Cart({ userId: req.user.id, items: [] });
      }

      const idx = cart.items.findIndex((i) => i.productId.toString() === productId);
      const newQty = idx > -1 ? cart.items[idx].quantity + qty : qty;

      if (newQty > product.stock) {
        return res.status(400).json({
          message: `Only ${product.stock} unit(s) available in stock for ${product.name}.`,
        });
      }
      if (newQty > 20) {
        return res.status(400).json({ message: 'Maximum 20 units per product allowed.' });
      }

      if (idx > -1) {
        cart.items[idx].quantity = newQty;
      } else {
        cart.items.push({ productId, quantity: newQty });
      }

      await cart.save();
      const payload = await buildCartResponse(req.user.id);
      return res.status(200).json({ message: 'Added to cart.', ...payload });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/cart/items/:productId
router.put(
  '/items/:productId',
  protect,
  [
    param('productId').isMongoId().withMessage('Valid productId is required.'),
    body('quantity').isInt({ min: 0, max: 20 }).withMessage('Quantity must be between 0 and 20.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      const qty = Number(req.body.quantity);

      const cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        return res.status(404).json({ message: 'Cart not found.' });
      }

      if (qty === 0) {
        cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
      } else {
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ message: 'Product not found.' });
        }
        if (qty > product.stock) {
          return res.status(400).json({
            message: `Only ${product.stock} unit(s) left in stock.`,
          });
        }

        const idx = cart.items.findIndex((i) => i.productId.toString() === productId);
        if (idx > -1) {
          cart.items[idx].quantity = qty;
        } else {
          cart.items.push({ productId, quantity: qty });
        }
      }

      await cart.save();
      const payload = await buildCartResponse(req.user.id);
      return res.json({ message: 'Cart updated.', ...payload });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/cart/items/:productId
router.delete(
  '/items/:productId',
  protect,
  [param('productId').isMongoId().withMessage('Valid productId is required.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const cart = await Cart.findOne({ userId: req.user.id });
      if (cart) {
        cart.items = cart.items.filter(
          (i) => i.productId.toString() !== req.params.productId
        );
        await cart.save();
      }
      const payload = await buildCartResponse(req.user.id);
      return res.json({ message: 'Item removed from cart.', ...payload });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/cart
router.delete('/', protect, async (req, res, next) => {
  try {
    await Cart.findOneAndUpdate({ userId: req.user.id }, { $set: { items: [] } });
    const payload = await buildCartResponse(req.user.id);
    return res.json({ message: 'Cart cleared.', ...payload });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.buildCartResponse = buildCartResponse;
