import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.routes.js';

import { organizationRouter } from '../modules/organizations/organization.routes.js';

import { membershipRoleRouter } from '../modules/rbac/membership-role.routes.js';
import { permissionRouter, rolePermissionRouter } from '../modules/rbac/permission.routes.js';
import { roleRouter } from '../modules/rbac/role.routes.js';

import { healthRouter } from './health.route.js';

export const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);

apiV1Router.use('/auth', authRouter);

apiV1Router.use('/organizations', organizationRouter);

apiV1Router.use('/organizations', roleRouter);
apiV1Router.use('/organizations', rolePermissionRouter);
apiV1Router.use('/organizations', membershipRoleRouter);
apiV1Router.use('/organizations', permissionRouter);
