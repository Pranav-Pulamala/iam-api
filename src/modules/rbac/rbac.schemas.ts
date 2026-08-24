import { z } from 'zod';

import { PERMISSION_KEYS } from '../authorization/permissions.js';

const organizationIdSchema = z.string().uuid('Organization ID must be a valid UUID.');

const roleIdSchema = z.string().uuid('Role ID must be a valid UUID.');

const userIdSchema = z.string().uuid('User ID must be a valid UUID.');

const permissionKeySchema = z.enum(PERMISSION_KEYS, {
  error: 'Permission key must be a recognized permission.',
});

const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'Role name must contain at least 2 characters.')
  .max(100, 'Role name must not exceed 100 characters.');

const roleDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'Role description must not exceed 500 characters.');

export const organizationParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
  })
  .strict();

export const roleParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
    roleId: roleIdSchema,
  })
  .strict();

export const rolePermissionParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
    roleId: roleIdSchema,
    permissionKey: permissionKeySchema,
  })
  .strict();

export const membershipRoleParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
    userId: userIdSchema,
  })
  .strict();

export const membershipRoleAssignmentParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
    userId: userIdSchema,
    roleId: roleIdSchema,
  })
  .strict();

export const createRoleRequestSchema = z
  .object({
    name: roleNameSchema,
    description: roleDescriptionSchema.optional(),
  })
  .strict();

export const updateRoleRequestSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    'At least one role field must be supplied.',
  );

export const assignPermissionRequestSchema = z
  .object({
    permissionKey: permissionKeySchema,
  })
  .strict();

export const assignRoleRequestSchema = z
  .object({
    roleId: roleIdSchema,
  })
  .strict();

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
