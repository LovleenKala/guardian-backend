'use strict';

const AppError = require('../utils/appError');
const User = require('../models/User');

/**
 * Enforce that only freelancer nurses/caretakers (users whose org is null)
 * can create patients. Also forces req.body.org = null so patients created
 * through this route are always freelance patients.
 */
module.exports = async function freelanceCreate(req, res, next) {
  try {
    const uid = req.user?._id;
    if (!uid) {
      return next(new AppError(401, 'Unauthorized', 'No authenticated user', {
        type: 'https://docs.api/errors/unauthorized',
        code: 'NO_USER'
      }));
    }
    const actor = await User.findById(uid).lean();
    if (!actor) {
      return next(new AppError(401, 'Unauthorized', 'Authenticated user not found', {
        type: 'https://docs.api/errors/unauthorized',
        code: 'NO_USER_DB'
      }));
    }
    if (!['nurse','caretaker'].includes(actor.role)) {
      return next(new AppError(403, 'Forbidden', 'Only nurses or caretakers can create patients'));
    }
    if (actor.org) {
      return next(new AppError(403, 'Forbidden', 'Only freelancers (no organisation) can create patients'));
    }
    if (req.body && typeof req.body === 'object') {
      req.body.org = null;
    }
    return next();
  } catch (err) {
    return next(err);
  }
};
