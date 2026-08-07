import { Router } from 'express';

import { env } from '../config/env.js';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: typeof env.NODE_ENV;
  service: string;
}

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  const responseBody: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    service: env.SERVICE_NAME,
  };

  response.status(200).json(responseBody);
});
