const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendPasswordResetEmail } = require('../utils/mailer');

/**
 * Helpers
 */
function signToken(user) {
  return jwt.sign(
    { _id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * POST /auth/register
 */
exports.registerUser = asyncHandler(async (req, res) => {
  const { fullname, fullName, name, email, password } = req.body;

  const displayName = (fullName || fullname || name || '').trim();
  if (!displayName || !email || !password) {
    throw new AppError(400, 'fullName, email and password are required');
  }

  const emailNorm = String(email).toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNorm)) throw new AppError(400, 'Invalid email');

  const exists = await User.findOne({ email: emailNorm }).lean();
  if (exists) throw new AppError(409, 'Email already registered');

  const user = await User.create({
    fullName: displayName,
    email: emailNorm,
    passwordHash: password,
    role: 'patient',     // default
    isApproved: false,   // approval gate
    org: null,           // default to freelancer
  });

  const token = signToken(user);
  res.status(201).json({
    message: 'Registered successfully',
    user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role, org: user.org, isApproved: user.isApproved },
    token,
  });
});

/**
 * POST /auth/login
 */
exports.login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const { password } = req.body;
  if (!email || !password) throw new AppError(400, 'Email and password are required');

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) throw new AppError(400, 'User not found');

  if (user.failedLoginAttempts > 4) {
    throw new AppError(400, 'Your account is locked. Please reset your password.');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    await user.save();
    throw new AppError(400, 'Incorrect email and password combination');
  }

  if (!user.isApproved) throw new AppError(403, 'Account pending approval');

  user.failedLoginAttempts = 0;
  await user.save();

  const token = signToken(user);
  res.status(200).json({
    message: 'Login successful',
    user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role, org: user.org, isApproved: user.isApproved },
    token,
  });
});

/**
 * PATCH /auth/profile
 * Freelancers (org === null) can self-update limited fields.
 * Org members must raise a support ticket (return 403).
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const me = await User.findById(userId);
  if (!me) throw new AppError(404, 'User not found');

  if (me.org) {
    throw new AppError(403, 'Profile changes for organisation members must be requested via support ticket');
  }

  const { fullName, email } = req.body;
  const update = {};

  if (typeof fullName === 'string' && fullName.trim()) update.fullName = fullName.trim();
  if (typeof email === 'string' && email.trim()) {
    const emailNorm = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNorm)) throw new AppError(400, 'Invalid email');
    update.email = emailNorm;
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }

  const updated = await User.findByIdAndUpdate(userId, update, { new: true });
  res.status(200).json({
    message: 'Profile updated',
    user: { _id: updated._id, fullName: updated.fullName, email: updated.email, role: updated.role, org: updated.org, isApproved: updated.isApproved },
  });
});

/**
 * POST /auth/change-password
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  if (!oldPassword || !newPassword || !confirmPassword)
    throw new AppError(400, 'All fields are required');
  if (newPassword !== confirmPassword)
    throw new AppError(400, 'New password and confirmation do not match');

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw new AppError(404, 'User not found');

  const ok = await user.comparePassword(oldPassword);
  if (!ok) throw new AppError(400, 'Incorrect old password');

  user.passwordHash = newPassword; // pre-save will hash
  user.lastPasswordChange = Date.now();
  user.failedLoginAttempts = 0;
  await user.save();

  res.status(200).json({ message: 'Password changed successfully' });
});

/**
 * POST /auth/reset-password-request
 * Sends an email with a signed token link to reset.
 */
exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email) throw new AppError(400, 'Email is required');

  const user = await User.findOne({ email }).lean();
  if (!user) {
    // Do not reveal whether the email exists
    return res.status(200).json({ message: 'If that account exists, you will receive an email shortly' });
  }

  const token = jwt.sign(
    { _id: user._id, purpose: 'reset' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  await sendPasswordResetEmail(email, user?.fullName || email, token);

  res.status(200).json({ message: 'If that account exists, you will receive an email shortly' });
});

/**
 * GET /auth/reset-password
 * If you render a page, do it here. For API clients, just validate the token.
 */
exports.renderPasswordResetPage = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw new AppError(400, 'Missing token');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'reset') throw new Error();
    return res.status(200).json({ message: 'Token valid', userId: payload._id });
  } catch {
    throw new AppError(400, 'Invalid or expired token');
  }
});

/**
 * POST /auth/reset-password
 * { token, newPassword, confirmPassword }
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body || {};
  if (!token || !newPassword || !confirmPassword) throw new AppError(400, 'All fields are required');
  if (newPassword !== confirmPassword) throw new AppError(400, 'New password and confirmation do not match');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'reset') throw new Error();
  } catch {
    throw new AppError(400, 'Invalid or expired token');
  }

  const user = await User.findById(payload._id).select('+passwordHash');
  if (!user) throw new AppError(404, 'User not found');

  user.passwordHash = newPassword;
  user.lastPasswordChange = Date.now();
  user.failedLoginAttempts = 0;
  await user.save();

  res.status(200).json({ message: 'Password has been reset' });
});
