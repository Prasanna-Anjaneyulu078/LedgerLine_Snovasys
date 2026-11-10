import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function requestLogger(req, res, next) {
  const start = Date.now();
  let logged = false;
  let responseMessage = null;

  // Intercept json responses to capture error message from controllers, error handler, or rate limiter
  const originalJson = res.json;
  res.json = function (body) {
    if (body && typeof body === 'object') {
      if (typeof body.message === 'string' && body.message.trim() !== '') {
        responseMessage = body.message;
      } else if (typeof body.error === 'string' && body.error.trim() !== '') {
        responseMessage = body.error;
      }
    }
    return originalJson.apply(this, arguments);
  };

  const logFailure = (premature = false, customReason = null) => {
    if (logged) return;

    const statusCode =
      premature && !res.headersSent
        ? 499
        : res.statusCode || (premature ? 499 : 500);

    // Suppress successful (HTTP 200–299) and redirect/cache (HTTP 300–399) requests
    if (!premature && statusCode >= 200 && statusCode < 400) {
      return;
    }

    logged = true;
    const duration = Date.now() - start;

    // Determine the safe error message
    let rawMessage =
      customReason ||
      responseMessage ||
      res.locals?.errorMessage ||
      req.errorMessage ||
      res.statusMessage;

    // For 500 in production, sanitize to avoid exposing internal details
    if (statusCode >= 500 && env.NODE_ENV === 'production') {
      rawMessage = 'Internal server error';
    }

    // Correlation ID if present
    const requestId =
      req.headers['x-request-id'] ||
      req.headers['x-correlation-id'] ||
      req.id ||
      res.getHeader?.('x-request-id') ||
      null;

    logger.logApiError({
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      statusText: res.statusMessage,
      message: rawMessage,
      duration,
      requestId,
    });
  };

  // 1. Log on normal response completion (only if 4xx or 5xx)
  res.on('finish', () => {
    logFailure(false);
  });

  // 2. Log if connection closes before response completion
  res.on('close', () => {
    if (!res.writableFinished && !logged) {
      logFailure(true, 'Request closed prematurely before response completion');
    }
  });

  // 3. Log on request stream errors
  req.on('error', (err) => {
    if (!logged) {
      logFailure(true, err?.message || 'Request connection error');
    }
  });

  next();
}


