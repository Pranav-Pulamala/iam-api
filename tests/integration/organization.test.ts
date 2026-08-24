import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

const testEmails = new Set<string>();
const testSlugs = new Set<string>();

const authenticationResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
    }),
    accessToken: z.string().min(1),
  }),
});

const createOrganizationResponseSchema = z.object({
  data: z.object({
    organization: z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      createdAt: z.string().datetime({ offset: true }),
      updatedAt: z.string().datetime({ offset: true }),
    }),
    membership: z.object({
      id: z.string().uuid(),
      role: z.literal('OWNER'),
      userId: z.string().uuid(),
      organizationId: z.string().uuid(),
      createdAt: z.string().datetime({ offset: true }),
      updatedAt: z.string().datetime({ offset: true }),
    }),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface TestOrganization {
  id: string;
  slug: string;
}

const parseJsonResponse = (responseText: string): unknown => {
  const parsedResponse: unknown = JSON.parse(responseText);
  return parsedResponse;
};

const createTestEmail = (): string => {
  const email = `organization-${randomUUID()}@example.com`;
  testEmails.add(email);
  return email;
};

const createTestSlug = (): string => {
  const slug = `organization-${randomUUID()}`;
  testSlugs.add(slug);
  return slug;
};

const registerTestUser = async (): Promise<TestUser> => {
  const email = createTestEmail();

  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(201);

  const body = authenticationResponseSchema.parse(parseJsonResponse(response.text));

  return {
    id: body.data.user.id,
    email: body.data.user.email,
    accessToken: body.data.accessToken,
  };
};

const createTestOrganization = async (owner: TestUser): Promise<TestOrganization> => {
  const slug = createTestSlug();

  const response = await request(app)
    .post('/api/v1/organizations')
    .set('authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'Test Organization',
      slug,
    });

  expect(response.status).toBe(201);

  const body = createOrganizationResponseSchema.parse(parseJsonResponse(response.text));

  return {
    id: body.data.organization.id,
    slug: body.data.organization.slug,
  };
};

const addTestMember = async (
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

afterEach(async () => {
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/v1/organizations', () => {
  it('creates an organization and OWNER membership atomically', async () => {
    const owner = await registerTestUser();
    const slug = createTestSlug();

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: '  Acme Corporation  ',
        slug: slug.toUpperCase(),
      });

    expect(response.status).toBe(201);

    const body = createOrganizationResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.organization.name).toBe('Acme Corporation');
    expect(body.data.organization.slug).toBe(slug);
    expect(body.data.membership.role).toBe('OWNER');
    expect(body.data.membership.userId).toBe(owner.id);
    expect(body.data.membership.organizationId).toBe(body.data.organization.id);

    const storedMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: owner.id,
          organizationId: body.data.organization.id,
        },
      },
    });

    expect(storedMembership?.role).toBe('OWNER');
  });

  it('rejects an invalid name', async () => {
    const owner = await registerTestUser();

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: ' ',
        slug: createTestSlug(),
      });

    expect(response.status).toBe(400);
  });

  it('rejects an invalid slug', async () => {
    const owner = await registerTestUser();

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Invalid Slug Organization',
        slug: 'invalid slug!',
      });

    expect(response.status).toBe(400);
  });

  it('returns 409 for a duplicate slug', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const organization = await createTestOrganization(firstOwner);

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${secondOwner.accessToken}`)
      .send({
        name: 'Duplicate Organization',
        slug: organization.slug,
      });

    expect(response.status).toBe(409);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('ORGANIZATION_SLUG_CONFLICT');
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).post('/api/v1/organizations').send({
      name: 'Unauthenticated Organization',
      slug: createTestSlug(),
    });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/organizations', () => {
  it('returns only organizations belonging to the current user', async () => {
    const currentUser = await registerTestUser();
    const otherUser = await registerTestUser();
    const ownOrganization = await createTestOrganization(currentUser);
    const privateOrganization = await createTestOrganization(otherUser);

    const response = await request(app)
      .get('/api/v1/organizations')
      .set('authorization', `Bearer ${currentUser.accessToken}`);

    expect(response.status).toBe(200);

    const unvalidatedBody = parseJsonResponse(response.text);
    const body = z
      .object({
        data: z.object({
          organizations: z.array(
            z.object({
              id: z.string().uuid(),
              slug: z.string(),
              membership: z.object({
                role: z.enum(['OWNER', 'MEMBER']),
              }),
            }),
          ),
        }),
      })
      .parse(unvalidatedBody);

    const organizationIds = body.data.organizations.map((organization) => organization.id);

    expect(organizationIds).toContain(ownOrganization.id);
    expect(organizationIds).not.toContain(privateOrganization.id);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/organizations');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/organizations/:organizationId', () => {
  it('denies a member without organization:read', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(403);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('hides a private organization from a non-member', async () => {
    const owner = await registerTestUser();
    const nonMember = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}`)
      .set('authorization', `Bearer ${nonMember.accessToken}`);

    expect(response.status).toBe(404);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('safely handles a nonexistent organization', async () => {
    const user = await registerTestUser();

    const response = await request(app)
      .get(`/api/v1/organizations/${randomUUID()}`)
      .set('authorization', `Bearer ${user.accessToken}`);

    expect(response.status).toBe(404);
  });
});

describe('organization members', () => {
  it('denies a member without member:read', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(403);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('prevents a non-member from listing members', async () => {
    const owner = await registerTestUser();
    const nonMember = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${nonMember.accessToken}`);

    expect(response.status).toBe(404);
  });
});

describe('POST /api/v1/organizations/:organizationId/members', () => {
  it('allows an OWNER to add an existing user as a MEMBER', async () => {
    const owner = await registerTestUser();
    const targetUser = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        userId: targetUser.id,
      });

    expect(response.status).toBe(201);
    expect(response.text).toContain('"role":"MEMBER"');

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUser.id,
          organizationId: organization.id,
        },
      },
    });

    expect(membership?.role).toBe('MEMBER');
  });

  it('prevents a MEMBER from adding users', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const targetUser = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        userId: targetUser.id,
      });

    expect(response.status).toBe(403);
  });

  it('returns 404 for a nonexistent target user', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        userId: randomUUID(),
      });

    expect(response.status).toBe(404);
  });

  it('returns 409 for a duplicate membership', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        userId: member.id,
      });

    expect(response.status).toBe(409);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).post(`/api/v1/organizations/${randomUUID()}/members`).send({
      userId: randomUUID(),
    });

    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/organizations/:organizationId/members/:userId', () => {
  it('allows an OWNER to remove a MEMBER', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${member.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: organization.id,
        },
      },
    });

    expect(membership).toBeNull();
  });

  it('prevents a MEMBER from removing members', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const otherMember = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);
    await addTestMember(organization.id, owner, otherMember);

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${otherMember.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(403);
  });

  it('does not allow removal of the organization OWNER', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${owner.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(409);

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: owner.id,
          organizationId: organization.id,
        },
      },
    });

    expect(membership?.role).toBe('OWNER');
  });

  it('prevents a non-member from manipulating memberships', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const nonMember = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${member.id}`)
      .set('authorization', `Bearer ${nonMember.accessToken}`);

    expect(response.status).toBe(404);
  });
});
