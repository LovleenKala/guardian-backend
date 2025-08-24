const { isValidObjectId } = require('mongoose');
const User = require('../models/User');

async function filterUsersByRole(role, { q, limit = 50, offset = 0 } = {}) {
  const filter = { role };
  if (q) filter.$or = [{ fullName: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
  const total = await User.countDocuments(filter);
  const items = await User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(Math.min(limit, 200));
  return { total, items };
}

async function updateUserRoleById(userId, newRole) {
  if (!isValidObjectId(userId)) throw new Error('Invalid userId');
  return User.findByIdAndUpdate(userId, { role: newRole }, { new: true, runValidators: true });
}

async function resetUserPasswordById(userId, newPlainPassword = 'Reset#1234') {
  if (!isValidObjectId(userId)) throw new Error('Invalid userId');
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) return null;
  user.passwordHash = newPlainPassword; // pre-save hook should hash
  user.lastPasswordChange = new Date();
  user.failedLoginAttempts = 0;
  await user.save();
  return user;
}

async function deleteUserById(userId) {
  if (!isValidObjectId(userId)) throw new Error('Invalid userId');
  const res = await User.deleteOne({ _id: userId });
  return res.deletedCount > 0;
}

module.exports = { filterUsersByRole, updateUserRoleById, resetUserPasswordById, deleteUserById };