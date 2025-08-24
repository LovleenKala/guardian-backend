const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ALLOWED_ROLES = ['admin', 'nurse', 'patient', 'caretaker'];

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ALLOWED_ROLES, default: 'patient', index: true },
    isApproved: { type: Boolean, default: false, index: true }, // admin approval gate
    org: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null }, // null => freelancer
    lastPasswordChange: { type: Date, default: Date.now },
    failedLoginAttempts: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

// Hash password on save when changed
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Hash password on findOneAndUpdate if passwordHash is being set
UserSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  if (update.passwordHash) {
    const salt = await bcrypt.genSalt(10);
    update.passwordHash = await bcrypt.hash(update.passwordHash, salt);
    this.setUpdate(update);
  }
  next();
});

// Compare plain text password
UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Hide secrets
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
module.exports.ALLOWED_ROLES = ALLOWED_ROLES;
