import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { app } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  addTestMember,
  assignTestPermission,
  cleanupRbacTestData,
  createTestOrganization,
  createTestRole,
  errorResponseSchema,
  parseJsonResponse,
  permissionListResponseSchema,
  registerTestUser,
  rolePermissionResponseSchema,
  roleResponseSchema,
} from './rbac-test-helpers.js';

afterEach(cleanupRbacTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/v1/permissions', () => {
  it('returns unique seeded permissions in deterministic order', async () => {
    const user = await registerTestUser();

    const response = await request(app)
      .get('/api/v1/permissions')
      .set('authorization', `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);

    const body = permissionListResponseSchema.parse(parseJsonResponse(response.text));

    const keys = body.data.permissions.map((permission) => permission.key);

    expect(keys).toContain('organization:read');
    expect(keys).toContain('member:add');
    expect(keys).toContain('role:assign');

    expect(keys).toEqual([...keys].sort((first, second) => first.localeCompare(second)));

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/permissions');

    expect(response.status).toBe(401);
  });
});

describe('role permission assignments', () => {
  it('allows an OWNER to assign and remove a permission', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Member Manager');

    const assignResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        permissionKey: 'member:add',
      });

    expect(assignResponse.status).toBe(201);

    const assignmentBody = rolePermissionResponseSchema.parse(
      parseJsonResponse(assignResponse.text),
    );

    const roleResponse = await request(app)
      .get(`/api/v1/organizations/${organization.id}/roles/${role.id}`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    const roleBody = roleResponseSchema.parse(parseJsonResponse(roleResponse.text));

    expect(roleBody.data.role.permissions.map((permission) => permission.key)).toContain(
      'member:add',
    );

    const removeResponse = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions/member:add`)
      .set('authorization', `Bearer ${owner.accessToken}`);

    expect(removeResponse.status).toBe(204);

    expect(
      await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: assignmentBody.data.rolePermission.permissionId,
          },
        },
      }),
    ).toBeNull();

    expect(
      await prisma.permission.findUnique({
        where: {
          id: assignmentBody.data.rolePermission.permissionId,
        },
      }),
    ).not.toBeNull();
  });

  it('rejects duplicate and unknown permissions', async () => {
    const owner = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Permission Role');

    await assignTestPermission(organization.id, role.id, 'member:read', owner);

    const duplicateResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        permissionKey: 'member:read',
      });

    expect(duplicateResponse.status).toBe(409);

    const unknownResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({
        permissionKey: 'unknown:permission',
      });

    expect(unknownResponse.status).toBe(404);

    const body = errorResponseSchema.parse(parseJsonResponse(unknownResponse.text));

    expect(body.error.code).toBe('PERMISSION_NOT_FOUND');
  });

  it('prevents a MEMBER from assigning or removing permissions', async () => {
    const owner = await registerTestUser();
    const member = await registerTestUser();
    const organization = await createTestOrganization(owner);
    const role = await createTestRole(organization.id, owner, 'Protected Permission Role');

    await addTestMember(organization.id, owner, member);
    await assignTestPermission(organization.id, role.id, 'member:read', owner);

    const assignResponse = await request(app)
      .post(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions`)
      .set('authorization', `Bearer ${member.accessToken}`)
      .send({
        permissionKey: 'member:add',
      });

    expect(assignResponse.status).toBe(403);

    const removeResponse = await request(app)
      .delete(`/api/v1/organizations/${organization.id}/roles/${role.id}/permissions/member:read`)
      .set('authorization', `Bearer ${member.accessToken}`);

    expect(removeResponse.status).toBe(403);

    const permission = await prisma.permission.findUniqueOrThrow({
      where: {
        key: 'member:read',
      },
    });

    expect(
      await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
      }),
    ).not.toBeNull();
  });
});
