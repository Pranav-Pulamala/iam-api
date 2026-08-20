import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { app } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  addTestMember,
  assignTestPermission,
  assignTestRole,
  cleanupRbacTestData,
  createTestOrganization,
  createTestRole,
  errorResponseSchema,
  parseJsonResponse,
  registerTestUser,
  roleListResponseSchema,
  roleResponseSchema,
} from './rbac-test-helpers.js';

afterEach(cleanupRbacTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('organization role creation', () => {
  it('allows an OWNER to create a trimmed organization role', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: '  Organization Admin  ',
        description: '  Organization administrators  ',
      });

    expect(response.status).toBe(201);

    const body = roleResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.role.organizationId).toBe(organization.id);
    expect(body.data.role.name).toBe('Organization Admin');
    expect(body.data.role.description).toBe('Organization administrators');
    expect(body.data.role.permissions).toEqual([]);

    const storedRole = await prisma.role.findUniqueOrThrow({
      where: {
        id: body.data.role.id,
      },
    });

    expect(storedRole.organizationId).toBe(organization.id);
    expect(storedRole.name).toBe('Organization Admin');
  });

  it('prevents a MEMBER from creating a role', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        name: 'Unauthorized Role',
      });

    expect(response.status).toBe(403);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('INSUFFICIENT_ORGANIZATION_ACCESS');
  });

  it('rejects unauthenticated and invalid requests', async () => {
    const unauthenticatedResponse = await request(app)
      .post(`/api/v1/organizations/${randomUUID()}/roles`)
      .send({
        name: 'Unauthenticated Role',
      });

    expect(unauthenticatedResponse.status).toBe(401);

    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const invalidResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: ' ',
      });

    expect(invalidResponse.status).toBe(400);

    const body = errorResponseSchema.parse(parseJsonResponse(invalidResponse.text));

    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces role-name uniqueness only within an organization', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const firstOrganization = await createTestOrganization(firstOwner);
    const secondOrganization = await createTestOrganization(secondOwner);

    await createTestRole(firstOrganization.id, firstOwner, 'Billing Manager');

    const duplicateResponse = await request(app)
      .post(`/api/v1/organizations/${firstOrganization.id}/roles`)
      .set('authorization', `Bearer ${firstOwner.accessToken}`)
      .send({
        name: 'Billing Manager',
      });

    expect(duplicateResponse.status).toBe(409);

    const duplicateBody = errorResponseSchema.parse(parseJsonResponse(duplicateResponse.text));

    expect(duplicateBody.error.code).toBe('ROLE_NAME_CONFLICT');

    const secondRole = await createTestRole(secondOrganization.id, secondOwner, 'Billing Manager');

    expect(secondRole.organizationId).toBe(secondOrganization.id);
  });
});

describe('organization role retrieval', () => {
  it('allows members to list and retrieve organization roles', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const role = await createTestRole(organization.id, owner, 'Viewer');

    const listResponse = await request(app)
      .get(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(listResponse.status).toBe(200);

    const listBody = roleListResponseSchema.parse(parseJsonResponse(listResponse.text));

    expect(listBody.data.roles.map((item) => item.id)).toContain(role.id);

    const getResponse = await request(app)
      .get(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(getResponse.status).toBe(200);

    const getBody = roleResponseSchema.parse(parseJsonResponse(getResponse.text));

    expect(getBody.data.role.id).toBe(role.id);
    expect(getBody.data.role.organizationId).toBe(organization.id);
  });

  it('returns roles in deterministic order without cross-tenant leakage', async () => {
    const owner = await registerTestUser();
    const otherOwner = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const otherOrganization = await createTestOrganization(otherOwner);

    await createTestRole(organization.id, owner, 'Zulu Role');
    await createTestRole(organization.id, owner, 'Alpha Role');

    const foreignRole = await createTestRole(otherOrganization.id, otherOwner, 'Private Role');

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(200);

    const body = roleListResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.roles.map((role) => role.name)).toEqual(['Alpha Role', 'Zulu Role']);

    expect(body.data.roles.map((role) => role.id)).not.toContain(foreignRole.id);
  });

  it('hides roles from non-members and wrong organizations', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const nonMember = await registerTestUser();
    const firstOrganization = await createTestOrganization(firstOwner);
    const secondOrganization = await createTestOrganization(secondOwner);

    const role = await createTestRole(firstOrganization.id, firstOwner, 'Private Role');

    const nonMemberResponse = await request(app)
      .get(`/api/v1/organizations/${firstOrganization.id}/roles`)
      .set('authorization', `Bearer ${nonMember.accessToken}`);

    expect(nonMemberResponse.status).toBe(404);

    const wrongOrganizationResponse = await request(app)
      .get(`/api/v1/organizations/${secondOrganization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${secondOwner.accessToken}`);

    expect(wrongOrganizationResponse.status).toBe(404);

    const body = errorResponseSchema.parse(parseJsonResponse(wrongOrganizationResponse.text));

    expect(body.error.code).toBe('ROLE_NOT_FOUND');
  });
});

describe('organization role update and deletion', () => {
  it('allows OWNER updates and rejects name conflicts', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await createTestRole(organization.id, owner, 'Existing Role');

    const role = await createTestRole(organization.id, owner, 'Original Role');

    const updateResponse = await request(app)
      .patch(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Updated Role',
        description: 'Updated description.',
      });

    expect(updateResponse.status).toBe(200);

    const updatedBody = roleResponseSchema.parse(parseJsonResponse(updateResponse.text));

    expect(updatedBody.data.role.name).toBe('Updated Role');
    expect(updatedBody.data.role.description).toBe('Updated description.');

    const conflictResponse = await request(app)
      .patch(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Existing Role',
      });

    expect(conflictResponse.status).toBe(409);

    const conflictBody = errorResponseSchema.parse(parseJsonResponse(conflictResponse.text));

    expect(conflictBody.error.code).toBe('ROLE_NAME_CONFLICT');
  });

  it('prevents MEMBER role updates and deletions', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Protected Role');

    await addTestMember(organization.id, owner, member);

    const updateResponse = await request(app)
      .patch(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        name: 'Unauthorized Update',
      });

    expect(updateResponse.status).toBe(403);

    const deleteResponse = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(deleteResponse.status).toBe(403);

    const preservedRole = await prisma.role.findUnique({
      where: {
        id: role.id,
      },
    });

    expect(preservedRole).not.toBeNull();
  });

  it('cascades role links without deleting users or memberships', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Temporary Role');

    await addTestMember(organization.id, owner, member);

    await assignTestRole(organization.id, member.id, role.id, owner);

    await assignTestPermission(organization.id, role.id, 'role:read', owner);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: organization.id,
        },
      },
    });

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);

    const deletedRole = await prisma.role.findUnique({
      where: {
        id: role.id,
      },
    });

    const remainingRolePermissionCount = await prisma.rolePermission.count({
      where: {
        roleId: role.id,
      },
    });

    const remainingRoleAssignmentCount = await prisma.membershipRoleAssignment.count({
      where: {
        roleId: role.id,
      },
    });

    const preservedMembership = await prisma.membership.findUnique({
      where: {
        id: membership.id,
      },
    });

    const preservedUser = await prisma.user.findUnique({
      where: {
        id: member.id,
      },
    });

    expect(deletedRole).toBeNull();
    expect(remainingRolePermissionCount).toBe(0);
    expect(remainingRoleAssignmentCount).toBe(0);
    expect(preservedMembership).not.toBeNull();
    expect(preservedUser).not.toBeNull();
  });
});
