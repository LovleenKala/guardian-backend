// controllers/socialAuthController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const crypto = require('crypto');

// helper: generate refresh token
function genRTK() {
  return crypto.randomBytes(32).toString('hex');        
}
// helper: hash refresh token with SHA-256
function hashRTK(rt) {
  return crypto.createHash('sha256').update(rt).digest('hex'); 
}

/* ---------- Social Login Handler ---------- */
// payload = { provider, providerId, email, name?, avatar? }
// flow:
// - find user by email
// - if new: create user (role = null)
// - if existing: bind provider if missing, keep role unchanged
// - issue access token (15m)
// - generate + store refresh token (7d cookie)
exports.handleSocialLogin = async (payload, res) => {
  const { provider, providerId, email, name } = payload;
  if (!email) throw new Error('Social provider did not return an email address.');

  const normEmail = String(email).trim().toLowerCase();

  // find existing user
  let user = await User.findOne({ email: normEmail });
  if (!user) {
    // new user → create with role = null
    const providerPatch = {}; 
    providerPatch[provider] = { id: providerId, linkedAt: new Date() };
    user = await User.create({
      fullname: name || 'Social User',
      email: normEmail,
      password_hash: undefined,
      passwordSet: false,
      role: null,       // must choose later
      providers: [provider],
      ...providerPatch,
      refreshTokens: [],
    });
  } else {
    // existing user → add provider if not bound
    const providers = Array.isArray(user.providers) ? user.providers : [];
    const needAddProvider = !providers.includes(provider);
    const needBind = !user[provider] || !user[provider].id;

    if (needAddProvider || needBind || (!user.fullname && name)) {
      user.providers = Array.from(new Set([...(providers || []), provider]));
      user[provider] = { id: providerId, linkedAt: new Date() };
      if (!user.fullname && name) user.fullname = name;
      await user.save();
    }
  }

  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

  // issue access token (15m)
  const accessToken = jwt.sign(
    { _id: user._id.toString(), email: user.email || null, role: user.role ? user.role.toString() : null },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // generate + store refresh token
  const plainRTK = genRTK();
  const hashedRTK = hashRTK(plainRTK);
  user.refreshTokens = Array.from(new Set([...(user.refreshTokens || []), hashedRTK]));
  if (user.refreshTokens.length > 3) {
    user.refreshTokens = user.refreshTokens.slice(-3);
  }
  await user.save();

  // set RTK cookie (7d)
  if (res) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('rt', plainRTK, {
      httpOnly: true, sameSite: 'lax', secure, path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  return { action: 'login', user, token: accessToken };
};

/* ---------- Set User Role ---------- */
// endpoint: POST /auth/set-role
// body: { roleName: 'nurse' | 'caretaker' | 'admin' }
// flow:
// - require JWT (decoded user in req.user)
// - validate roleName
// - update user.role
// - issue new access token (24h) with updated role
exports.setUserRole = async (req, res) => {
  try {
    const { roleName } = req.body;
    if (!roleName) return res.status(400).json({ error: 'roleName is required' });

    // find role in DB
    const role = await Role.findOne({ name: roleName.toLowerCase() });
    if (!role) return res.status(400).json({ error: 'Invalid roleName' });

    // find user from JWT
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // update role
    user.role = role._id;
    await user.save();

    // issue new access token (24h)
    const newToken = jwt.sign(
      { _id: user._id.toString(), email: user.email || null, role: user.role.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({ message: 'Role set successfully', token: newToken, user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to set role', details: err.message });
  }
};
