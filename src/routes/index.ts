import { Router } from 'express';

import { healthRouter } from './health.route.js';

export const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);
