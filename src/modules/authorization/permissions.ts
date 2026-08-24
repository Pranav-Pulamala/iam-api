export const PERMISSION_KEYS = [
  'organization:read',
  'organization:update',
  'member:read',
  'member:add',
  'member:remove',
  'role:read',
  'role:create',
  'role:update',
  'role:delete',
  'role:assign',
  'permission:read',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  MEMBER_READ: 'member:read',
  MEMBER_ADD: 'member:add',
  MEMBER_REMOVE: 'member:remove',
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_ASSIGN: 'role:assign',
  PERMISSION_READ: 'permission:read',
} as const satisfies Record<string, PermissionKey>;

const permissionDescriptions: Record<PermissionKey, string> = {
  'organization:read': 'View organization information.',
  'organization:update': 'Update organization information.',
  'member:read': 'View organization members.',
  'member:add': 'Add organization members.',
  'member:remove': 'Remove organization members.',
  'role:read': 'View organization roles.',
  'role:create': 'Create organization roles.',
  'role:update': 'Update organization roles.',
  'role:delete': 'Delete organization roles.',
  'role:assign': 'Assign roles to organization members.',
  'permission:read': 'View available permission definitions.',
};

export interface PermissionDefinition {
  key: PermissionKey;
  description: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = PERMISSION_KEYS.map(
  (key) => ({
    key,
    description: permissionDescriptions[key],
  }),
);
