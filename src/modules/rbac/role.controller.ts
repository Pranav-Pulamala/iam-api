import type { RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  createRoleRequestSchema,
  organizationParamsSchema,
  roleParamsSchema,
  updateRoleRequestSchema,
} from './rbac.schemas.js';
import { createRole, deleteRole, getRole, listRoles, updateRole } from './role.service.js';

const currentUserId = (user: Express.Request['authenticatedUser']): string => {
  if (user === undefined) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  }

  return user.id;
};

export const create: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const bodyInput: unknown = request.body;
  const params = organizationParamsSchema.parse(paramsInput);
  const body = createRoleRequestSchema.parse(bodyInput);

  const role = await createRole(
    params.organizationId,
    currentUserId(request.authenticatedUser),
    body,
  );

  response.status(201).json({
    data: {
      role,
    },
  });
};

export const list: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = organizationParamsSchema.parse(paramsInput);

  const roles = await listRoles(params.organizationId, currentUserId(request.authenticatedUser));

  response.status(200).json({
    data: {
      roles,
    },
  });
};

export const getOne: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = roleParamsSchema.parse(paramsInput);

  const role = await getRole(
    params.organizationId,
    params.roleId,
    currentUserId(request.authenticatedUser),
  );

  response.status(200).json({
    data: {
      role,
    },
  });
};

export const update: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const bodyInput: unknown = request.body;
  const params = roleParamsSchema.parse(paramsInput);
  const body = updateRoleRequestSchema.parse(bodyInput);

  const role = await updateRole(
    params.organizationId,
    params.roleId,
    currentUserId(request.authenticatedUser),
    body,
  );

  response.status(200).json({
    data: {
      role,
    },
  });
};

export const remove: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = roleParamsSchema.parse(paramsInput);

  await deleteRole(params.organizationId, params.roleId, currentUserId(request.authenticatedUser));

  response.status(204).send();
};
