import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.routes.js';

import { healthRouter } from './health.route.js';

export const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);

apiV1Router.use('/auth', authRouter);
