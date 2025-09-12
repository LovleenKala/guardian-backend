'use strict';

const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const EntryReport = require('../models/EntryReport');

const {
  calculateAge,
  addAssignedPatient,
  removeAssignedPatient,
} = require('../services/patientService');

const { ensureUserWithRole } = require('../services/userService');

const {
  assertSameOrg,
  findAdminOrg,
  linkCaretakerToOrgIfFreelance,
  isUserInOrg,
  toId, // helper that extracts object id safely
} = require('../services/orgService');

/* --------------------------- helpers --------------------------- */
const toObjectId = (val) => {
  const id = toId(val);
  if (!id) return undefined;
  return new mongoose.Types.ObjectId(String(id));
};

/**
 * Make sure a staff user (nurse/doctor) actually belongs to the org.
 * If not bound yet, but present in org.staff, then we auto-link them.
 * Else, we reject it.
 */
async function ensureStaffBoundToOrg(userDoc, orgDoc) {
  if (!userDoc || !orgDoc) return { ok: false, reason: 'missing' };

  if (assertSameOrg(orgDoc, userDoc)) return { ok: true };

  if (isUserInOrg(userDoc, orgDoc) || isUserInOrg({ _id: userDoc._id }, orgDoc)) {
    const User = require('../models/User');
    await User.updateOne({ _id: userDoc._id }, { $set: { organization: toObjectId(orgDoc._id) } });
    return { ok: true, linked: true };
  }

  return { ok: false, reason: 'not_in_staff' };
}

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /admin/patients:
 *   post:
 *     tags: [AdminPatients]
 *     summary: Create a new patient under caretaker’s org
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrgIdQuery'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientCreateRequest'
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientCreateResponse'
 *       400:
 *         description: Invalid caretaker/nurse/doctor
 *       404:
 *         description: Org not found
 *       500:
 *         description: Error creating patient
 */
exports.createPatient = async (req, res) => {
  try {
    // sanity check → don’t allow client to send org
    if (req.body && typeof req.body === 'object' && 'organization' in req.body) {
      delete req.body.organization;
    }

    const {
      fullname, gender, dateOfBirth,
      caretakerId, nurseId, doctorId,
      image, dateOfAdmitting, description
    } = req.body || {};

    if (!fullname || !gender || !dateOfBirth || !caretakerId) {
      return res.status(400).json({ message: 'fullname, gender, dateOfBirth and caretakerId are required' });
    }

    // caretaker must be valid and have role caretaker
    const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!caretaker) return res.status(400).json({ message: 'caretakerId must be a caretaker' });

    // org is taken from caretaker only (never trust client input)
    let orgId = caretaker.organization;
    if (!orgId) {
      const adminOrg = await findAdminOrg(req.user._id, req.query.orgId);
      if (!adminOrg) return res.status(404).json({ message: 'Organization not found for admin' });

      const User = require('../models/User');
      await User.updateOne({ _id: caretaker._id }, { $set: { organization: adminOrg._id } });
      orgId = adminOrg._id;
    }

    // validate nurse if provided
    let nurse = null;
    if (nurseId) {
      const nd = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nd) return res.status(400).json({ message: 'nurseId must be a nurse' });

      const orgFull = await findAdminOrg(req.user._id, orgId);
      const ensured = await ensureStaffBoundToOrg(nd, orgFull);
      if (!ensured.ok) return res.status(400).json({ message: 'nurseId must be a nurse in this org' });
      nurse = nd;
    }

    // validate doctor if provided
    let doctor = null;
    if (doctorId) {
      const dd = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!dd) return res.status(400).json({ message: 'doctorId must be a doctor' });

      const orgFull = await findAdminOrg(req.user._id, orgId);
      const ensured = await ensureStaffBoundToOrg(dd, orgFull);
      if (!ensured.ok) return res.status(400).json({ message: 'doctorId must be a doctor in this org' });
      doctor = dd;
    }

    // finally create patient
    const patient = await Patient.create({
      fullname,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      organization: orgId,
      caretaker: caretaker._id,
      assignedNurses: nurse ? [nurse._id] : [],
      assignedDoctor: doctor ? doctor._id : null,
      profilePhoto: image || null,
      dateOfAdmitting: dateOfAdmitting ? new Date(dateOfAdmitting) : null,
      description: description || '',
      isDeleted: false
    });

    // maintain reverse links
    await addAssignedPatient(caretaker._id, patient._id);
    if (nurse) await addAssignedPatient(nurse._id, patient._id);
    if (doctor) await addAssignedPatient(doctor._id, patient._id);

    return res.status(201).json({
      message: 'Patient created',
      patient: { ...patient.toObject(), age: calculateAge(patient.dateOfBirth) }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error creating patient', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /admin/patients/{id}/reassign:
 *   put:
 *     tags: [AdminPatients]
 *     summary: Reassign caretaker, nurse, or doctor for a patient
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrgIdQuery'
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReassignRequest'
 *     responses:
 *       200:
 *         description: Assignment updated successfully
 *       400:
 *         description: Invalid ids or role mismatch
 *       403:
 *         description: Patient not under this org
 *       404:
 *         description: Org or patient not found
 */
exports.reassign = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const { nurseId, caretakerId, doctorId } = req.body || {};
    const updates = {};

    // assign nurse
    if (nurseId) {
      const nurse = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nurse) return res.status(400).json({ message: 'nurseId must be a nurse' });
      const ensured = await ensureStaffBoundToOrg(nurse, org);
      if (!ensured.ok) return res.status(400).json({ message: 'nurseId must be a nurse in this org' });

      await Patient.updateOne({ _id: id }, { $addToSet: { assignedNurses: toObjectId(nurse._id) } });
      await addAssignedPatient(nurse._id, patient._id);
    }

    // assign doctor
    if (doctorId) {
      const doctor = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!doctor) return res.status(400).json({ message: 'doctorId must be a doctor' });
      const ensured = await ensureStaffBoundToOrg(doctor, org);
      if (!ensured.ok) return res.status(400).json({ message: 'doctorId must be a doctor in this org' });

      if (patient.assignedDoctor && String(patient.assignedDoctor) !== String(doctor._id)) {
        await removeAssignedPatient(patient.assignedDoctor, patient._id);
      }
      updates.assignedDoctor = toObjectId(doctor._id);
      await addAssignedPatient(doctor._id, patient._id);
    }

    // assign caretaker
    if (caretakerId) {
      const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
      if (!caretaker) return res.status(400).json({ message: 'caretakerId must be a caretaker' });

      const linkResult = await linkCaretakerToOrgIfFreelance(caretaker, org);
      if (linkResult.movedFromOtherOrg) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }
      if (patient.caretaker && String(patient.caretaker) !== String(caretaker._id)) {
        await removeAssignedPatient(patient.caretaker, patient._id);
      }
      updates.caretaker = toObjectId(caretaker._id);
      await addAssignedPatient(caretaker._id, patient._id);
    }

    const updated = await Patient.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    const age = calculateAge(updated?.dateOfBirth);
    return res.status(200).json({ message: 'Assignments updated', patient: { ...updated.toObject(), age } });
  } catch (err) {
    return res.status(500).json({ message: 'Error reassigning', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /admin/patients:
 *   get:
 *     tags: [AdminPatients]
 *     summary: List patients for admin org
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrgIdQuery'
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search text (matches fullname, case-insensitive)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: List of patients with pagination
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientListResponse'
 *       404:
 *         description: Org not found
 */
exports.listPatients = async (req, res) => {
  try {
    const { orgId, q, page = 1, limit = 10, active = 'true' } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const text = q ? { fullname: new RegExp(q, 'i') } : {};
    const filter = {
      organization: toObjectId(org._id),
      isDeleted: String(active).toLowerCase() === 'false' ? true : false,
      ...text,
    };

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [docs, total] = await Promise.all([
      Patient.find(filter)
        .populate('caretaker', 'fullname email')
        .populate('assignedNurses', 'fullname email')
        .populate('assignedDoctor', 'fullname email')
        .sort({ created_at: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Patient.countDocuments(filter),
    ]);

    const patients = docs.map(d => ({ ...d, age: calculateAge(d.dateOfBirth) }));

    return res.status(200).json({
      patients,
      pagination: { total, page: p, pages: Math.ceil(total / l), limit: l },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error listing patients', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /admin/patients/{id}/overview:
 *   get:
 *     tags: [AdminPatients]
 *     summary: Get patient full overview (records, care plan, tasks, logs)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrgIdQuery'
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     responses:
 *       200:
 *         description: Full patient overview
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
exports.patientOverview = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id)
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const [healthRecords, carePlan, tasks, logs] = await Promise.all([
      HealthRecord.find({ patient: id }).sort({ created_at: -1 }).lean(),
      CarePlan.findOne({ patient: id }).populate('tasks').lean(),
      Task.find({ patient: id }).lean(),
      EntryReport.find({ patient: id }).sort({ activityTimestamp: -1 }).lean(),
    ]);

    const taskCompletionRate = tasks.length
      ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100
      : 0;

    const age = calculateAge(patient.dateOfBirth);

    return res.status(200).json({
      patient: { ...patient.toObject(), age },
      healthRecords,
      carePlan,
      tasks,
      logs,
      taskCompletionRate,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching patient overview', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /admin/patients/{id}:
 *   delete:
 *     tags: [AdminPatients]
 *     summary: Deactivate a patient (soft delete)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrgIdQuery'
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     responses:
 *       200:
 *         description: Patient deactivated
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
exports.deactivatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    await Patient.findByIdAndUpdate(id, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    });

    await Promise.all([
      patient.caretaker ? removeAssignedPatient(patient.caretaker, id) : Promise.resolve(),
      ...(patient.assignedNurses || []).map(nId => removeAssignedPatient(nId, id)),
      patient.assignedDoctor ? removeAssignedPatient(patient.assignedDoctor, id) : Promise.resolve(),
    ]);

    return res.status(200).json({ message: 'Patient deactivated' });
  } catch (err) {
    return res.status(500).json({ message: 'Error deactivating patient', details: err.message });
  }
};
