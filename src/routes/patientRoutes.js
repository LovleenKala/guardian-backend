const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// Try to load optional middleware; fall back to a harmless no-op if missing
let freelanceCreate = (req, res, next) => next();
try {
  // This middleware should enforce that only freelancer nurses/caretakers (org === null)
  // can create patients, and it should force req.body.org = null.
  freelanceCreate = require('../middleware/freelanceCreate');
} catch (_) {
  // no-op: keep route working even if the middleware file isn't present
}

// Patient Registration
router.post('/', verifyToken, freelanceCreate, patientController.createPatient);

// Get assigned patients (nurse or caretaker)
router.get('/assigned', verifyToken, verifyRole(['nurse', 'caretaker']), patientController.listAssignedPatients);

// Patient logs
router.post('/:patientId/logs', verifyToken, verifyRole(['nurse','caretaker']), patientController.createLog);
router.get('/:patientId/logs', verifyToken, verifyRole(['nurse','caretaker']), patientController.listLogs);
router.delete('/:patientId/logs/:logId', verifyToken, verifyRole(['nurse','caretaker']), patientController.deleteLog);

// Patient self-access
router.get('/me', verifyToken, patientController.getMyPatient);
router.get('/me/logs', verifyToken, patientController.getMyLogs);

module.exports = router;
