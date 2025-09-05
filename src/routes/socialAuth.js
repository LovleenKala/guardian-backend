// routes/socialAuth.js
const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const jwtDecode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { handleSocialLogin, setUserRole } = require('../controllers/socialAuthController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

/* ---------- Generate/set/read and clear cookies ---------- */
const SECURE = process.env.NODE_ENV === 'production';
console.log('[auth] SECURE =', SECURE, 'NODE_ENV =', process.env.NODE_ENV);
function gen(n = 16) {
  return crypto.randomBytes(n).toString('hex');
}
function setTempCookie(res, name, value, maxAgeMs = 10 * 60 * 1000) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE,
    maxAge: maxAgeMs,
    path: '/',
  });
}
function popCookie(req, res, name) {
  const val = req.cookies?.[name];
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: SECURE, path: '/' });
  return val;
}

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
      // 1) Verify state
      const stateFromQuery = req.query?.state;
      const stateFromCookie = popCookie(req, req.res, 'fb_state');
      if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
        return done(new Error('Invalid or missing OAuth state (facebook)'));
      }

      // 2) Build user payload and handle login/signup
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

// Step 1: Initiate Facebook login flow  —— generate random state
router.get('/facebook', (req, res, next) => {
  const state = gen(16);
  setTempCookie(res, 'fb_state', state);
  passport.authenticate('facebook', { scope: ['email'], state })(req, res, next);
});

// Step 2: Handle Facebook callback
router.get('/facebook/callback',
  (req, res, next) => {
    const s1 = req.query?.state;
    const s2 = req.cookies?.fb_state;
    res.clearCookie('fb_state', { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
    console.log('[auth] fb callback query.state=', s1, 'cookie.fb_state=', s2);
    if (!s1 || !s2 || s1 !== s2) return res.status(400).send('Invalid or missing OAuth state (facebook)');
    next();
  },
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=social' }),
  (req, res) => res.json({ provider:'facebook', ...req.user })
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
  // Signature reminder: (req, accessToken, refreshToken, params, profile, done)
  async (req, accessToken, refreshToken, params, profile, done) => {
    try {
      // 1) Validate state parameter to protect against CSRF attacks
      const stateFromQuery = req.query?.state;
      const stateFromCookie = popCookie(req, req.res, 'gg_state');
      if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
        return done(new Error('Invalid or missing OAuth state (google)'));
      }

      // 2) Build normalized user payload and handle login/signup
      const payload = {
        provider: 'google',
        providerId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName || '',
        avatar: profile.photos?.[0]?.value || null,
      };
      const result = await handleSocialLogin(payload);
      return done(null, result);
  } catch (err) {
    return done(err);
  }
}
));

// Step 1: Initiate Google login flow 
router.get('/google', (req, res, next) => {
  const state = gen(16);
  setTempCookie(res, 'gg_state', state);
  console.log('[google] start state=', state);
  passport.authenticate('google', {
    scope: ['profile', 'email'], 
    prompt: 'select_account',
    state,    
  })(req, res, next);
});

// Step 2: Handle Google callback
router.get('/google/callback',
  (req, res, next) => {
    const s1 = req.query?.state;
    const s2 = popCookie(req, res, 'gg_state');
    if (!s1 || !s2 || s1 !== s2) {
      return res.status(400).send('Invalid or missing OAuth state (google)');
    }
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=social' }),
  (req, res) => {
    const { user, token } = req.user;
    return res.json({ provider: 'google', token, user });
  }
);


/* ------------------ Select Role API ------------------ */
// After first login, frontend calls this endpoint to set role (if role=null)
// Requires Bearer token for authentication
router.post('/set-role', verifyToken, setUserRole);

module.exports = router;
