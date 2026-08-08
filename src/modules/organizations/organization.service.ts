import { MembershipRole, Prisma, type Membership } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import type { AddMemberRequest, CreateOrganizationRequest } from './organization.schemas.js';
import type {
  CreateOrganizationResult,
  OrganizationAccessResult,
  OrganizationListItem,
  OrganizationMember,
} from './organization.types.js';
import {
  serializeOrganization,
  serializeMembership,
  type SerializedMembership,
} from './organization.types.js';

const organizationNotFoundError = (): AppError =>
  new AppError({
    statusCode: 404,
    code: 'ORGANIZATION_NOT_FOUND',
    message: 'Organization not found.',
  });

const requireOrganizationMembership = async (
  organizationId: string,
  userId: string,
): Promise<Membership> => {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });

  if (membership === null) {
    throw organizationNotFoundError();
  }

  return membership;
};

const requireOrganizationOwner = async (
  organizationId: string,
  userId: string,
): Promise<Membership> => {
  const membership = await requireOrganizationMembership(organizationId, userId);

  if (membership.role !== MembershipRole.OWNER) {
    throw new AppError({
      statusCode: 403,
      code: 'INSUFFICIENT_ORGANIZATION_ACCESS',
      message: 'Organization owner access is required.',
    });
  }

  return membership;
};

export const createOrganization = async (
  currentUserId: string,
  input: CreateOrganizationRequest,
): Promise<CreateOrganizationResult> => {
  try {
    return await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
        },
      });

      const membership = await transaction.membership.create({
        data: {
          userId: currentUserId,
          organizationId: organization.id,
          role: MembershipRole.OWNER,
        },
      });

      return {
        organization,
        membership,
      };
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        statusCode: 409,
        code: 'ORGANIZATION_SLUG_CONFLICT',
        message: 'An organization with this slug already exists.',
        cause: error,
      });
    }

    throw error;
  }
};

export const listOrganizationsForUser = async (
  currentUserId: string,
): Promise<OrganizationListItem[]> => {
  const memberships = await prisma.membership.findMany({
    where: {
      userId: currentUserId,
    },
    include: {
      organization: true,
    },
    orderBy: [
      {
        organization: {
          createdAt: 'asc',
        },
      },
      {
        organizationId: 'asc',
      },
    ],
  });

  return memberships.map((membership) => ({
    ...serializeOrganization(membership.organization),
    membership: {
      role: membership.role,
    },
  }));
};

export const getOrganizationForUser = async (
  organizationId: string,
  currentUserId: string,
): Promise<OrganizationAccessResult> => {
  const membership = await requireOrganizationMembership(organizationId, currentUserId);

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });

  if (organization === null) {
    throw organizationNotFoundError();
  }

  return {
    organization,
    membership,
  };
};

export const listOrganizationMembers = async (
  organizationId: string,
  currentUserId: string,
): Promise<OrganizationMember[]> => {
  await requireOrganizationMembership(organizationId, currentUserId);

  const memberships = await prisma.membership.findMany({
    where: {
      organizationId,
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    role: membership.role,
    user: membership.user,
  }));
};

export const addOrganizationMember = async (
  organizationId: string,
  currentUserId: string,
  input: AddMemberRequest,
): Promise<SerializedMembership> => {
  await requireOrganizationOwner(organizationId, currentUserId);

  const targetUser = await prisma.user.findUnique({
    where: {
      id: input.userId,
    },
    select: {
      id: true,
    },
  });

  if (targetUser === null) {
    throw new AppError({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
      message: 'User not found.',
    });
  }

  try {
    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: targetUser.id,
        role: MembershipRole.MEMBER,
      },
    });

    return serializeMembership(membership);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        statusCode: 409,
        code: 'MEMBERSHIP_ALREADY_EXISTS',
        message: 'The user is already a member of this organization.',
        cause: error,
      });
    }

    throw error;
  }
};

export const removeOrganizationMember = async (
  organizationId: string,
  targetUserId: string,
  currentUserId: string,
): Promise<void> => {
  await requireOrganizationOwner(organizationId, currentUserId);

  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId,
      },
    },
  });

  if (targetMembership === null) {
    throw new AppError({
      statusCode: 404,
      code: 'MEMBERSHIP_NOT_FOUND',
      message: 'Membership not found.',
    });
  }

  if (targetMembership.role === MembershipRole.OWNER) {
    throw new AppError({
      statusCode: 409,
      code: 'OWNER_REMOVAL_FORBIDDEN',
      message: 'An owner cannot be removed until ownership transfer is supported.',
    });
  }

  const deletionResult = await prisma.membership.deleteMany({
    where: {
      id: targetMembership.id,
      role: MembershipRole.MEMBER,
    },
  });

  if (deletionResult.count === 0) {
    throw new AppError({
      statusCode: 409,
      code: 'MEMBERSHIP_REMOVAL_CONFLICT',
      message: 'The membership could not be removed.',
    });
  }
};
