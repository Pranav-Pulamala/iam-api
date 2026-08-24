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
  membershipRoleAssignmentResponseSchema,
  membershipRolesResponseSchema,
  parseJsonResponse,
  registerTestUser,
} from './rbac-test-helpers.js';

afterEach(cleanupRbacTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('membership custom-role assignments', () => {
  it('allows OWNER assignment without changing structural MEMBER status', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Admin');

    await addTestMember(organization.id, owner, member);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        roleId: role.id,
      });

    expect(response.status).toBe(201);

    const body = membershipRoleAssignmentResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.assignment.roleId).toBe(role.id);
    expect(body.data.assignment.organizationId).toBe(organization.id);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: organization.id,
        },
      },
    });

    expect(membership.role).toBe('MEMBER');
  });

  it('allows one membership to receive multiple roles', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const billingRole = await createTestRole(organization.id, owner, 'Billing Manager');

    const supportRole = await createTestRole(organization.id, owner, 'Support Manager');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, billingRole.id, 'member:read', owner);
    await assignTestRole(organization.id, member.id, billingRole.id, owner);
    await assignTestRole(organization.id, member.id, supportRole.id, owner);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(200);

    const body = membershipRolesResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.roles.map((role) => role.name)).toEqual([
      'Billing Manager',
      'Support Manager',
    ]);
  });

  it('rejects duplicate assignments and missing memberships', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const nonMember = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Assignment Role');

    await addTestMember(organization.id, owner, member);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const duplicateResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        roleId: role.id,
      });

    expect(duplicateResponse.status).toBe(409);

    const missingMembershipResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members/${nonMember.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        roleId: role.id,
      });

    expect(missingMembershipResponse.status).toBe(404);

    const body = errorResponseSchema.parse(parseJsonResponse(missingMembershipResponse.text));

    expect(body.error.code).toBe('MEMBERSHIP_NOT_FOUND');
  });

  it('prevents MEMBER assignment and removal', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const targetMember = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Protected Assignment Role');

    await addTestMember(organization.id, owner, member);
    await addTestMember(organization.id, owner, targetMember);
    await assignTestRole(organization.id, targetMember.id, role.id, owner);

    const assignResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members/${targetMember.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        roleId: role.id,
      });

    expect(assignResponse.status).toBe(403);

    const removeResponse = await request(app)
      .delete(
        `/api/v1/organizations/${organization.id}/members/${targetMember.id}/roles/${role.id}`,
      )
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(removeResponse.status).toBe(403);

    const targetMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: targetMember.id,
          organizationId: organization.id,
        },
      },
    });

    expect(
      await prisma.membershipRoleAssignment.findUnique({
        where: {
          membershipId_roleId: {
            membershipId: targetMembership.id,
            roleId: role.id,
          },
        },
      }),
    ).not.toBeNull();
  });

  it('prevents cross-organization role assignment', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const member = await registerTestUser();
    const firstOrganization = await createTestOrganization(firstOwner);
    const secondOrganization = await createTestOrganization(secondOwner);

    await addTestMember(firstOrganization.id, firstOwner, member);

    const foreignRole = await createTestRole(secondOrganization.id, secondOwner, 'Foreign Role');

    const response = await request(app)
      .post(`/api/v1/organizations/${firstOrganization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${firstOwner.accessToken}`)
      .send({
        roleId: foreignRole.id,
      });

    expect(response.status).toBe(404);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: firstOrganization.id,
        },
      },
    });

    expect(
      await prisma.membershipRoleAssignment.count({
        where: {
          membershipId: membership.id,
        },
      }),
    ).toBe(0);
  });

  it('removes only the assignment and preserves the membership', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Removable Role');

    await addTestMember(organization.id, owner, member);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: organization.id,
        },
      },
    });

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${member.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);

    expect(
      await prisma.membershipRoleAssignment.findUnique({
        where: {
          membershipId_roleId: {
            membershipId: membership.id,
            roleId: role.id,
          },
        },
      }),
    ).toBeNull();

    expect(
      await prisma.membership.findUnique({
        where: {
          id: membership.id,
        },
      }),
    ).not.toBeNull();
  });

  it('returns assigned roles with permissions safely', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Visible Role');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, role.id, 'organization:read', owner);
    await assignTestPermission(organization.id, role.id, 'member:read', owner);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(200);

    const body = membershipRolesResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.data.roles).toHaveLength(1);

    expect(body.data.roles[0]?.permissions.map((permission) => permission.key)).toContain(
      'organization:read',
    );

    expect(response.text).not.toContain('passwordHash');
  });

  it('prevents cross-tenant role viewing', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const member = await registerTestUser();
    const firstOrganization = await createTestOrganization(firstOwner);
    const secondOrganization = await createTestOrganization(secondOwner);

    await addTestMember(firstOrganization.id, firstOwner, member);

    const response = await request(app)
      .get(`/api/v1/organizations/${secondOrganization.id}/members/${member.id}/roles`)
      .set('authorization', `Bearer ${secondOwner.accessToken}`);

    expect(response.status).toBe(404);
  });
});
