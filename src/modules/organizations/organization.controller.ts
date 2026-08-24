import type { RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  addMemberRequestSchema,
  createOrganizationRequestSchema,
  organizationParamsSchema,
  removeMemberParamsSchema,
} from './organization.schemas.js';
import {
  addOrganizationMember,
  createOrganization,
  getOrganizationForUser,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeOrganizationMember,
} from './organization.service.js';
import { serializeMembership, serializeOrganization } from './organization.types.js';

const getCurrentUserId = (authenticatedUser: Express.Request['authenticatedUser']): string => {
  if (authenticatedUser === undefined) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  }

  return authenticatedUser.id;
};

export const create: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = createOrganizationRequestSchema.parse(unvalidatedBody);
  const currentUserId = getCurrentUserId(request.authenticatedUser);

  const result = await createOrganization(currentUserId, input);

  response.status(201).json({
    data: {
      organization: serializeOrganization(result.organization),
      membership: serializeMembership(result.membership),
    },
  });
};

export const list: RequestHandler = async (request, response) => {
  const currentUserId = getCurrentUserId(request.authenticatedUser);
  const organizations = await listOrganizationsForUser(currentUserId);

  response.status(200).json({
    data: {
      organizations,
    },
  });
};

export const getOne: RequestHandler = async (request, response) => {
  const unvalidatedParams: unknown = request.params;
  const params = organizationParamsSchema.parse(unvalidatedParams);
  const currentUserId = getCurrentUserId(request.authenticatedUser);

  const result = await getOrganizationForUser(params.organizationId, currentUserId);

  response.status(200).json({
    data: {
      organization: serializeOrganization(result.organization),
      membership: {
        role: result.membership.role,
      },
    },
  });
};

export const listMembers: RequestHandler = async (request, response) => {
  const unvalidatedParams: unknown = request.params;
  const params = organizationParamsSchema.parse(unvalidatedParams);
  const members = await listOrganizationMembers(params.organizationId);

  response.status(200).json({
    data: {
      members,
    },
  });
};

export const addMember: RequestHandler = async (request, response) => {
  const unvalidatedParams: unknown = request.params;
  const unvalidatedBody: unknown = request.body;

  const params = organizationParamsSchema.parse(unvalidatedParams);
  const input = addMemberRequestSchema.parse(unvalidatedBody);

  const membership = await addOrganizationMember(params.organizationId, input);

  response.status(201).json({
    data: {
      membership,
    },
  });
};

export const removeMember: RequestHandler = async (request, response) => {
  const unvalidatedParams: unknown = request.params;
  const params = removeMemberParamsSchema.parse(unvalidatedParams);
  await removeOrganizationMember(params.organizationId, params.userId);

  response.status(204).send();
};
