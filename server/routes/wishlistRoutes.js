const express = require('express');
const { body } = require('express-validator');

const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// GET /api/wishlist
router.get('/', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate({
      path: 'products',
      populate: { path: 'category', select: 'name slug' },
    });
    return res.json({ products: wishlist ? wishlist.products : [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/wishlist/toggle
router.post(
  '/toggle',
  protect,
  [body('productId').isMongoId().withMessage('Valid productId is required.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId } = req.body;
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found.' });
      }

      let wishlist = await Wishlist.findOne({ userId: req.user.id });
      if (!wishlist) {
        wishlist = new Wishlist({ userId: req.user.id, products: [] });
      }

      const exists = wishlist.products.some((id) => id.toString() === productId);
      if (exists) {
        wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
      } else {
        wishlist.products.push(productId);
      }

      await wishlist.save();
      await wishlist.populate({
        path: 'products',
        populate: { path: 'category', select: 'name slug' },
      });

      return res.json({
        added: !exists,
        message: exists ? 'Removed from wishlist.' : 'Saved to wishlist.',
        products: wishlist.products,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
