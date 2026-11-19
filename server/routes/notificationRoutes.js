const express = require('express');
const { param } = require('express-validator');

const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

// GET /api/notifications
router.get('/', protect, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return res.json({ notifications, unreadCount });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', protect, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch(
  '/:id/read',
  protect,
  [param('id').isMongoId().withMessage('Invalid notification ID.')],
  handleValidation,
  async (req, res, next) => {
    try {
      const updated = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $set: { isRead: true } },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ message: 'Notification not found.' });
      }
      return res.json({ notification: updated });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
