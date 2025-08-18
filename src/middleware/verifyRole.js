'use strict';

const AppError = require('../utils/appError');
const User = require('../models/User');

// Usage: verifyRole(['admin']) or verifyRole(['admin','nurse'])
const verifyRole = (allowedRoles = []) => async (req, res, next) => {
  try {
    // verifyToken must have run already
    const uid = req.user?._id;
    if (!uid) {
      return next(new AppError(401, 'Unauthorized', 'No authenticated user', {
        type: 'https://docs.api/errors/unauthorized',
        code: 'NO_USER'
      }));
    }

    // Load user once to confirm existence & current role
    const user = await User.findById(uid).lean();
    if (!user) {
      return next(new AppError(401, 'Unauthorized', 'Authenticated user not found', {
        type: 'https://docs.api/errors/unauthorized',
        code: 'NO_USER_DB'
      }));
    }

    // Currently roles are stored as a string (e.g., 'admin')
    // If ever switched to refs, this will handle both:
    const roleName = (typeof user.role === 'string') ? user.role : (user.role?.name || null);

    if (!roleName || !allowedRoles.includes(roleName)) {
      return next(new AppError(403, 'Forbidden', 'Insufficient permissions', {
        type: 'https://docs.api/errors/forbidden',
        code: 'INSUFFICIENT_ROLE',
        meta: { required: allowedRoles, actual: roleName || null }
      }));
    }

    // Enforce isApproved for admin surfaces
    if (roleName === 'admin' && user.isApproved === false) {
      return next(new AppError(403, 'Forbidden', 'Admin not approved', {
        type: 'https://docs.api/errors/forbidden',
        code: 'ADMIN_NOT_APPROVED'
       }));
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = verifyRole;
