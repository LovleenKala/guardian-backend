const Notification = require('../models/Notification');
const { emitToUser } = require('../../socket');


async function createAndEmit(userId, title, message) {
  const notification = new Notification({ userId: String(userId), title, message });
  await notification.save();

  emitToUser(String(userId), 'notification:new', {
    id: String(notification._id),
    title: notification.title,
    message: notification.message,
    createdAt: notification.createdAt
  });

  return notification;
}

function getUserNotifications(userId) {
  return Notification.find({ userId: String(userId) }).sort({ createdAt: -1 });
}

function markAsRead(notificationId) {
  return Notification.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
}

module.exports = { createAndEmit, getUserNotifications, markAsRead };
