import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import {
  addMember,
  create,
  getOne,
  list,
  listMembers,
  removeMember,
} from './organization.controller.js';

export const organizationRouter = Router();

organizationRouter.use(authenticate);

organizationRouter.post('/', create);
organizationRouter.get('/', list);

organizationRouter.get(
  '/:organizationId',
  requirePermission(PERMISSIONS.ORGANIZATION_READ),
  getOne,
);

organizationRouter.get(
  '/:organizationId/members',
  requirePermission(PERMISSIONS.MEMBER_READ),
  listMembers,
);

organizationRouter.post(
  '/:organizationId/members',
  requirePermission(PERMISSIONS.MEMBER_ADD),
  addMember,
);

organizationRouter.delete(
  '/:organizationId/members/:userId',
  requirePermission(PERMISSIONS.MEMBER_REMOVE),
  removeMember,
);
