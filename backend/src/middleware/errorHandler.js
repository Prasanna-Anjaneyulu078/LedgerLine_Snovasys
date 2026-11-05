import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  let error = err;

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      rule: issue.code,
    }));
    error = AppError.badRequest('Validation failed', formattedErrors);
  }
  // 2. PostgreSQL Database Errors (from pg driver)
  else if (err.code) {
    switch (err.code) {
      case '23505': {
        // Unique violation
        const detail = err.detail || '';
        const match = detail.match(/Key \((.*?)\)=\((.*?)\) already exists/);
        const field = match ? match[1] : 'field';
        error = AppError.conflict(`Duplicate value error: ${field} already exists`);
        break;
      }
      case '23503': // Foreign key violation
        error = AppError.badRequest('Referenced record does not exist or cannot be modified');
        break;
      case '23514': // Check constraint violation
        error = AppError.badRequest('Operation violates financial constraint or boundary condition');
        break;
      case '40P01': // Deadlock detected
        error = AppError.conflict('Transaction deadlock detected. Please retry the request.');
        break;
      case '40001': // Serialization failure
        error = AppError.conflict('Serialization conflict detected. Please retry the request.');
        break;
      default:
        // Do not leak raw SQL errors in production
        error = AppError.badRequest(env.NODE_ENV === 'development' ? `Database error: ${err.message}` : 'Database error occurred');
        break;
    }
  }
  // 3. Body parser JSON syntax errors
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = AppError.badRequest('Malformed JSON in request body');
  }
  // 4. Fallback for unexpected non-AppError exceptions
  else if (!(error instanceof AppError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new AppError(statusCode, message, [], false);
  }

  const response = {
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    ...(error.errors && error.errors.length > 0 ? { errors: error.errors } : {}),
    ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  };

  if (error.statusCode >= 500) {
    logger.error(
      {
        err: {
          message: err.message,
          stack: err.stack,
          statusCode: error.statusCode,
          code: err.code,
        },
        path: req.originalUrl,
        method: req.method,
      },
      'Unhandled Server Exception'
    );
  }

  res.status(error.statusCode).json(response);
}

