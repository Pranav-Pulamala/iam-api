import { Prisma } from '@prisma/client';

import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganizationOwner, requireOrganizationRole } from './rbac-access.service.js';
import {
  serializePermission,
  serializeRolePermission,
  type SerializedPermission,
  type SerializedRolePermission,
} from './rbac.types.js';

export const listPermissions = async (): Promise<SerializedPermission[]> => {
  const permissions = await prisma.permission.findMany({
    orderBy: {
      key: 'asc',
    },
  });

  return permissions.map(serializePermission);
};

export const assignPermissionToRole = async (
  organizationId: string,
  roleId: string,
  permissionKey: string,
  currentUserId: string,
): Promise<SerializedRolePermission> => {
  await requireOrganizationOwner(organizationId, currentUserId);
  await requireOrganizationRole(organizationId, roleId);

  const permission = await prisma.permission.findUnique({
    where: {
      key: permissionKey,
    },
  });

  if (permission === null) {
    throw new AppError({
      statusCode: 404,
      code: 'PERMISSION_NOT_FOUND',
      message: 'Permission not found.',
    });
  }

  try {
    const assignment = await prisma.rolePermission.create({
      data: {
        roleId,
        permissionId: permission.id,
      },
    });

    return serializeRolePermission(assignment, permission);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        statusCode: 409,
        code: 'ROLE_PERMISSION_ALREADY_EXISTS',
        message: 'The permission is already assigned to this role.',
        cause: error,
      });
    }

    throw error;
  }
};

export const removePermissionFromRole = async (
  organizationId: string,
  roleId: string,
  permissionKey: string,
  currentUserId: string,
): Promise<void> => {
  await requireOrganizationOwner(organizationId, currentUserId);
  await requireOrganizationRole(organizationId, roleId);

  const permission = await prisma.permission.findUnique({
    where: {
      key: permissionKey,
    },
    select: {
      id: true,
    },
  });

  if (permission === null) {
    throw new AppError({
      statusCode: 404,
      code: 'ROLE_PERMISSION_NOT_FOUND',
      message: 'Role permission assignment not found.',
    });
  }

  const deletion = await prisma.rolePermission.deleteMany({
    where: {
      roleId,
      permissionId: permission.id,
    },
  });

  if (deletion.count === 0) {
    throw new AppError({
      statusCode: 404,
      code: 'ROLE_PERMISSION_NOT_FOUND',
      message: 'Role permission assignment not found.',
    });
  }
};
