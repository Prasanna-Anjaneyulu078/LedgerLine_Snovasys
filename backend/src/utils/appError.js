export class AppError extends Error {
  constructor(statusCode = 500, message = 'Internal Server Error', errors = [], isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    this.success = false;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors = []) {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden: Access is denied') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message = 'Conflict: Resource state conflict') {
    return new AppError(409, message);
  }

  static unprocessable(message = 'Unprocessable Entity', errors = []) {
    return new AppError(422, message, errors);
  }

  static internal(message = 'Internal Server Error') {
    return new AppError(500, message, [], false);
  }
}

