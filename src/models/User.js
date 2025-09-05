// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ProviderSub = new mongoose.Schema(
  {
    id: { type: String, index: true },
    linkedAt: { type: Date },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, trim: true, lowercase: true },

  // Allow social accounts without passwords
  password_hash: { type: String, required: false },

  // Whether a local password has been set
  passwordSet: { type: Boolean, default: false },

  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },

  assignedPatients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],

  lastPasswordChange:   { type: Date, default: null },
  failedLoginAttempts:  { type: Number, default: 0 },

  // Record login source/bound provider
  providers: [{ type: String, enum: ['local', 'facebook', 'google'] }],
  facebook:  ProviderSub,
  google:    ProviderSub,

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Index (to facilitate lookup/merging by providerId)
UserSchema.index({ 'facebook.id': 1 }, { sparse: true });
UserSchema.index({ 'google.id': 1 },   { sparse: true });

// Unified mailbox writing format
UserSchema.pre('validate', function (next) {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  next();
});

// Hash only if password is provided and modified
UserSchema.pre('save', async function (next) {
  this.updated_at = Date.now();

  if (!this.isModified('password_hash')) return next();
  if (!this.password_hash)               return next(); // 社交注册：无密码，直接跳过

  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
  this.passwordSet = true;
  this.lastPasswordChange = Date.now();
  next();
});

// Example method: Verify password (for local login)
UserSchema.methods.comparePassword = async function (plain) {
  if (!this.password_hash) return false;
  return bcrypt.compare(plain, this.password_hash);
};

// Example method: set/update password (such as "first time password setting" or password change)
UserSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(plain, salt);
  this.passwordSet = true;
  this.lastPasswordChange = Date.now();
  return this.save();
};

// Hide sensitive fields when outputting to the client
UserSchema.set('toJSON', {
  transform: (_, ret) => {
    delete ret.password_hash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', UserSchema);
