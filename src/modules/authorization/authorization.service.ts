import { MembershipRole } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import type {
  AllowedAuthorizationDecision,
  AuthorizationDecision,
  AuthorizationInput,
} from './authorization.types.js';

export const evaluatePermission = async (
  input: AuthorizationInput,
): Promise<AuthorizationDecision> => {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      role: true,
      roleAssignments: {
        where: {
          organizationId: input.organizationId,
          role: {
            organizationId: input.organizationId,
            rolePermissions: {
              some: {
                permission: {
                  key: input.permission,
                },
              },
            },
          },
        },
        select: {
          roleId: true,
        },
        orderBy: {
          roleId: 'asc',
        },
      },
    },
  });

  if (membership === null) {
    return {
      allowed: false,
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission,
      matchedRoleIds: [],
      reason: 'NOT_A_MEMBER',
    };
  }

  if (membership.role === MembershipRole.OWNER) {
    return {
      allowed: true,
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission,
      membershipId: membership.id,
      matchedRoleIds: [],
      reason: 'STRUCTURAL_OWNER',
    };
  }

  const matchedRoleIds = membership.roleAssignments.map((assignment) => assignment.roleId);

  if (matchedRoleIds.length > 0) {
    return {
      allowed: true,
      userId: input.userId,
      organizationId: input.organizationId,
      permission: input.permission,
      membershipId: membership.id,
      matchedRoleIds,
      reason: 'ROLE_PERMISSION_MATCH',
    };
  }

  return {
    allowed: false,
    userId: input.userId,
    organizationId: input.organizationId,
    permission: input.permission,
    membershipId: membership.id,
    matchedRoleIds: [],
    reason: 'PERMISSION_NOT_GRANTED',
  };
};

export const requirePermissionDecision = async (
  input: AuthorizationInput,
): Promise<AllowedAuthorizationDecision> => {
  const decision = await evaluatePermission(input);

  if (decision.allowed) {
    return decision;
  }

  if (decision.reason === 'NOT_A_MEMBER') {
    throw new AppError({
      statusCode: 404,
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found.',
    });
  }

  throw new AppError({
    statusCode: 403,
    code: 'INSUFFICIENT_PERMISSION',
    message: 'You do not have permission to perform this action.',
  });
};
