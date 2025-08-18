const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/verifyToken');

// Auth-specific micro-limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration & login
router.post('/register', userController.registerUser);
router.post('/login', loginLimiter, userController.login);

// Self profile (freelancers only; controller enforces policy)
router.patch('/profile', verifyToken, userController.updateProfile);

// OTP (disabled or remove; keep if you plan to re-enable)
//router.post('/send-pin', verifyToken, userController.sendOTP); // currently bypassed
//router.post('/verify-pin', userController.verifyOTP);  // currently bypassed

// Password management Routes
router.post('/change-password', verifyToken, userController.changePassword);
router.post('/reset-password-request', userController.requestPasswordReset);
router.get('/reset-password', userController.renderPasswordResetPage);
router.post('/reset-password', userController.resetPassword);

module.exports = router;