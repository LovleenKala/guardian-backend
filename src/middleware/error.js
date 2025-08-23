const { AppError } = require('../utils/appError');

// Map common library/framework errors for consistent HTTP codes
function normalizeError(err, req) {
  // JSON parse error from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return new AppError(400, 'Malformed JSON', err.message, {
      type: 'https://docs.api/errors/malformed-json', //create stable documentation URL
      code: 'MALFORMED_JSON'
    });
  }

  // Multer (invalid upload, wrong mime, size)
  if (err.name === 'MulterError' || err.message === 'Only image files are allowed!') {
    return new AppError(400, 'Invalid upload', err.message, {
      type: 'https://docs.api/errors/invalid-upload', //create stable documentation URL
      code: 'INVALID_UPLOAD'
    });
  }

  // Mongoose: validation
  if (err.name === 'ValidationError') {
    return new AppError(422, 'Validation failed', err.message, {
      type: 'https://docs.api/errors/validation', //create stable documentation URL
      code: 'VALIDATION_ERROR',
      meta: { fields: Object.keys(err.errors || {}) }
    });
  }

  // Mongoose: cast (bad ObjectId, bad date)
  if (err.name === 'CastError') {
    return new AppError(400, 'Invalid parameter', `Invalid value for ${err.path}`, {
      type: 'https://docs.api/errors/invalid-parameter', //create stable documentation URL
      code: 'INVALID_PARAMETER',
      meta: { path: err.path, value: err.value }
    });
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    return new AppError(409, 'Conflict', 'Duplicate key', {
      type: 'https://docs.api/errors/conflict', //create stable documentation URL
      code: 'DUPLICATE_KEY',
      meta: { keyValue: err.keyValue }
    });
  }

  // Already an AppError? pass-through.
  if (err instanceof AppError) return err;

  // Default: 500
  return new AppError(500, 'Internal Server Error', err.message, {
    type: 'https://docs.api/errors/internal' //create stable documentation URL
  });
}

function errorHandler(err, req, res, _next) {
  const error = normalizeError(err, req);
  const instance = req.originalUrl || req.url;
  const payload = {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: error.detail,
    instance
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;

  // Request id for tracing
  const reqId = req.headers['x-request-id'];
  if (reqId) payload.request_id = reqId;

  // Don’t leak stack in production
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(error.status).json(payload);
}

function notFound(_req, _res, next) {
  next(new AppError(404, 'Not Found', 'The requested resource was not found', {
    type: 'https://docs.api/errors/not-found', //create stable documentation URL
    code: 'ROUTE_NOT_FOUND'
  }));
}

module.exports = { errorHandler, notFound };
