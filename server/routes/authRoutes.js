const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const User = require('../models/User');
const { protect, signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication requests from this IP. Please try again after 15 minutes.',
  },
});

const serializeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
});

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 80 })
      .withMessage('Name must be between 2 and 80 characters.'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    body('phone')
      .trim()
      .matches(INDIAN_PHONE_REGEX)
      .withMessage('Phone must be a valid 10-digit Indian mobile number starting with 6-9.'),
    body('password')
      .matches(PASSWORD_REGEX)
      .withMessage(
        'Password must be at least 8 characters and include uppercase, lowercase, and a digit.'
      ),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, phone, password } = req.body;
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        passwordHash,
        role: 'customer',
      });

      const token = signToken(user);
      setAuthCookie(res, token);

      return res.status(201).json({
        message: 'Registration successful.',
        user: serializeUser(user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // Check 5-minute DB account lock
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        return res.status(423).json({
          message: `Account temporarily locked due to too many failed attempts. Retry in ${mins}m ${secs}s.`,
        });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        const nextAttempts = (user.failedAttempts || 0) + 1;
        const update = { failedAttempts: nextAttempts };

        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          update.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
          update.failedAttempts = 0;
          await User.updateOne({ _id: user._id }, { $set: update });
          return res.status(423).json({
            message: 'Account locked for 5 minutes after 5 failed login attempts.',
          });
        }

        await User.updateOne({ _id: user._id }, { $set: update });
        return res.status(401).json({
          message: `Invalid email or password. ${MAX_FAILED_ATTEMPTS - nextAttempts} attempt(s) remaining before temporary lock.`,
        });
      }

      // Reset failedAttempts & lockedUntil on success
      if (user.failedAttempts > 0 || user.lockedUntil) {
        user.failedAttempts = 0;
        user.lockedUntil = null;
        await user.save();
      }

      const token = signToken(user);
      setAuthCookie(res, token);

      return res.json({
        message: 'Login successful.',
        user: serializeUser(user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({ user: serializeUser(user) });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/auth/profile
router.put(
  '/profile',
  protect,
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 80 })
      .withMessage('Name must be between 2 and 80 characters.'),
    body('phone')
      .trim()
      .matches(INDIAN_PHONE_REGEX)
      .withMessage('Phone must be a valid 10-digit Indian mobile number.'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, phone } = req.body;
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: { name, phone } },
        { new: true, runValidators: true }
      ).select('-passwordHash');

      return res.json({
        message: 'Profile updated successfully.',
        user: serializeUser(user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/auth/change-password
router.put(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword')
      .matches(PASSWORD_REGEX)
      .withMessage(
        'New password must be at least 8 characters and include uppercase, lowercase, and a digit.'
      ),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validCurrent) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
      }

      user.passwordHash = await bcrypt.hash(newPassword, 10);
      await user.save();

      return res.json({ message: 'Password updated successfully.' });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
