const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notification_type: { type: String, required: true },
  message: { type: String, required: true },
  sent_at: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;