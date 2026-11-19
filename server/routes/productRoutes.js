const express = require('express');
const mongoose = require('mongoose');
const { body, query } = require('express-validator');

const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const { protect } = require('../middleware/auth');
const { escapeRegex } = require('../middleware/sanitize');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// GET /api/products
router.get(
  '/',
  [
    query('minPrice').optional().isFloat({ min: 0 }).withMessage('minPrice must be >= 0'),
    query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be >= 0'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1..50'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const {
        search = '',
        category = '',
        minPrice,
        maxPrice,
        sort = 'newest',
        featured,
        deals,
        page = 1,
        limit = 12,
      } = req.query;

      const filter = {};

      if (search && String(search).trim()) {
        const safeRegex = new RegExp(escapeRegex(String(search).trim()), 'i');
        filter.$or = [
          { name: safeRegex },
          { description: safeRegex },
          { brand: safeRegex },
          { tags: safeRegex },
        ];
      }

      if (category && String(category).trim()) {
        const catStr = String(category).trim();
        if (mongoose.Types.ObjectId.isValid(catStr)) {
          filter.category = catStr;
        } else {
          const catDoc = await Category.findOne({ slug: catStr.toLowerCase() }).lean();
          if (catDoc) {
            filter.category = catDoc._id;
          } else {
            return res.json({
              products: [],
              pagination: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 },
            });
          }
        }
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        filter.price = {};
        if (minPrice !== undefined && minPrice !== '') filter.price.$gte = Number(minPrice);
        if (maxPrice !== undefined && maxPrice !== '') filter.price.$lte = Number(maxPrice);
        if (Object.keys(filter.price).length === 0) delete filter.price;
      }

      if (featured === 'true') filter.isFeatured = true;
      if (deals === 'true') filter.isDeal = true;

      let sortOption = { createdAt: -1 };
      if (sort === 'price_asc') sortOption = { price: 1 };
      else if (sort === 'price_desc') sortOption = { price: -1 };
      else if (sort === 'rating') sortOption = { rating: -1, numReviews: -1 };
      else if (sort === 'discount') sortOption = { discount: -1 };

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(50, Math.max(1, Number(limit)));
      const skip = (pageNum - 1) * limitNum;

      const [products, total] = await Promise.all([
        Product.find(filter)
          .populate('category', 'name slug icon')
          .sort(sortOption)
          .skip(skip)
          .limit(limitNum),
        Product.countDocuments(filter),
      ]);

      return res.json({
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/products/:id (accepts Mongo ObjectId or slug)
router.get('/:id', async (req, res, next) => {
  try {
    const idOrSlug = req.params.id;
    const queryObj = mongoose.Types.ObjectId.isValid(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const product = await Product.findOne(queryObj).populate('category', 'name slug icon');
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const reviews = await Review.find({ productId: product._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.json({ product, reviews });
  } catch (err) {
    return next(err);
  }
});

// POST /api/products/:id/reviews
router.post(
  '/:id/reviews',
  protect,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
    body('comment')
      .trim()
      .isLength({ min: 3, max: 600 })
      .withMessage('Review comment must be between 3 and 600 characters.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found.' });
      }

      const { rating, comment } = req.body;
      const review = await Review.findOneAndUpdate(
        { productId: product._id, userId: req.user.id },
        {
          $set: {
            userName: req.user.name,
            rating: Number(rating),
            comment,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Recompute product aggregate rating
      const stats = await Review.aggregate([
        { $match: { productId: product._id } },
        {
          $group: {
            _id: '$productId',
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]);

      if (stats.length > 0) {
        product.rating = Number(stats[0].avgRating.toFixed(1));
        product.numReviews = stats[0].count;
        await product.save();
      }

      return res.status(201).json({
        message: 'Review submitted successfully.',
        review,
        rating: product.rating,
        numReviews: product.numReviews,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
