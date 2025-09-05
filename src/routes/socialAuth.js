// routes/socialAuth.js
const express = require('express');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { handleSocialLogin, setUserRole } = require('../controllers/socialAuthController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

/* ----------------- Facebook Strategy ----------------- */
// Configure Passport.js Facebook strategy
passport.use(new FacebookStrategy(
  {
    clientID: process.env.FB_APP_ID || '',
    clientSecret: process.env.FB_APP_SECRET || '',
    callbackURL: process.env.FB_CALLBACK_URL || '',
    profileFields: ['id', 'displayName', 'photos', 'email'], // request email explicitly
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // Normalize payload from Facebook profile
      const payload = {
        provider: 'facebook',
        providerId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName || '',
        avatar: profile.photos?.[0]?.value || null,
      };
      const result = await handleSocialLogin(payload); // { user, token }
      return done(null, result);
    } catch (err) {
      return done(err);
    }
  }
));

// Step 1: Initiate Facebook login flow
router.get('/facebook',
  passport.authenticate('facebook', { scope: ['email'], state: 'antiCsrfState' })
);

// Step 2: Handle Facebook callback
router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=social' }),
  (req, res) => {
    const { user, token } = req.user; // result returned from handleSocialLogin
    // In production you’d normally redirect back to frontend with token
    return res.json({ provider: 'facebook', token, user });
  }
);

/* ------------------ Google Strategy ------------------ */
// Configure Passport.js Google strategy
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // Normalize payload from Google profile
      const payload = {
        provider: 'google',
        providerId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName || '',
        avatar: profile.photos?.[0]?.value || null,
      };
      const result = await handleSocialLogin(payload); // { user, token }
      return done(null, result);
    } catch (err) {
      return done(err);
    }
  }
));

// Step 1: Initiate Google login flow
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);

// Step 2: Handle Google callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=social' }),
  (req, res) => {
    const { user, token } = req.user;
    // In production you’d normally redirect back to frontend with token
    return res.json({ provider: 'google', token, user });
  }
);

/* ------------------ Select Role API ------------------ */
// After first login, frontend calls this endpoint to set role (if role=null)
// Requires Bearer token for authentication
router.post('/set-role', verifyToken, setUserRole);

module.exports = router;
