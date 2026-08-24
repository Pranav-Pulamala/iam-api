import type { Membership, Role } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';

export const requireOrganizationRole = async (
  organizationId: string,
  roleId: string,
): Promise<Role> => {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      organizationId,
    },
  });

  if (role === null) {
    throw new AppError({
      statusCode: 404,
      code: 'ROLE_NOT_FOUND',
      message: 'Role not found.',
    });
  }

  return role;
};

export const requireTargetMembership = async (
  organizationId: string,
  targetUserId: string,
): Promise<Membership> => {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId,
      },
    },
  });

  if (membership === null) {
    throw new AppError({
      statusCode: 404,
      code: 'MEMBERSHIP_NOT_FOUND',
      message: 'Membership not found.',
    });
  }

  return membership;
};
