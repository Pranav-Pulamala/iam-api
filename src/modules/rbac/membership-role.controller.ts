import type { RequestHandler } from 'express';

import {
  assignRoleRequestSchema,
  membershipRoleAssignmentParamsSchema,
  membershipRoleParamsSchema,
} from './rbac.schemas.js';
import {
  assignRoleToMembership,
  listMembershipRoles,
  removeRoleFromMembership,
} from './membership-role.service.js';

export const assign: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const bodyInput: unknown = request.body;
  const params = membershipRoleParamsSchema.parse(paramsInput);
  const body = assignRoleRequestSchema.parse(bodyInput);

  const assignment = await assignRoleToMembership(
    params.organizationId,
    params.userId,
    body.roleId,
  );

  response.status(201).json({
    data: {
      assignment,
    },
  });
};

export const remove: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = membershipRoleAssignmentParamsSchema.parse(paramsInput);

  await removeRoleFromMembership(params.organizationId, params.userId, params.roleId);

  response.status(204).send();
};

export const list: RequestHandler = async (request, response) => {
  const paramsInput: unknown = request.params;
  const params = membershipRoleParamsSchema.parse(paramsInput);

  const roles = await listMembershipRoles(params.organizationId, params.userId);

  response.status(200).json({
    data: {
      roles,
    },
  });
};
