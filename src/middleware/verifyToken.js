'use strict';

const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');

function fail(status, title, detail, code) {
  return new AppError(status, title, detail, {
    type: 'https://docs.api/errors/unauthorized',
    code
  });
}

module.exports = function verifyToken(req, res, next) {
  // Read Authorization header (case-insensitive)
  const rawAuth = req.get('authorization') || req.get('Authorization');
  if (!rawAuth) {
    return next(fail(401, 'Unauthorized', 'Missing Authorization header', 'MISSING_AUTH_HEADER'));
  }

  // Expect "Bearer <token>"
  const parts = rawAuth.trim().split(/\s+/);
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    return next(fail(401, 'Unauthorized', 'Missing or malformed Authorization header', 'MALFORMED_BEARER'));
  }

  const token = parts[1];
  if (!token) {
    return next(fail(401, 'Unauthorized', 'No token provided', 'MISSING_TOKEN'));
  }

  // Verify JWT
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return next(fail(401, 'Unauthorized', 'Token has expired', 'TOKEN_EXPIRED'));
    }
    return next(fail(401, 'Unauthorized', 'Invalid token', 'TOKEN_INVALID'));
  }

  // Normalize claims: accept sub/userId/id/_id; require role
  const role = decoded?.role;
  const anyId = decoded?.sub ?? decoded?.userId ?? decoded?.id ?? decoded?._id ?? null;

  if (!anyId || !role) {
    return next(fail(401, 'Unauthorized', 'Invalid token payload', 'TOKEN_PAYLOAD_INVALID'));
  }

  // Back-compat + forward-compat:
  // - many handlers read `req.user._id`
  // - some new code might read `req.user.id`
  req.user = {
    _id: String(anyId),
    id:  String(anyId),
    role: String(role),
  };

  // Optional pass-throughs 
  if (decoded.lastPasswordChange) req.user.lastPasswordChange = decoded.lastPasswordChange;
  if (decoded.orgId) req.user.orgId = decoded.orgId;
  if (typeof decoded.isApproved === 'boolean') req.user.isApproved = decoded.isApproved;

  return next();
};
