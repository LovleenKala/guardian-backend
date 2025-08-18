function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Support both import styles (const and function):

module.exports = wrap;
module.exports.asyncHandler = wrap;
