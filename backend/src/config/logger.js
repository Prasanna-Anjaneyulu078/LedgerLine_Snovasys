import http from 'http';
import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      'req.body.password',
      'req.body.password_hash',
      'password',
      'password_hash',
      'token',
      'secret',
      'authorization',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
});

/**
 * Sanitizes request URLs to remove sensitive credentials from query parameters.
 */
export function sanitizeUrl(url = '') {
  return String(url).replace(
    /([?&](?:token|password|secret|access_token|refresh_token|authorization|apikey|key)=)[^&]+/gi,
    '$1[REDACTED]'
  );
}

/**
 * Formats a failed API request into the standardized human-readable terminal format.
 *
 * Example:
 * [API ERROR] POST /api/v1/transactions/transfer
 * Status: 400 Bad Request
 * Message: Insufficient funds
 * Duration: 125ms
 * ----------------------------------------
 */
export function formatApiError({
  method = 'UNKNOWN',
  url = '/',
  statusCode = 500,
  statusText,
  message,
  duration = 0,
  requestId,
}) {
  const code = Number(statusCode) || 500;
  const canonicalName = statusText || http.STATUS_CODES[code] || 'Error';
  const displayStatus = `${code} ${canonicalName}`.trim();
  const safeMessage = message || canonicalName || 'Request failed';
  const cleanUrl = sanitizeUrl(url);

  const lines = [
    `[API ERROR] ${method} ${cleanUrl}`,
    `Status: ${displayStatus}`,
    `Message: ${safeMessage}`,
  ];

  if (requestId) {
    lines.push(`Request ID: ${requestId}`);
  }

  const durationStr = typeof duration === 'number' ? `${duration}ms` : `${String(duration).replace(/ms$/, '')}ms`;
  lines.push(`Duration: ${durationStr}`);
  lines.push('----------------------------------------');

  return lines.join('\n');
}

/**
 * Logs a failed API request to the terminal in human-readable format.
 */
logger.logApiError = function (errorData) {
  const formatted = formatApiError(errorData);
  console.error(`\n${formatted}`);
};

logger.formatApiError = formatApiError;


