import type {
  MembershipRoleAssignment,
  Permission,
  Prisma,
  Role,
  RolePermission,
} from '@prisma/client';

export type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: {
    rolePermissions: {
      include: {
        permission: true;
      };
    };
  };
}>;

export interface SerializedPermission {
  id: string;
  key: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedRole {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: SerializedPermission[];
}

export interface SerializedRolePermission {
  roleId: string;
  permissionId: string;
  permissionKey: string;
  createdAt: string;
}

export interface SerializedMembershipRoleAssignment {
  membershipId: string;
  roleId: string;
  organizationId: string;
  createdAt: string;
}

export const serializePermission = (permission: Permission): SerializedPermission => ({
  id: permission.id,
  key: permission.key,
  description: permission.description,
  createdAt: permission.createdAt.toISOString(),
  updatedAt: permission.updatedAt.toISOString(),
});

export const serializeRole = (role: RoleWithPermissions): SerializedRole => ({
  id: role.id,
  organizationId: role.organizationId,
  name: role.name,
  description: role.description,
  createdAt: role.createdAt.toISOString(),
  updatedAt: role.updatedAt.toISOString(),
  permissions: role.rolePermissions.map(({ permission }) => serializePermission(permission)),
});

export const serializeRolePermission = (
  assignment: RolePermission,
  permission: Permission,
): SerializedRolePermission => ({
  roleId: assignment.roleId,
  permissionId: assignment.permissionId,
  permissionKey: permission.key,
  createdAt: assignment.createdAt.toISOString(),
});

export const serializeMembershipRoleAssignment = (
  assignment: MembershipRoleAssignment,
): SerializedMembershipRoleAssignment => ({
  membershipId: assignment.membershipId,
  roleId: assignment.roleId,
  organizationId: assignment.organizationId,
  createdAt: assignment.createdAt.toISOString(),
});

export const roleWithPermissionsInclude = {
  rolePermissions: {
    include: {
      permission: true,
    },
    orderBy: {
      permission: {
        key: 'asc',
      },
    },
  },
} satisfies Prisma.RoleInclude;

export type PlainRole = Role;
