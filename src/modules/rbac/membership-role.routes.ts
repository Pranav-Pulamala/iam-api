import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { assign, list, remove } from './membership-role.controller.js';

export const membershipRoleRouter = Router();

membershipRoleRouter.use(authenticate);

membershipRoleRouter.post('/:organizationId/members/:userId/roles', assign);

membershipRoleRouter.get('/:organizationId/members/:userId/roles', list);

membershipRoleRouter.delete('/:organizationId/members/:userId/roles/:roleId', remove);
