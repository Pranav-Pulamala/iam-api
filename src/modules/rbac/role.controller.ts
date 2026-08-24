import type { RequestHandler } from 'express';

import {
  createRoleRequestSchema,
  organizationParamsSchema,
  roleParamsSchema,
  updateRoleRequestSchema,
} from './rbac.schemas.js';
import { createRole, deleteRole, getRole, listRoles, updateRole } from './role.service.js';

export const create: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const bodyInput: unknown = request.body;
  const params = organizationParamsSchema.parse(paramsInput);
  const body = createRoleRequestSchema.parse(bodyInput);

  const role = await createRole(params.organizationId, body);

  response.status(201).json({
    data: {
      role,
    },
  });
};

export const list: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = organizationParamsSchema.parse(paramsInput);

  const roles = await listRoles(params.organizationId);

  response.status(200).json({
    data: {
      roles,
    },
  });
};

export const getOne: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = roleParamsSchema.parse(paramsInput);

  const role = await getRole(params.organizationId, params.roleId);

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

  const role = await updateRole(params.organizationId, params.roleId, body);

  response.status(200).json({
    data: {
      role,
    },
  });
};

export const remove: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = roleParamsSchema.parse(paramsInput);

  await deleteRole(params.organizationId, params.roleId);

  response.status(204).send();
};
