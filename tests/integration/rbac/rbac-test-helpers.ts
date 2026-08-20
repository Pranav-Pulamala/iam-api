import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { expect } from 'vitest';
import { z } from 'zod';

import { app } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';

const testEmails = new Set<string>();
const testSlugs = new Set<string>();

export const permissionSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  description: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const roleSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  permissions: z.array(permissionSchema),
});

export const roleResponseSchema = z.object({
  data: z.object({
    role: roleSchema,
  }),
});

export const roleListResponseSchema = z.object({
  data: z.object({
    roles: z.array(roleSchema),
  }),
});

export const permissionListResponseSchema = z.object({
  data: z.object({
    permissions: z.array(permissionSchema),
  }),
});

export const rolePermissionResponseSchema = z.object({
  data: z.object({
    rolePermission: z.object({
      roleId: z.string().uuid(),
      permissionId: z.string().uuid(),
      permissionKey: z.string(),
      createdAt: z.string().datetime({ offset: true }),
    }),
  }),
});

export const membershipRoleAssignmentResponseSchema = z.object({
  data: z.object({
    assignment: z.object({
      membershipId: z.string().uuid(),
      roleId: z.string().uuid(),
      organizationId: z.string().uuid(),
      createdAt: z.string().datetime({ offset: true }),
    }),
  }),
});

export const membershipRolesResponseSchema = z.object({
  data: z.object({
    roles: z.array(roleSchema),
  }),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

const authenticationResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
    }),
    accessToken: z.string().min(1),
  }),
});

const organizationResponseSchema = z.object({
  data: z.object({
    organization: z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
    }),
  }),
});

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

export interface TestOrganization {
  id: string;
  slug: string;
}

export interface TestRole {
  id: string;
  organizationId: string;
  name: string;
}

export const parseJsonResponse = (responseText: string): unknown => {
  const parsedResponse: unknown = JSON.parse(responseText);
  return parsedResponse;
};

const createTestEmail = (): string => {
  const email = `rbac-${randomUUID()}@example.com`;
  testEmails.add(email);
  return email;
};

const createTestSlug = (): string => {
  const slug = `rbac-${randomUUID()}`;
  testSlugs.add(slug);
  return slug;
};

export const registerTestUser = async (): Promise<TestUser> => {
  const email = createTestEmail();

  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(201);

  const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

  return {
    id: responseBody.data.user.id,
    email: responseBody.data.user.email,
    accessToken: responseBody.data.accessToken,
  };
};

export const createTestOrganization = async (owner: TestUser): Promise<TestOrganization> => {
  const slug = createTestSlug();

  const response = await request(app)
    .post('/api/v1/organizations')
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'RBAC Test Organization',
      slug,
    });

  expect(response.status).toBe(201);

  const responseBody = organizationResponseSchema.parse(parseJsonResponse(response.text));

  return {
    id: responseBody.data.organization.id,
    slug: responseBody.data.organization.slug,
  };
};

export const addTestMember = async (
  organizationId: string,
  owner: TestUser,
  targetUser: TestUser,
): Promise<void> => {
  const response = await request(app)
    .post(`/api/v1/organizations/${organizationId}/members`)
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      userId: targetUser.id,
    });

  expect(response.status).toBe(201);
};

export const createTestRole = async (
  organizationId: string,
  owner: TestUser,
  name = `Role ${randomUUID()}`,
): Promise<TestRole> => {
  const response = await request(app)
    .post(`/api/v1/organizations/${organizationId}/roles`)
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      name,
      description: 'Role created by an integration test.',
    });

  expect(response.status).toBe(201);

  const responseBody = roleResponseSchema.parse(parseJsonResponse(response.text));

  return {
    id: responseBody.data.role.id,
    organizationId: responseBody.data.role.organizationId,
    name: responseBody.data.role.name,
  };
};

export const assignTestPermission = async (
  organizationId: string,
  roleId: string,
  permissionKey: string,
  owner: TestUser,
): Promise<void> => {
  const response = await request(app)
    .post(`/api/v1/organizations/${organizationId}/roles/${roleId}/permissions`)
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      permissionKey,
    });

  expect(response.status).toBe(201);
};

export const assignTestRole = async (
  organizationId: string,
  targetUserId: string,
  roleId: string,
  owner: TestUser,
): Promise<void> => {
  const response = await request(app)
    .post(`/api/v1/organizations/${organizationId}/members/${targetUserId}/roles`)
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      roleId,
    });

  expect(response.status).toBe(201);
};

export const cleanupRbacTestData = async (): Promise<void> => {
  const slugs = Array.from(testSlugs);
  const emails = Array.from(testEmails);

  if (slugs.length > 0) {
    await prisma.organization.deleteMany({
      where: {
        slug: {
          in: slugs,
        },
      },
    });
  }

  if (emails.length > 0) {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: emails,
        },
      },
    });
  }

  testSlugs.clear();
  testEmails.clear();
};
