'use strict';

const Organization = require('../models/Organization');

/**
 * @swagger
 * tags:
 *   - name: Organization
 *     description: Endpoints for creating and listing organizations (admin only)
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs:
 *   post:
 *     summary: Create a new organization
 *     description: Admins can spin up a fresh org. The creator becomes the `createdBy` and is auto-added into `staff`.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Guardian Health Org
 *               description:
 *                 type: string
 *                 example: Primary org for testing
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       400:
 *         description: Validation error or bad request
 */
exports.createOrg = async (req, res) => {
  try {
    const { name, description = '', active = true } = req.body;

    if (!name) return res.status(400).json({ message: 'name is required' });

    // admin who created the org is automatically added to staff
    const org = await Organization.create({
      name,
      description,
      active,
      createdBy: req.user._id,
      staff: [req.user._id],
    });

    res.status(201).json({ message: 'Organization created', org });
  } catch (err) {
    res.status(400).json({ message: 'Error creating organization', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/orgs/mine:
 *   get:
 *     summary: List my organizations
 *     description: Fetch all orgs where I’m either the creator or part of staff. Only works for admins.
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of organizations I belong to
 */
exports.listMyOrgs = async (req, res) => {
  try {
    // filter: orgs I created OR orgs I’m inside as staff
    const orgs = await Organization.find({
      $or: [{ createdBy: req.user._id }, { staff: req.user._id }],
    }).sort({ created_at: -1 });

    res.status(200).json({ orgs });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching orgs', details: err.message });
  }
};
