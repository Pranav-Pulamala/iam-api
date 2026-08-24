import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { create, getOne, list, remove, update } from './role.controller.js';

export const roleRouter = Router();

roleRouter.use(authenticate);

roleRouter.post('/:organizationId/roles', requirePermission(PERMISSIONS.ROLE_CREATE), create);

roleRouter.get('/:organizationId/roles', requirePermission(PERMISSIONS.ROLE_READ), list);

roleRouter.get('/:organizationId/roles/:roleId', requirePermission(PERMISSIONS.ROLE_READ), getOne);

roleRouter.patch(
  '/:organizationId/roles/:roleId',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  update,
);

roleRouter.delete(
  '/:organizationId/roles/:roleId',
  requirePermission(PERMISSIONS.ROLE_DELETE),
  remove,
);
