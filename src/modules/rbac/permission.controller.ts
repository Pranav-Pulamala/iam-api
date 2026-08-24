import type { RequestHandler } from 'express';

import {
  assignPermissionRequestSchema,
  roleParamsSchema,
  rolePermissionParamsSchema,
} from './rbac.schemas.js';
import {
  assignPermissionToRole,
  listPermissions,
  removePermissionFromRole,
} from './permission.service.js';

export const list: RequestHandler = async (_request, response) => {
  const permissions = await listPermissions();

  response.status(200).json({
    data: {
      permissions,
    },
  });
};

export const assignToRole: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const bodyInput: unknown = request.body;
  const params = roleParamsSchema.parse(paramsInput);
  const body = assignPermissionRequestSchema.parse(bodyInput);

  const rolePermission = await assignPermissionToRole(
    params.organizationId,
    params.roleId,
    body.permissionKey,
  );

  response.status(201).json({
    data: {
      rolePermission,
    },
  });
};

export const removeFromRole: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = rolePermissionParamsSchema.parse(paramsInput);

  await removePermissionFromRole(params.organizationId, params.roleId, params.permissionKey);

  response.status(204).send();
};
