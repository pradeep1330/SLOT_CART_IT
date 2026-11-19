const express = require('express');
const Category = require('../models/Category');

const router = express.Router();

// GET /api/categories
router.get('/', async (_req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
