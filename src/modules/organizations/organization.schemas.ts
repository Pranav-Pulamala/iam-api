import { z } from 'zod';

const organizationIdSchema = z.string().uuid('Organization ID must be a valid UUID.');

const userIdSchema = z.string().uuid('User ID must be a valid UUID.');

export const createOrganizationRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Organization name must contain at least 2 characters.')
      .max(100, 'Organization name must not exceed 100 characters.'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Organization slug must contain at least 3 characters.')
      .max(63, 'Organization slug must not exceed 63 characters.')
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Organization slug may contain lowercase letters, numbers, and single hyphens between segments.',
      ),
  })
  .strict();

export const organizationParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
  })
  .strict();

export const addMemberRequestSchema = z
  .object({
    userId: userIdSchema,
  })
  .strict();

export const removeMemberParamsSchema = z
  .object({
    organizationId: organizationIdSchema,
    userId: userIdSchema,
  })
  .strict();

export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export type OrganizationParams = z.infer<typeof organizationParamsSchema>;

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

export type RemoveMemberParams = z.infer<typeof removeMemberParamsSchema>;
