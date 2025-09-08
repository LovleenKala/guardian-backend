const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// helper: hash string with SHA-256
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');

/* ---------- Refresh Token ---------- */
exports.refresh = async (req, res) => {
  try {
    // get refresh token from HttpOnly cookie
    const plainRTK = req.cookies?.rt;
    if (!plainRTK) return res.status(401).json({ error: 'No refresh token' });

    // hash and find user
    const hashed = hash(plainRTK);
    const user = await User.findOne({ refreshTokens: hashed });
    if (!user) return res.status(401).json({ error: 'Invalid refresh token' });

    // rotate: remove old RTK, generate new RTK
    user.refreshTokens = user.refreshTokens.filter(t => t !== hashed);
    const newPlain = crypto.randomBytes(32).toString('hex');
    const newHashed = hash(newPlain);
    user.refreshTokens.push(newHashed);
    if (user.refreshTokens.length > 3) {
      user.refreshTokens = user.refreshTokens.slice(-3);
    }
    await user.save();

    // issue new Access Token (15m)
    const accessToken = jwt.sign(
      { _id: user._id.toString(), email: user.email || null, role: user.role ? user.role.toString() : null },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // set new RTK cookie (7d)
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('rt', newPlain, {
      httpOnly: true, sameSite: 'lax', secure, path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ token: accessToken });
  } catch (e) {
    return res.status(500).json({ error: 'Refresh failed', details: e.message });
  }
};

/* ---------- Logout ---------- */
exports.logout = async (req, res) => {
  try {
    // get RTK from cookie and remove from DB
    const plainRTK = req.cookies?.rt;
    if (plainRTK) {
      const hashed = hash(plainRTK);
      await User.updateOne({ _id: req.user?._id }, { $pull: { refreshTokens: hashed } });
    }

    // clear RTK cookie
    const secure = process.env.NODE_ENV === 'production';
    res.clearCookie('rt', { httpOnly: true, sameSite: 'lax', secure, path: '/' });

    return res.json({ message: 'Logged out' });
  } catch (e) {
    return res.status(500).json({ error: 'Logout failed', details: e.message });
  }
};
