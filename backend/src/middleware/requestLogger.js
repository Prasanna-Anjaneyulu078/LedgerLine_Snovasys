import { logger } from '../config/logger.js';

export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id || null,
    };

    if (res.statusCode >= 500) {
      logger.error(logData, 'HTTP Server Error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'HTTP Client Error');
    } else {
      logger.info(logData, 'HTTP Request Completed');
    }
  });

  next();
}

