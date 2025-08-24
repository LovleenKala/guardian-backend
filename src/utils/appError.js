class AppError extends Error {
  constructor(status = 500, title = 'Internal Server Error', detail, { type = 'about:blank', code, meta } = {}) {
    super(detail || title);
    this.name = 'AppError';
    this.status = status;
    this.title = title;
    this.detail = detail || title;
    this.type = type;
    if (code) this.code = code;
    if (meta) this.meta = meta;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
module.exports.AppError = AppError;
