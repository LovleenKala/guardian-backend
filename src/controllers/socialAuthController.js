// controllers/socialAuthController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');

/**
 * Handles unified login flow for Facebook/Google social logins.
 * @param {{
 *   provider: 'facebook'|'google',
 *   providerId: string,
 *   email: string,
 *   name?: string,
 *   avatar?: string
 * }} payload
 *
 * Rules:
 *  - Check only by email to determine if user is new or existing
 *  - Existing user:
 *      - Bind provider if not already bound
 *      - Do not modify existing role
 *      - Issue JWT
 *  - New user:
 *      - Create new user with role = null
 *      - Issue JWT
 *      - The frontend should detect `role=null` and redirect user to a "choose role" screen
 */
exports.handleSocialLogin = async (payload) => {
  const { provider, providerId, email, name } = payload;

  if (!email) {
    throw new Error('Social provider did not return an email address.');
  }

  const normEmail = String(email).trim().toLowerCase();

  // 1) Find user by email
  let user = await User.findOne({ email: normEmail });

  if (!user) {
    // 2) New user: create account with role = null, provider info recorded
    const providerPatch = {};
    providerPatch[provider] = { id: providerId, linkedAt: new Date() };

    user = await User.create({
      fullname: name || 'Social User',
      email: normEmail,
      password_hash: undefined,   // Social accounts don’t need password
      passwordSet: false,
      role: null,                 // ★ Important: default to null (user must choose role later)
      providers: [provider],
      ...providerPatch,
    });
  } else {
    // 3) Existing user: bind provider if not already bound; keep existing role unchanged
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

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }

  // 4) Issue JWT with minimal payload
  //    role may still be null → frontend can check and redirect to “choose role”
  const token = jwt.sign(
    {
      _id: user._id.toString(),
      email: user.email || null,
      role: user.role ? user.role.toString() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { action: 'login', user, token };
};

/**
 * Endpoint: POST /auth/set-role
 * Body: { roleName: 'nurse' | 'caretaker' | 'admin' }
 *
 * Flow:
 *  - Requires a valid Bearer JWT
 *  - If user exists and roleName is valid, update user.role
 *  - Return a new JWT with the updated role included in payload
 */
exports.setUserRole = async (req, res) => {
  try {
    const { roleName } = req.body;
    if (!roleName) return res.status(400).json({ error: 'roleName is required' });

    // Find role by name in DB
    const role = await Role.findOne({ name: roleName.toLowerCase() });
    if (!role) return res.status(400).json({ error: 'Invalid roleName' });

    // Fetch current user from decoded JWT
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update role
    user.role = role._id;
    await user.save();

    // Issue new JWT with updated role
    const newToken = jwt.sign(
      {
        _id: user._id.toString(),
        email: user.email || null,
        role: user.role.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({ message: 'Role set successfully', token: newToken, user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to set role', details: err.message });
  }
};
