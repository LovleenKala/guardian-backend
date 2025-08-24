const { isValidObjectId, Types } = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

const { createTicket, getTickets, updateTicket } = require('../services/supportTicketService');

const { ADMIN_ROSTER_PROJECTION } = require('../models/Patient');

// --- Support tickets ---
exports.createSupportTicket = asyncHandler(async (req, res) => {
  const { subject, description, status } = req.body || {};
  if (!subject || !description) {
    throw new AppError(422, 'subject and description are required');
  }
  const ticket = await createTicket({
    user: req.user._id,
    subject,
    description,
    status,
    createdBy: { user: req.user._id, timestamp: new Date() }
  });
  res.status(201).json({ message: 'Ticket created', ticket });
});

exports.listSupportTickets = asyncHandler(async (req, res) => {
  const tickets = await getTickets(req.query);
  res.status(200).json(tickets);
});

exports.updateSupportTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  if (!isValidObjectId(ticketId)) throw new AppError(400, 'Invalid ticketId');

  const ticket = await updateTicket(ticketId, req.body, {
    actorId: req.user._id,
    role: req.user.role,
    audit: { user: req.user._id, timestamp: new Date() }
  });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  res.status(200).json({ message: 'Ticket updated', ticket });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { role, query, isApproved, limit = 50, after } = req.query;

  const filter = {};
  const SEARCHABLE_ROLES = ['admin', 'nurse', 'patient', 'caretaker'];

  if (role) {
    const roleFilter = String(role).toLowerCase().trim();
    if (!SEARCHABLE_ROLES.includes(roleFilter)) {
      throw new AppError(400, `Unknown role: ${role}`);
    }
    filter.role = roleFilter;
  }

  if (typeof isApproved !== 'undefined') {
    if (isApproved === true || isApproved === 'true') {
      filter.isApproved = true;
    } else if (isApproved === false || isApproved === 'false') {
      filter.isApproved = false;
    } else {
      throw new AppError(400, 'isApproved must be true/false');
    }
  }

  if (query && String(query).trim()) {
    const q = String(query).trim();
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }

  if (after) {
    if (!isValidObjectId(after)) throw new AppError(400, 'Invalid cursor');
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const users = await User.find(filter)
    .sort({ _id: 1 })
    .limit(pageSize)
    .lean();

  const nextCursor = users.length ? users[users.length - 1]._id : null;
  res.status(200).json({ items: users, nextCursor, limit: pageSize });
});

exports.listPatientsRoster = asyncHandler(async (req, res) => {
  const { orgId, nurseId, caretakerId, limit = 50, after } = req.query;
  const filter = {};
  if (orgId) filter.org = orgId;
  if (nurseId) filter.assignedNurse = nurseId;
  if (caretakerId) filter.assignedCaretaker = caretakerId;
  if (after) {
    if (!isValidObjectId(after)) throw new AppError(400, 'Invalid cursor');
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const items = await Patient.find(filter)
    .select(ADMIN_ROSTER_PROJECTION)
    .sort({ _id: 1 })
    .limit(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200))
    .lean();

  const nextCursor = items.length ? items[items.length - 1]._id : null;
  res.status(200).json({ items, nextCursor, limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) });
});

// ---------------------- Assignments with strict rules ----------------------

/**
 * PUT /admin/patients/:patientId/assign   (also POST /admin/assignments)
 * body: { patientId, nurseId?, caretakerId? }
 * Rules:
 *  - assignees must exist, have role nurse/caretaker respectively, and be isApproved
 *  - the same user cannot be both nurse and caretaker simultaneously
 *  - if patient.org is set => assignee.org must match patient.org
 *  - if patient.org is null => assignee.org must be null (freelancers-only patient)
 */
exports.assignPatient = asyncHandler(async (req, res) => {
  // Resolve patientId, nurseId, caretakerId from path → query → body
  const patientId   = req.params.patientId ?? req.query.patientId ?? req.body.patientId;
  const nurseId     = req.query.nurseId     ?? req.body.nurseId;
  const caretakerId = req.query.caretakerId ?? req.body.caretakerId;

  if (!isValidObjectId(patientId)) throw new AppError(400, 'Invalid patientId');

  if (!nurseId && !caretakerId) throw new AppError(400, 'Provide nurseId and/or caretakerId');

  if (nurseId && !isValidObjectId(nurseId)) throw new AppError(400, 'Invalid nurseId');
  if (caretakerId && !isValidObjectId(caretakerId)) throw new AppError(400, 'Invalid caretakerId');

  if (nurseId && caretakerId && nurseId === caretakerId) {
    throw new AppError(400, 'The same user cannot be both nurse and caretaker');
  }

  const patient = await Patient.findById(patientId);
  if (!patient) throw new AppError(404, 'Patient not found');

  let nurse = null, caretaker = null;

  if (nurseId) {
    nurse = await User.findById(nurseId).lean();
    if (!nurse || nurse.role !== 'nurse') throw new AppError(400, 'nurseId must be a valid nurse user');
    if (!nurse.isApproved) throw new AppError(403, 'Nurse is not approved');
  }
  if (caretakerId) {
    caretaker = await User.findById(caretakerId).lean();
    if (!caretaker || caretaker.role !== 'caretaker') throw new AppError(400, 'caretakerId must be a valid caretaker user');
    if (!caretaker.isApproved) throw new AppError(403, 'Caretaker is not approved');
  }

  // Org coherence
  const pOrg = patient.org || null;
  const nurseOrg = nurse ? nurse.org || null : null;
  const caretakerOrg = caretaker ? caretaker.org || null : null;

  if (pOrg) {
    if (nurse && String(nurseOrg) !== String(pOrg)) throw new AppError(403, 'Nurse must belong to the patient’s organisation');
    if (caretaker && String(caretakerOrg) !== String(pOrg)) throw new AppError(403, 'Caretaker must belong to the patient’s organisation');
  } else {
    if (nurse && nurseOrg) throw new AppError(403, 'Freelance patient cannot be assigned an organisation nurse');
    if (caretaker && caretakerOrg) throw new AppError(403, 'Freelance patient cannot be assigned an organisation caretaker');
  }

  // Apply assignment
  if (nurse) patient.assignedNurse = nurse._id;
  if (caretaker) patient.assignedCaretaker = caretaker._id;
  await patient.save();

  res.status(200).json({ message: 'Assignment updated', patient });
});

// ------------------------ Role approve / revoke / update / reset / delete --------------------
exports.approveUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');
  if (String(req.user._id) === userId) throw new AppError(400, 'Cannot modify your own approval status');

  const user = await User.findByIdAndUpdate(
    userId,
    { isApproved: true },
    { new: true }
  );
  if (!user) throw new AppError(404, 'User not found');
  res.status(200).json({ message: 'User approved', user });
});

exports.revokeUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');
  if (String(req.user._id) === userId) throw new AppError(400, 'Cannot modify your own approval status');

  const user = await User.findByIdAndUpdate(
    userId,
    { isApproved: false },
    { new: true }
  );
  if (!user) throw new AppError(404, 'User not found');
  res.status(200).json({ message: 'User access revoked', user });
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { newRole } = req.body || {};
  if (String(req.user._id) === String(userId)) throw new AppError(400, 'Cannot change your own role');
  if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');
  if (!['admin','nurse','patient','caretaker'].includes(newRole)) throw new AppError(400, 'Invalid role');

  const updated = await User.findByIdAndUpdate(userId, { role: newRole }, { new: true });
  if (!updated) throw new AppError(404, 'User not found');
  res.status(200).json({ message: 'User role updated', user: updated });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');

  // Generate a temporary password; force change on next login
  const tmp = Math.random().toString(36).slice(-10) + 'A1!';

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AppError(404, 'User not found');

  user.passwordHash = tmp; // pre-save hook should hash
  user.lastPasswordChange = new Date();
  user.failedLoginAttempts = 0;
  await user.save();

  res.status(200).json({ message: 'Password reset to temporary value; user must change on next login' });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new AppError(400, 'Invalid userId');
  await User.deleteOne({ _id: userId });
  res.status(200).json({ message: 'User deleted' });
});

// -------------------------- Directory metrics -----------------------------

exports.getDirectoryMetrics = asyncHandler(async (_req, res) => {
  const [patients, nurses, caretakers] = await Promise.all([
    Patient.countDocuments(),
    User.countDocuments({ role: 'nurse' }),
    User.countDocuments({ role: 'caretaker' }),
  ]);
  res.status(200).json({ patients, nurses, caretakers });
});
