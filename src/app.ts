import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';

import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found-handler.js';
import { apiV1Router } from './routes/index.js';

const requestLogger: RequestHandler = (request, response, next) => {
  const incomingRequestId = request.get('x-request-id');
  const requestId =
    incomingRequestId !== undefined && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim()
      : randomUUID();

  const startedAt = performance.now();

  request.id = requestId;
  response.setHeader('x-request-id', requestId);

  response.on('finish', () => {
    logger.info(
      {
        requestId,
        request: {
          method: request.method,
          path: request.originalUrl,
          remoteAddress: request.ip,
        },
        response: {
          statusCode: response.statusCode,
        },
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      },
      'HTTP request completed',
    );
  });

  next();
};

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
