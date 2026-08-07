import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { getCurrentUser, login, register } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.get('/me', authenticate, getCurrentUser);
