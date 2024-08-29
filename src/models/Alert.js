const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alert_type: { type: String, required: true },   
  message: { type: String, required: true },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const Alert = mongoose.model('Alert', AlertSchema);

module.exports = Alert;