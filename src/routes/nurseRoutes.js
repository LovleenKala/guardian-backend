const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole'); 

// profile
router.get('/profile', verifyToken, nurseController.getProfile);

// list all nurses (any authenticated user)
router.get('/all', verifyToken, nurseController.getAllNurses);

// nurse’s own assigned patients
router.get(
  '/assigned-patients',
  verifyToken,
  verifyRole(['nurse']),
  nurseController.getAssignedPatientsForNurse 
);

module.exports = router;
