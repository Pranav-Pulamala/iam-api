import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { list, remove, removeOthers } from './session.controller.js';

export const sessionRouter = Router();

sessionRouter.use(authenticate);

sessionRouter.get('/', list);
sessionRouter.delete('/others', removeOthers);
sessionRouter.delete('/:sessionId', remove);
