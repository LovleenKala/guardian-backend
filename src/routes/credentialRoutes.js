const express = require('express');
const router = express.Router();

const credentialController = require('../controllers/credentialController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

// ----- Self (nurse/caretaker) -----
router.post('/', verifyToken, verifyRole(['nurse','caretaker']), credentialController.createMyCredential);
router.get('/me', verifyToken, verifyRole(['nurse','caretaker']), credentialController.listMyCredentials);
router.patch('/:credentialId', verifyToken, verifyRole(['nurse','caretaker']), credentialController.updateMyCredential);
router.delete('/:credentialId', verifyToken, verifyRole(['nurse','caretaker']), credentialController.deleteMyCredential);

// ----- Admin -----
router.get('/admin', verifyToken, verifyRole(['admin']), credentialController.adminListCredentials);
router.post('/admin/:credentialId/verify', verifyToken, verifyRole(['admin']), credentialController.adminVerifyCredential);
router.post('/admin/:credentialId/unverify', verifyToken, verifyRole(['admin']), credentialController.adminUnverifyCredential);
router.delete('/admin/:credentialId', verifyToken, verifyRole(['admin']), credentialController.adminDeleteCredential);

module.exports = router;
