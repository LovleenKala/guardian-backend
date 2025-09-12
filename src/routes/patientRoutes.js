const express = require('express');
const router = express.Router();

const patientController = require('../controllers/patientController');
const doctorController = require('../controllers/doctorController'); // <-- add this
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../middleware/multer');


router.post(
    '/add',
    verifyToken,
    verifyRole(['caretaker']),
    upload.single('photo'),
    patientController.addPatient
  );
router.delete('/:patientId', verifyToken, patientController.deletePatient);

// Patients
router.post('/add', verifyToken, upload.single('photo'), patientController.addPatient);
router.delete('/:patientId', verifyToken, patientController.deletePatient);

// Assignments

router.post('/assign-nurse', verifyToken, verifyRole(['caretaker']), patientController.assignNurseToPatient);
router.post(
  '/:patientId/assign-doctor',
  verifyToken,
  verifyRole(['admin', 'caretaker']),
  doctorController.assignDoctorToPatient
); // 

// Queries
router.get('/assigned-patients', verifyToken, patientController.getAssignedPatients);
router.get('/', verifyToken, patientController.getPatientDetails);

// Activities
router.post('/entryreport', verifyToken, verifyRole(['nurse']), patientController.logEntry);
router.get('/activities', verifyToken, patientController.getPatientActivities);
router.delete('/entryreport/:entryId', verifyToken, patientController.deleteEntry); // <-- fix

module.exports = router;