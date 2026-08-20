import { Prisma } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import {
  requireOrganizationMembership,
  requireOrganizationOwner,
  requireOrganizationRole,
  requireTargetMembership,
} from './rbac-access.service.js';
import {
  roleWithPermissionsInclude,
  serializeMembershipRoleAssignment,
  serializeRole,
  type SerializedMembershipRoleAssignment,
  type SerializedRole,
} from './rbac.types.js';

export const assignRoleToMembership = async (
  organizationId: string,
  targetUserId: string,
  roleId: string,
  currentUserId: string,
): Promise<SerializedMembershipRoleAssignment> => {
  await requireOrganizationOwner(organizationId, currentUserId);

  const [membership] = await Promise.all([
    requireTargetMembership(organizationId, targetUserId),
    requireOrganizationRole(organizationId, roleId),
  ]);

  try {
    const assignment = await prisma.membershipRoleAssignment.create({
      data: {
        membershipId: membership.id,
        roleId,
        organizationId,
      },
    });

    return serializeMembershipRoleAssignment(assignment);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        statusCode: 409,
        code: 'MEMBERSHIP_ROLE_ALREADY_EXISTS',
        message: 'The role is already assigned to this membership.',
        cause: error,
      });
    }

    throw error;
  }
};

export const removeRoleFromMembership = async (
  organizationId: string,
  targetUserId: string,
  roleId: string,
  currentUserId: string,
): Promise<void> => {
  await requireOrganizationOwner(organizationId, currentUserId);

  const [membership] = await Promise.all([
    requireTargetMembership(organizationId, targetUserId),
    requireOrganizationRole(organizationId, roleId),
  ]);

  const deletion = await prisma.membershipRoleAssignment.deleteMany({
    where: {
      membershipId: membership.id,
      roleId,
      organizationId,
    },
  });

  if (deletion.count === 0) {
    throw new AppError({
      statusCode: 404,
      code: 'MEMBERSHIP_ROLE_NOT_FOUND',
      message: 'Membership role assignment not found.',
    });
  }
};

export const listMembershipRoles = async (
  organizationId: string,
  targetUserId: string,
  currentUserId: string,
): Promise<SerializedRole[]> => {
  await requireOrganizationMembership(organizationId, currentUserId);

  const membership = await requireTargetMembership(organizationId, targetUserId);

  const assignments = await prisma.membershipRoleAssignment.findMany({
    where: {
      membershipId: membership.id,
      organizationId,
    },
    include: {
      role: {
        include: roleWithPermissionsInclude,
      },
    },
    orderBy: [
      {
        role: {
          name: 'asc',
        },
      },
      {
        roleId: 'asc',
      },
    ],
  });

  return assignments.map(({ role }) => serializeRole(role));
};
