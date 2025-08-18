/*
// OTP FEATURE (disabled)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const OTPSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  purpose: { type: String, enum: ['login','email_verify','password_reset'], required: true, index: true },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true, versionKey: false });

// TTL (Mongo will auto-expire docs)
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

OTPSchema.methods.setCode = async function (code) {
  const salt = await bcrypt.genSalt(10);
  this.codeHash = await bcrypt.hash(String(code), salt);
};

OTPSchema.methods.verifyCode = async function (code) {
  return bcrypt.compare(String(code), this.codeHash);
};

module.exports = mongoose.model('OTP', OTPSchema);
*/
