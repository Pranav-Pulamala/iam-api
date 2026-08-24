import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { evaluatePermission } from '../../src/modules/authorization/authorization.service.js';
import { PERMISSIONS } from '../../src/modules/authorization/permissions.js';
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
} from './rbac/rbac-test-helpers.js';

afterEach(cleanupRbacTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('authorization decision engine', () => {
  it('allows a user when an assigned role grants the permission', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Reader');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, role.id, PERMISSIONS.MEMBER_READ, owner);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const decision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.MEMBER_READ,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('ROLE_PERMISSION_MATCH');
    expect(decision.matchedRoleIds).toEqual([role.id]);
  });

  it('uses union semantics when only one of multiple roles grants permission', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const unrelatedRole = await createTestRole(organization.id, owner, 'Unrelated');
    const matchingRole = await createTestRole(organization.id, owner, 'Matching');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(
      organization.id,
      unrelatedRole.id,
      PERMISSIONS.ORGANIZATION_READ,
      owner,
    );
    await assignTestPermission(organization.id, matchingRole.id, PERMISSIONS.ROLE_CREATE, owner);
    await assignTestRole(organization.id, member.id, unrelatedRole.id, owner);
    await assignTestRole(organization.id, member.id, matchingRole.id, owner);

    const decision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.ROLE_CREATE,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('ROLE_PERMISSION_MATCH');
    expect(decision.matchedRoleIds).toEqual([matchingRole.id]);
  });

  it('denies a member whose roles do not grant the requested permission', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Viewer');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, role.id, PERMISSIONS.ROLE_READ, owner);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const decision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.ROLE_CREATE,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('PERMISSION_NOT_GRANTED');
    expect(decision.matchedRoleIds).toEqual([]);
  });

  it('denies a member with no custom roles', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);

    await addTestMember(organization.id, owner, member);

    const decision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.MEMBER_READ,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('PERMISSION_NOT_GRANTED');
  });

  it('denies a non-member without revealing organization existence', async () => {
    const owner = await registerTestUser();
    const nonMember = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const decision = await evaluatePermission({
      userId: nonMember.id,
      organizationId: organization.id,
      permission: PERMISSIONS.ORGANIZATION_READ,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('NOT_A_MEMBER');

    const response = await request(app)
      .get(`/api/v1/organizations/${organization.id}`)
      .set('authorization', `Bearer ${nonMember.accessToken}`);

    expect(response.status).toBe(404);

    const body = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(body.error.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('allows a structural OWNER to bootstrap RBAC without custom roles', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);

    const decision = await evaluatePermission({
      userId: owner.id,
      organizationId: organization.id,
      permission: PERMISSIONS.ROLE_CREATE,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('STRUCTURAL_OWNER');
    expect(decision.matchedRoleIds).toEqual([]);

    const response = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'First Role',
      });

    expect(response.status).toBe(201);
  });

  it('does not turn a custom Admin role into structural ownership', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const adminRole = await createTestRole(organization.id, owner, 'Admin');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, adminRole.id, PERMISSIONS.ROLE_READ, owner);
    await assignTestRole(organization.id, member.id, adminRole.id, owner);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: organization.id,
        },
      },
    });

    const grantedDecision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.ROLE_READ,
    });

    const deniedDecision = await evaluatePermission({
      userId: member.id,
      organizationId: organization.id,
      permission: PERMISSIONS.MEMBER_REMOVE,
    });

    expect(membership.role).toBe('MEMBER');
    expect(grantedDecision.allowed).toBe(true);
    expect(grantedDecision.reason).toBe('ROLE_PERMISSION_MATCH');
    expect(deniedDecision.allowed).toBe(false);
  });

  it('isolates permissions between organizations', async () => {
    const firstOwner = await registerTestUser();
    const secondOwner = await registerTestUser();
    const member = await registerTestUser();
    const firstOrganization = await createTestOrganization(firstOwner);
    const secondOrganization = await createTestOrganization(secondOwner);

    await addTestMember(firstOrganization.id, firstOwner, member);
    await addTestMember(secondOrganization.id, secondOwner, member);

    const adminRole = await createTestRole(firstOrganization.id, firstOwner, 'Admin');
    const viewerRole = await createTestRole(secondOrganization.id, secondOwner, 'Viewer');

    await assignTestPermission(
      firstOrganization.id,
      adminRole.id,
      PERMISSIONS.MEMBER_ADD,
      firstOwner,
    );
    await assignTestPermission(
      secondOrganization.id,
      viewerRole.id,
      PERMISSIONS.MEMBER_READ,
      secondOwner,
    );

    await assignTestRole(firstOrganization.id, member.id, adminRole.id, firstOwner);
    await assignTestRole(secondOrganization.id, member.id, viewerRole.id, secondOwner);

    const firstOrganizationDecision = await evaluatePermission({
      userId: member.id,
      organizationId: firstOrganization.id,
      permission: PERMISSIONS.MEMBER_ADD,
    });

    const leakedPermissionDecision = await evaluatePermission({
      userId: member.id,
      organizationId: secondOrganization.id,
      permission: PERMISSIONS.MEMBER_ADD,
    });

    const secondOrganizationDecision = await evaluatePermission({
      userId: member.id,
      organizationId: secondOrganization.id,
      permission: PERMISSIONS.MEMBER_READ,
    });

    expect(firstOrganizationDecision.allowed).toBe(true);
    expect(leakedPermissionDecision.allowed).toBe(false);
    expect(secondOrganizationDecision.allowed).toBe(true);
  });
});

describe('permission middleware', () => {
  it('returns 401 when authentication is missing', async () => {
    const response = await request(app).get(`/api/v1/organizations/${randomUUID()}/roles`);

    expect(response.status).toBe(401);
  });

  it('allows a member with permission and rejects a missing permission', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Role Reader');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, role.id, PERMISSIONS.ROLE_READ, owner);
    await assignTestRole(organization.id, member.id, role.id, owner);

    const allowedResponse = await request(app)
      .get(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(allowedResponse.status).toBe(200);

    const deniedResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        name: 'Forbidden Role',
      });

    expect(deniedResponse.status).toBe(403);

    const body = errorResponseSchema.parse(parseJsonResponse(deniedResponse.text));

    expect(body.error.code).toBe('INSUFFICIENT_PERMISSION');
    expect(deniedResponse.text).not.toContain(role.id);
  });

  it('supports permission changes without changing structural membership', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const target = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const managerRole = await createTestRole(organization.id, owner, 'Member Manager');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, managerRole.id, PERMISSIONS.MEMBER_ADD, owner);
    await assignTestRole(organization.id, member.id, managerRole.id, owner);

    const allowedResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/members`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        userId: target.id,
      });

    expect(allowedResponse.status).toBe(201);

    const deniedResponse = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${target.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(deniedResponse.status).toBe(403);

    await assignTestPermission(organization.id, managerRole.id, PERMISSIONS.MEMBER_REMOVE, owner);

    const newlyAllowedResponse = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${target.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(newlyAllowedResponse.status).toBe(204);
  });
});

describe('authorization and business invariants', () => {
  it('does not allow member:remove to remove a structural OWNER', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const managerRole = await createTestRole(organization.id, owner, 'Removal Manager');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, managerRole.id, PERMISSIONS.MEMBER_REMOVE, owner);
    await assignTestRole(organization.id, member.id, managerRole.id, owner);

    const response = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/members/${owner.id}`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(409);

    const ownerMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: owner.id,
          organizationId: organization.id,
        },
      },
    });

    expect(ownerMembership?.role).toBe('OWNER');
  });
});
