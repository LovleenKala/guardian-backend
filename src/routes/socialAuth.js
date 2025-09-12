// routes/socialAuth.js
const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { handleSocialLogin, setUserRole } = require('../controllers/socialAuthController');
const { refresh, logout } = require('../controllers/authRefreshController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

/* ---------- Cookie helpers ---------- */
// SECURE = true in production (HTTPS only), false in dev
const SECURE = process.env.NODE_ENV === 'production';
console.log('[auth] SECURE =', SECURE, 'NODE_ENV =', process.env.NODE_ENV);

// generate random hex string (used for OAuth state)
function gen(n = 16) {
  return crypto.randomBytes(n).toString('hex');
}

// set temporary cookie for OAuth state
function setTempCookie(res, name, value, maxAgeMs = 10 * 60 * 1000) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE,
    maxAge: maxAgeMs,
    path: '/',
  });
}

// read + clear cookie
function popCookie(req, res, name) {
  const val = req.cookies?.[name];
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: SECURE, path: '/' });
  return val;
}

/* ---------- Facebook Strategy ---------- */
// - only builds payload (no state validation here)
// - passport handles token exchange with Facebook
passport.use(new FacebookStrategy(
  {
    clientID: process.env.FB_APP_ID || '',
    clientSecret: process.env.FB_APP_SECRET || '',
    callbackURL: process.env.FB_CALLBACK_URL || '',
    profileFields: ['id', 'displayName', 'photos', 'email'],
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const payload = {
        provider: 'facebook',
        providerId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName || '',
        avatar: profile.photos?.[0]?.value || null,
      };
      return done(null, payload);
    } catch (err) {
      return done(err);
    }
  }
));

// Step 1: start Facebook login (generate + set state)
router.get('/facebook', (req, res, next) => {
  const state = gen(16);
  setTempCookie(res, 'fb_state', state);
  passport.authenticate('facebook', { scope: ['email'], state })(req, res, next);
});

// Step 2: Facebook callback
// - verify state (query vs cookie)
// - then run passport to fetch profile
router.get('/facebook/callback',
  (req, res, next) => {
    const s1 = req.query?.state;
    const s2 = popCookie(req, res, 'fb_state');
    console.log('[auth] fb callback query.state=', s1, 'cookie.fb_state=', s2);
    if (!s1 || !s2 || s1 !== s2) return res.status(400).send('Invalid or missing OAuth state (facebook)');
    next();
  },
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=social' }),
  async (req, res) => {
    const payload = req.user;
    const { token, user } = await handleSocialLogin(payload, res);
    return res.json({ provider: payload.provider, token, user });
  }
);

/* ---------- Google Strategy ---------- */
// - only builds payload (no state validation here)
// - params includes id_token if needed
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, params, profile, done) => {
    try {
      const payload = {
        provider: 'google',
        providerId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName || '',
        avatar: profile.photos?.[0]?.value || null,
      };
      return done(null, payload);
    } catch (err) {
      return done(err);
    }
  }
));

// Step 1: start Google login (generate + set state)
router.get('/google', (req, res, next) => {
  const state = gen(16);
  setTempCookie(res, 'gg_state', state);
  console.log('[google] start state=', state);
  passport.authenticate('google', {
    scope: ['profile', 'email'],   // add 'openid' if you want id_token
    prompt: 'select_account',
    state,
  })(req, res, next);
});

// Step 2: Google callback
// - verify state (query vs cookie)
// - then run passport to fetch profile
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
  async (req, res) => {
    const payload = req.user;
    const { token, user } = await handleSocialLogin(payload, res);
    return res.json({ provider: payload.provider, token, user });
  }
);

/* ---------- Other Auth APIs ---------- */
// set role after first login (requires JWT)
router.post('/set-role', verifyToken, setUserRole);

// refresh token
router.post('/refresh', refresh);

// logout (requires JWT)
router.post('/logout', verifyToken, logout);

module.exports = router;
