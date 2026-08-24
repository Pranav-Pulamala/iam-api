import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { assignToRole, list, removeFromRole } from './permission.controller.js';

export const permissionRouter = Router();
export const rolePermissionRouter = Router();

permissionRouter.use(authenticate);
rolePermissionRouter.use(authenticate);

permissionRouter.get(
  '/:organizationId/permissions',
  requirePermission(PERMISSIONS.PERMISSION_READ),
  list,
);

rolePermissionRouter.post(
  '/:organizationId/roles/:roleId/permissions',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  assignToRole,
);

rolePermissionRouter.delete(
  '/:organizationId/roles/:roleId/permissions/:permissionKey',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  removeFromRole,
);
