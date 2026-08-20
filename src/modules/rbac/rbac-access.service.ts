import { MembershipRole, type Membership, type Role } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';

const organizationNotFoundError = (): AppError =>
  new AppError({
    statusCode: 404,
    code: 'ORGANIZATION_NOT_FOUND',
    message: 'Organization not found.',
  });

export const requireOrganizationMembership = async (
  organizationId: string,
  currentUserId: string,
): Promise<Membership> => {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUserId,
        organizationId,
      },
    },
  });

  if (membership === null) {
    throw organizationNotFoundError();
  }

  return membership;
};

export const requireOrganizationOwner = async (
  organizationId: string,
  currentUserId: string,
): Promise<Membership> => {
  const membership = await requireOrganizationMembership(organizationId, currentUserId);

  if (membership.role !== MembershipRole.OWNER) {
    throw new AppError({
      statusCode: 403,
      code: 'INSUFFICIENT_ORGANIZATION_ACCESS',
      message: 'Organization owner access is required.',
    });
  }

  return membership;
};

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
