import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { assign, list, remove } from './membership-role.controller.js';

export const membershipRoleRouter = Router();

membershipRoleRouter.use(authenticate);

membershipRoleRouter.post(
  '/:organizationId/members/:userId/roles',
  requirePermission(PERMISSIONS.ROLE_ASSIGN),
  assign,
);

membershipRoleRouter.get(
  '/:organizationId/members/:userId/roles',
  requirePermission(PERMISSIONS.MEMBER_READ),
  list,
);

membershipRoleRouter.delete(
  '/:organizationId/members/:userId/roles/:roleId',
  requirePermission(PERMISSIONS.ROLE_ASSIGN),
  remove,
);
