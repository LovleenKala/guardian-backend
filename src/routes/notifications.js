const express = require('express');
const router = express.Router();

const { createAndEmit, getUserNotifications, markAsRead } = require('../services/notificationService');
// Use your existing auth middleware
const verifyToken = require('../middleware/verifyToken'); 

function getUserIdFromReq(req) {
  return String(
    req.user?.id ||
    req.user?._id ||
    req.user?.userId ||
    req.user?.sub ||
    ''
  );
}

// Create a notification for a user
router.post('/', verifyToken, async (req, res) => {
  try {
    const { userId, title, message } = req.body;
    if (!userId || !title || !message) {
      return res.status(400).json({ message: 'userId, title and message are required.' });
    }
    const notification = await createAndEmit(userId, title, message);
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Error creating notification.', error: err.message });
  }
});

// Get notifications for the authenticated user
router.get('/', verifyToken, async (req, res) => {
  try {
    const authUserId = getUserIdFromReq(req);
    if (!authUserId) return res.status(401).json({ message: 'Unauthorized' });

    const notifications = await getUserNotifications(authUserId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching notifications.', error: err.message });
  }
});

// Mark a notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const updated = await markAsRead(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error updating notification.', error: err.message });
  }
});

module.exports = router;
