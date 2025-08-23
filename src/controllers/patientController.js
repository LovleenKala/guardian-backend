const { isValidObjectId, Types } = require('mongoose');
const Patient = require('../models/Patient');
const Log = require('../models/Log');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

const { ADMIN_ROSTER_PROJECTION, PATIENT_SELF_PROJECTION } = require('../models/Patient');

// For lists shown to nurses/caretakers (no clinical details)
const PATIENT_LIST_PROJECTION =
  'fullName org assignedNurse assignedCaretaker admittedAt createdAt updatedAt';

// --- helpers ---------------------------------------------------------------

async function loadPatientOr404(patientId) {
  if (!patientId || !isValidObjectId(patientId)) {
    throw new AppError(400, 'Invalid patientId');
  }
  const patient = await Patient.findById(patientId);
  if (!patient) throw new AppError(404, 'Patient not found');
  return patient;
}

function assertAssignedOrThrow(user, patient) {
  const uid = String(user._id);
  const nurse = patient.assignedNurse ? String(patient.assignedNurse) : null;
  const caretaker = patient.assignedCaretaker ? String(patient.assignedCaretaker) : null;
  if (uid !== nurse && uid !== caretaker) {
    throw new AppError(403, 'You are not assigned to this patient');
  }
}

// --- create patient (freelancers only via middleware) ---------------------

/**
 * POST /patients
 * Freelancers (nurse/caretaker with org === null) auto-assign themselves.
 */
exports.createPatient = asyncHandler(async (req, res) => {
  const {
    fullName,
    dateOfBirth,
    guardian,
    emergencyContact,
    medicalSummary,
    description,
    photoUrl,
    admittedAt,
    org, // should be null for freelancers via middleware, but allow explicit null
    user, // optional link to a new/existing user account
  } = req.body || {};

  if (!fullName || !dateOfBirth) {
    throw new AppError(400, 'fullName and dateOfBirth are required');
  }

  const doc = await Patient.create({
    fullName,
    dateOfBirth,
    guardian,
    emergencyContact,
    medicalSummary,
    description,
    photoUrl,
    admittedAt: admittedAt || undefined,
    org: org || null,
    assignedNurse: null,
    assignedCaretaker: null,
    user: user || undefined,
  });

  // Auto-assign if creator is a freelancer
  if (!req.user.org) {
    if (req.user.role === 'nurse') {
      doc.assignedNurse = req.user._id;
    } else if (req.user.role === 'caretaker') {
      doc.assignedCaretaker = req.user._id;
    }
  }

  // Persist any auto-assignment changes
  await doc.save();

  res.status(201).json({ message: 'Patient created', patient: doc });
});

// --- list assigned patients ----------------------------------------------

/**
 * GET /patients/assigned
 * Nurse/Caretaker (verifyRole enforces). Must be assigned to the patient.
 */
exports.listAssignedPatients = asyncHandler(async (req, res) => {
  const { after, limit } = req.query;

  if (req.user.role !== 'nurse' && req.user.role !== 'caretaker') {
    throw new AppError(403, 'Only nurses or caretakers can view assigned patients');
  }

  const filter = {};
  if (req.user.role === 'nurse') filter.assignedNurse = req.user._id;
  if (req.user.role === 'caretaker') filter.assignedCaretaker = req.user._id;

  if (after) {
    if (!isValidObjectId(after)) throw new AppError(400, 'Invalid cursor');
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const items = await Patient.find(filter)
    .select(PATIENT_LIST_PROJECTION)
    .sort({ _id: 1 })
    .limit(pageSize)
    .lean();

  const nextCursor = items.length ? items[items.length - 1]._id : null;
  res.status(200).json({ items, nextCursor, limit: pageSize });
});

// --- Patient self-access ---------------------------------------------------

/**
 * GET /patients/me
 * Patient can view *all* their own data (per your decision).
 */
exports.getMyPatient = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') throw new AppError(403, 'Only patients can access this endpoint');

  const me = await Patient.findOne({ user: req.user._id }).lean();
  if (!me) throw new AppError(404, 'Patient record not found for this user');

  // For now, you allow full data; projection symbol kept for future narrowing
  res.status(200).json({ patient: me });
});

/**
 * GET /patients/me/logs
 * Patient can view all logs for themselves.
 */
exports.getMyLogs = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') throw new AppError(403, 'Only patients can access this endpoint');

  const patient = await Patient.findOne({ user: req.user._id }).lean();
  if (!patient) throw new AppError(404, 'Patient record not found for this user');

  const { after, limit } = req.query;
  const filter = { patient: patient._id };
  if (after) {
    if (!isValidObjectId(after)) throw new AppError(400, 'Invalid cursor');
    filter._id = { $gt: new Types.ObjectId(after) };
  }
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const items = await Log.find(filter)
    .sort({ _id: 1 })
    .limit(pageSize)
    .lean();

  const nextCursor = items.length ? items[items.length - 1]._id : null;
  res.status(200).json({ items, nextCursor, limit: pageSize });
});

// --- Logs (nurse/caretaker) -----------------------------------------------

/**
 * POST /patients/:patientId/logs
 */
exports.createLog = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { title, description, timestamp } = req.body || {};

  const patient = await loadPatientOr404(patientId);
  assertAssignedOrThrow(req.user, patient);

  if (!title || !description || !timestamp) {
    throw new AppError(400, 'title, description, timestamp are required');
  }

  const created = await Log.create({
    title,
    description,
    timestamp: new Date(timestamp),
    patient: patient._id,
    createdBy: req.user._id,
    createdByRole: req.user.role,
  });

  res.status(201).json({ message: 'Log created', log: created });
});

/**
 * GET /patients/:patientId/logs
 */
exports.listLogs = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { after, limit } = req.query;

  const patient = await loadPatientOr404(patientId);
  assertAssignedOrThrow(req.user, patient);

  const filter = { patient: patient._id };
  if (after) {
    if (!isValidObjectId(after)) throw new AppError(400, 'Invalid cursor');
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const items = await Log.find(filter)
    .sort({ _id: 1 })
    .limit(pageSize)
    .lean();

  const nextCursor = items.length ? items[items.length - 1]._id : null;
  res.status(200).json({ items, nextCursor, limit: pageSize });
});

/**
 * DELETE /patients/:patientId/logs/:logId
 * Only author can delete; admins cannot delete.
 */
exports.deleteLog = asyncHandler(async (req, res) => {
  const { patientId, logId } = req.params;
  if (!isValidObjectId(logId)) throw new AppError(400, 'Invalid logId');

  const patient = await loadPatientOr404(patientId);
  assertAssignedOrThrow(req.user, patient);

  const log = await Log.findOne({ _id: logId, patient: patient._id }).lean();
  if (!log) throw new AppError(404, 'Log not found');

  if (String(log.createdBy) !== String(req.user._id)) {
    throw new AppError(403, 'Only the authoring nurse/caretaker can delete this log');
  }

  await Log.deleteOne({ _id: logId });
  res.status(200).json({ message: 'Log deleted' });
});
