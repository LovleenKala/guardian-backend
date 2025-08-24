const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const adminController = require('../controllers/adminController');

const adminOnly = [verifyToken, verifyRole(['admin'])];

// Users
router.get('/users', adminOnly, adminController.listUsers);
router.put('/users/:userId/approve', adminOnly, adminController.approveUser);
router.put('/users/:userId/revoke', adminOnly, adminController.revokeUser);
router.put('/users/:userId/role', adminOnly, adminController.updateUserRole);
router.delete('/users/:userId', adminOnly, adminController.deleteUser);
router.post('/users/:userId/reset-password', adminOnly, adminController.resetPassword);

// ---- Patients / Roster ----
router.get('/patients/roster', adminOnly, adminController.listPatientsRoster); // roster reader
router.put('/patients/:patientId/assign', adminOnly, adminController.assignPatient); // Assign patient endpoint
router.post('/assignments', adminOnly, adminController.assignPatient); // Alt form documented in OpenAPI

// Tickets (optional surface)
router.post('/tickets', adminOnly, adminController.createSupportTicket);
router.get('/tickets', adminOnly, adminController.listSupportTickets);
router.put('/tickets/:ticketId', adminOnly, adminController.updateSupportTicket);

// ---- Metrics (optional) ----
router.get('/metrics', adminOnly, adminController.getDirectoryMetrics);

module.exports = router;