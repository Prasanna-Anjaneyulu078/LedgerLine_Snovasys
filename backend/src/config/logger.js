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

