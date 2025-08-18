const Credential = require('../models/Credentials');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { isValidObjectId } = require('mongoose');

// ---------- Self (nurse/caretaker) ----------

exports.createMyCredential = asyncHandler(async (req, res) => {
  if (!['nurse', 'caretaker'].includes(req.user.role)) {
    throw new AppError(403, 'Only nurses or caretakers can add credentials');
  }

  const { type, identifier, issuer, issuedAt, expiresAt, notes } = req.body || {};
  if (!type || !identifier) throw new AppError(400, 'type and identifier are required');

  const created = await Credential.create({
    user: req.user._id,
    type, identifier, issuer,
    issuedAt: issuedAt || undefined,
    expiresAt: expiresAt || undefined,
    notes: notes || undefined,
  });
  res.status(201).json({ message: 'Credential created', credential: created });
});

exports.listMyCredentials = asyncHandler(async (req, res) => {
  const items = await Credential.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ items });
});

exports.updateMyCredential = asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  if (!isValidObjectId(credentialId)) throw new AppError(400, 'Invalid credentialId');

  const cred = await Credential.findOne({ _id: credentialId, user: req.user._id });
  if (!cred) throw new AppError(404, 'Credential not found');

  // Users cannot directly alter verification fields
  const { type, identifier, issuer, issuedAt, expiresAt, notes } = req.body || {};
  if (typeof type !== 'undefined') cred.type = type;
  if (typeof identifier !== 'undefined') cred.identifier = identifier;
  if (typeof issuer !== 'undefined') cred.issuer = issuer;
  if (typeof issuedAt !== 'undefined') cred.issuedAt = issuedAt;
  if (typeof expiresAt !== 'undefined') cred.expiresAt = expiresAt;
  if (typeof notes !== 'undefined') cred.notes = notes;

  await cred.save();
  res.status(200).json({ message: 'Credential updated', credential: cred });
});

exports.deleteMyCredential = asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  if (!isValidObjectId(credentialId)) throw new AppError(400, 'Invalid credentialId');

  const deleted = await Credential.findOneAndDelete({ _id: credentialId, user: req.user._id });
  if (!deleted) throw new AppError(404, 'Credential not found');
  res.status(200).json({ message: 'Credential deleted' });
});

// ---------- Admin ----------

exports.adminListCredentials = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const filter = {};
  if (userId) {
    if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');
    filter.user = userId;
  }
  const items = await Credential.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ items });
});

exports.adminVerifyCredential = asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  if (!isValidObjectId(credentialId)) throw new AppError(400, 'Invalid credentialId');

  const cred = await Credential.findById(credentialId);
  if (!cred) throw new AppError(404, 'Credential not found');

  cred.verified = true;
  cred.verifiedBy = req.user._id;
  cred.verifiedAt = new Date();
  await cred.save();

  res.status(200).json({ message: 'Credential verified', credential: cred });
});

exports.adminUnverifyCredential = asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  if (!isValidObjectId(credentialId)) throw new AppError(400, 'Invalid credentialId');

  const cred = await Credential.findById(credentialId);
  if (!cred) throw new AppError(404, 'Credential not found');

  cred.verified = false;
  cred.verifiedBy = null;
  cred.verifiedAt = null;
  await cred.save();

  res.status(200).json({ message: 'Credential unverified', credential: cred });
});

exports.adminDeleteCredential = asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  if (!isValidObjectId(credentialId)) throw new AppError(400, 'Invalid credentialId');

  const deleted = await Credential.findByIdAndDelete(credentialId);
  if (!deleted) throw new AppError(404, 'Credential not found');

  res.status(200).json({ message: 'Credential deleted' });
});
