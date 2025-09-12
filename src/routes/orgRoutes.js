const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const orgController = require('../controllers/orgController');

// allow only logged-in admins on these routes
router.use(verifyToken, verifyRole(['admin']));

// create a new organization
router.post('/orgs', orgController.createOrg);

// list all orgs created by or linked to this admin
router.get('/orgs/mine', orgController.listMyOrgs);

module.exports = router;
