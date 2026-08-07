import pino from 'pino';

import { env } from '../config/env.js';

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL,
  enabled: env.LOG_LEVEL !== 'silent',
  base: {
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
});
