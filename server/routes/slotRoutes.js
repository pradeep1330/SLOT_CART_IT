const express = require('express');
const { query } = require('express-validator');

const slotClient = require('../services/slotClient');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// GET /api/slots?pincode=302001&date=YYYY-MM-DD
router.get(
  '/',
  [
    query('pincode')
      .trim()
      .matches(/^\d{6}$/)
      .withMessage('Pincode must be a valid 6-digit Indian postal code.'),
    query('date')
      .optional()
      .trim()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Date must be in YYYY-MM-DD format.'),
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

// GET /api/slots/week?pincode=302001
router.get(
  '/week',
  [
    query('pincode')
      .trim()
      .matches(/^\d{6}$/)
      .withMessage('Pincode must be a valid 6-digit Indian postal code.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const data = await slotClient.getWeekSlots(req.query.pincode);
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
