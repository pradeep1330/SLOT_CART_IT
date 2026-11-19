const express = require('express');
const { body, param } = require('express-validator');

const Address = require('../models/Address');
const { protect } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const addressValidators = [
  body('label')
    .optional()
    .isIn(['Home', 'Office', 'Other'])
    .withMessage('Label must be Home, Office, or Other.'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Full name must be 2 to 80 characters.'),
  body('phone')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Phone must be a valid 10-digit Indian mobile number.'),
  body('line1')
    .trim()
    .isLength({ min: 4, max: 160 })
    .withMessage('Address line 1 is required.'),
  body('line2').optional().trim().isLength({ max: 160 }),
  body('landmark').optional().trim().isLength({ max: 120 }),
  body('city').trim().isLength({ min: 2, max: 80 }).withMessage('City is required.'),
  body('state').trim().isLength({ min: 2, max: 80 }).withMessage('State is required.'),
  body('pincode')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be a valid 6-digit Indian postal code.'),
  body('isDefault').optional().isBoolean(),
];

// GET /api/addresses
router.get('/', protect, async (req, res, next) => {
  try {
    const addresses = await Address.find({ userId: req.user.id })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
    return res.json({ addresses });
  } catch (err) {
    return next(err);
  }
});

// POST /api/addresses
router.post('/', protect, addressValidators, handleValidation, async (req, res, next) => {
  try {
    const existingCount = await Address.countDocuments({ userId: req.user.id });
    const shouldBeDefault = req.body.isDefault === true || existingCount === 0;

    if (shouldBeDefault) {
      await Address.updateMany({ userId: req.user.id }, { $set: { isDefault: false } });
    }

    const address = await Address.create({
      userId: req.user.id,
      label: req.body.label || 'Home',
      fullName: req.body.fullName,
      phone: req.body.phone,
      line1: req.body.line1,
      line2: req.body.line2 || '',
      landmark: req.body.landmark || '',
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      isDefault: shouldBeDefault,
    });

    return res.status(201).json({ message: 'Address saved.', address });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/addresses/:id
router.put(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid address ID.'), ...addressValidators],
  handleValidation,
  async (req, res, next) => {
    try {
      const address = await Address.findOne({ _id: req.params.id, userId: req.user.id });
      if (!address) {
        return res.status(404).json({ message: 'Address not found.' });
      }

      if (req.body.isDefault === true) {
        await Address.updateMany({ userId: req.user.id }, { $set: { isDefault: false } });
      }

      address.label = req.body.label || address.label;
      address.fullName = req.body.fullName;
      address.phone = req.body.phone;
      address.line1 = req.body.line1;
      address.line2 = req.body.line2 || '';
      address.landmark = req.body.landmark || '';
      address.city = req.body.city;
      address.state = req.body.state;
      address.pincode = req.body.pincode;
      if (typeof req.body.isDefault === 'boolean') {
        address.isDefault = req.body.isDefault;
      }

      await address.save();
      return res.json({ message: 'Address updated.', address });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/addresses/:id
router.delete(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid address ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const deleted = await Address.findOneAndDelete({
        _id: req.params.id,
        userId: req.user.id,
      });
      if (!deleted) {
        return res.status(404).json({ message: 'Address not found.' });
      }

      if (deleted.isDefault) {
        const nextAddr = await Address.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
        if (nextAddr) {
          nextAddr.isDefault = true;
          await nextAddr.save();
        }
      }

      return res.json({ message: 'Address deleted.' });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
