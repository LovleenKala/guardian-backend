'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const { ensureUserWithRole } = require('../services/userService');
const { findAdminOrg, addUserToOrgStaff, removeUserFromOrgStaff } = require('../services/orgService');

/**
 * @swagger
 * tags:
 *   - name: Admin - Staff
 *     description: Admin org staff (nurses/doctors) management
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff:
 *   get:
 *     summary: List staff (nurses/doctors) for an admin org
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         schema: { type: string }
 *         description: Optional org ID (if admin owns multiple orgs)
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [nurse, doctor] }
 *         description: Only fetch staff of a certain role
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by fullname/email
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated staff list
 *       404:
 *         description: Organization not found for admin
 */
exports.listStaff = async (req, res) => {
  try {
    const { orgId, role, q, page = 1, limit = 10 } = req.query;
    // make sure org belongs to this admin
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const p = parseInt(page, 10);
    const l = Math.min(100, parseInt(limit, 10));

    // base filter: user must be inside org.staff array
    const baseFilter = { _id: { $in: org.staff } };

    // add search filter if q provided
    if (q) {
      baseFilter.$or = [
        { fullname: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') }
      ];
    }

    // add role filter if role provided
    let roleFilter = {};
    if (role) {
      const roleDoc = await Role.findOne({ name: role.toLowerCase() }).lean();
      if (roleDoc) roleFilter.role = roleDoc._id;
      else {
        return res.status(200).json({ staff: [], pagination: { total: 0, page: p, pages: 0, limit: l } });
      }
    }

    const filter = { ...baseFilter, ...roleFilter };

    const [staff, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash -__v')
        .populate('role', 'name')
        .populate('organization', 'name')
        .sort({ fullname: 1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      staff,
      pagination: { total, page: p, pages: Math.ceil(total / l), limit: l }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error listing staff', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff:
 *   post:
 *     summary: Add a nurse/doctor into the org staff
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         schema: { type: string }
 *         description: Optional org ID (admin-scoped)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: 
 *                 type: string
 *                 description: User must already exist with role nurse or doctor
 *     responses:
 *       200:
 *         description: Staff member successfully added
 *       400:
 *         description: Invalid role
 *       404:
 *         description: Org or user not found
 */
exports.addStaff = async (req, res) => {
  try {
    const { orgId } = req.query;
    const { userId } = req.body;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    // validate: only nurse or doctor allowed
    const nurse = await ensureUserWithRole(userId, 'nurse');
    const doctor = nurse ? null : await ensureUserWithRole(userId, 'doctor');
    const user = nurse || doctor;

    if (!user) {
      return res.status(400).json({ message: 'User must have role nurse or doctor' });
    }

    // push user into org.staff and set their org if missing
    const updatedOrg = await addUserToOrgStaff(org._id, user._id);

    res.status(200).json({ message: 'Staff member added', organization: updatedOrg });
  } catch (err) {
    res.status(500).json({ message: 'Error adding staff', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/staff/{id}/deactivate:
 *   put:
 *     summary: Remove a nurse/doctor from org staff
 *     tags: [Admin - Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User ID (nurse/doctor)
 *       - in: query
 *         name: orgId
 *         schema: { type: string }
 *         description: Optional org ID (must belong to this admin)
 *     responses:
 *       200:
 *         description: Staff member removed
 *       404:
 *         description: Org or user not found
 */
exports.deactivateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const user = await User.findById(id).populate('role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // remove user from org.staff + unlink their org if needed
    const updatedOrg = await removeUserFromOrgStaff(org._id, user._id, user.organization);

    res.status(200).json({ message: 'Staff member removed', organization: updatedOrg });
  } catch (err) {
    res.status(500).json({ message: 'Error removing staff', details: err.message });
  }
};
