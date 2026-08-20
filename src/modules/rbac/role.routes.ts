import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { create, getOne, list, remove, update } from './role.controller.js';

export const roleRouter = Router();

roleRouter.use(authenticate);

roleRouter.post('/:organizationId/roles', create);
roleRouter.get('/:organizationId/roles', list);
roleRouter.get('/:organizationId/roles/:roleId', getOne);
roleRouter.patch('/:organizationId/roles/:roleId', update);
roleRouter.delete('/:organizationId/roles/:roleId', remove);
