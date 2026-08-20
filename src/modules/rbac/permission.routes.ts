import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { assignToRole, list, removeFromRole } from './permission.controller.js';

export const permissionRouter = Router();
export const rolePermissionRouter = Router();

permissionRouter.use(authenticate);
rolePermissionRouter.use(authenticate);

permissionRouter.get('/', list);

rolePermissionRouter.post('/:organizationId/roles/:roleId/permissions', assignToRole);

rolePermissionRouter.delete(
  '/:organizationId/roles/:roleId/permissions/:permissionKey',
  removeFromRole,
);
