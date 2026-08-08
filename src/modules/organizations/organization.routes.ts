import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
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
organizationRouter.get('/:organizationId', getOne);
organizationRouter.get('/:organizationId/members', listMembers);
organizationRouter.post('/:organizationId/members', addMember);
organizationRouter.delete('/:organizationId/members/:userId', removeMember);
