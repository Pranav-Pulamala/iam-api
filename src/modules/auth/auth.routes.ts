import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { sessionRouter } from '../sessions/session.routes.js';
import { getCurrentUser, login, logout, refresh, register } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, getCurrentUser);
authRouter.use('/sessions', sessionRouter);
