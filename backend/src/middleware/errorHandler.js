
import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  let error = err;

  // Log database/driver errors for diagnosis.
  if (err.code && !(err instanceof AppError)) {
    logger.error(
      {
        errorCode: err.code,
        errorMessage: err.message,
        errorName: err.name,
        constraint: err.constraint,
        table: err.table,
        path: req.originalUrl,
        method: req.method,
      },
      'Database or driver error'
    );
  }

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      rule: issue.code,
    }));

    error = AppError.badRequest('Validation failed', formattedErrors);
  }

  // 2. PostgreSQL Database Errors
  else if (err.code) {
    switch (err.code) {
      case '23505': {
        const detail = err.detail || '';
        const match = detail.match(/Key \((.*?)\)=\((.*?)\) already exists/);
        const field = match ? match[1] : 'field';

        error = AppError.conflict(
          `Duplicate value error: ${field} already exists`
        );
        break;
      }

      case '23503':
        error = AppError.badRequest(
          'Referenced record does not exist or cannot be modified'
        );
        break;

      case '23514':
        error = AppError.badRequest(
          'Operation violates financial constraint or boundary condition'
        );
        break;

      case '40P01':
        error = AppError.conflict(
          'Transaction deadlock detected. Please retry the request.'
        );
        break;

      case '40001':
        error = AppError.conflict(
          'Serialization conflict detected. Please retry the request.'
        );
        break;

      default:
        // Unexpected database/driver errors are server errors, not client errors.
        error = AppError.internal();
        break;
    }
  }

  // 3. Body parser JSON syntax errors
  else if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    'body' in err
  ) {
    error = AppError.badRequest('Malformed JSON in request body');
  }

  // 4. Unexpected non-AppError exceptions
  else if (!(error instanceof AppError)) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode >= 500
        ? 'Internal Server Error'
        : error.message || 'Request failed';

    error = new AppError(statusCode, message, [], false);
  }

  const response = {
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    ...(error.errors?.length
      ? { errors: error.errors }
      : {}),
    ...(env.NODE_ENV === 'development'
      ? { stack: err.stack }
      : {}),
  };

  res.locals.errorMessage = error.message;

  if (error.statusCode >= 500) {
    logger.debug(
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
