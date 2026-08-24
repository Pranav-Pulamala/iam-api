import { Prisma } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import type { CreateRoleRequest, UpdateRoleRequest } from './rbac.schemas.js';
import { requireOrganizationRole } from './rbac-access.service.js';
import { roleWithPermissionsInclude, serializeRole, type SerializedRole } from './rbac.types.js';

const roleNameConflictError = (cause: unknown): AppError =>
  new AppError({
    statusCode: 409,
    code: 'ROLE_NAME_CONFLICT',
    message: 'A role with this name already exists in the organization.',
    cause,
  });

export const createRole = async (
  organizationId: string,
  input: CreateRoleRequest,
): Promise<SerializedRole> => {
  try {
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: input.name,
        ...(input.description === undefined
          ? {}
          : {
              description: input.description,
            }),
      },
      include: roleWithPermissionsInclude,
    });

    return serializeRole(role);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw roleNameConflictError(error);
    }

    throw error;
  }
};

export const listRoles = async (organizationId: string): Promise<SerializedRole[]> => {
  const roles = await prisma.role.findMany({
    where: {
      organizationId,
    },
    include: roleWithPermissionsInclude,
    orderBy: [
      {
        name: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });

  return roles.map(serializeRole);
};

export const getRole = async (organizationId: string, roleId: string): Promise<SerializedRole> => {
  await requireOrganizationRole(organizationId, roleId);

  const role = await prisma.role.findUniqueOrThrow({
    where: {
      id: roleId,
    },
    include: roleWithPermissionsInclude,
  });

  return serializeRole(role);
};

export const updateRole = async (
  organizationId: string,
  roleId: string,
  input: UpdateRoleRequest,
): Promise<SerializedRole> => {
  await requireOrganizationRole(organizationId, roleId);

  try {
    const role = await prisma.role.update({
      where: {
        id: roleId,
      },
      data: {
        ...(input.name === undefined
          ? {}
          : {
              name: input.name,
            }),
        ...(input.description === undefined
          ? {}
          : {
              description: input.description,
            }),
      },
      include: roleWithPermissionsInclude,
    });

    return serializeRole(role);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw roleNameConflictError(error);
    }

    throw error;
  }
};

export const deleteRole = async (organizationId: string, roleId: string): Promise<void> => {
  await requireOrganizationRole(organizationId, roleId);

  await prisma.role.delete({
    where: {
      id: roleId,
    },
  });
};
