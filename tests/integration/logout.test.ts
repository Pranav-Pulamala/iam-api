import { randomUUID } from 'node:crypto';

import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

const testEmails = new Set<string>();

const serializedUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    isActive: z.boolean(),
    emailVerifiedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const authenticationResponseSchema = z
  .object({
    data: z
      .object({
        user: serializedUserSchema,
        accessToken: z.string().min(1),
        refreshToken: z.string().min(32),
      })
      .strict(),
  })
  .strict();

const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().min(1),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

const parseJsonResponse = (responseText: string): unknown => {
  const parsedResponse: unknown = JSON.parse(responseText);
  return parsedResponse;
};

const registerTestUser = async (): Promise<z.infer<typeof authenticationResponseSchema>> => {
  const email = `logout-${randomUUID()}@example.com`;
  testEmails.add(email);

  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(201);

  return authenticationResponseSchema.parse(parseJsonResponse(response.text));
};

afterEach(async () => {
  const emails = Array.from(testEmails);

  if (emails.length > 0) {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: emails,
        },
      },
    });
  }

  testEmails.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the current session and returns no content', async () => {
    const registration = await registerTestUser();
    const accessTokenPayload = decodeJwt(registration.data.accessToken);
    const sessionId = z.string().uuid().parse(accessTokenPayload.sid);

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    expect(storedSession.revokedAt).not.toBeNull();
  });

  it('rejects use of the access token after logout', async () => {
    const registration = await registerTestUser();

    const logoutResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(logoutResponse.status).toBe(204);

    const currentUserResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(currentUserResponse.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(currentUserResponse.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects use of the refresh token after logout', async () => {
    const registration = await registerTestUser();

    const logoutResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(logoutResponse.status).toBe(204);

    const refreshResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(refreshResponse.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(refreshResponse.text));

    expect(responseBody.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects logout without an access token', async () => {
    const response = await request(app).post('/api/v1/auth/logout');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects repeated logout with the revoked access token', async () => {
    const registration = await registerTestUser();

    const firstResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(firstResponse.status).toBe(204);

    const secondResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(secondResponse.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(secondResponse.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });
});
