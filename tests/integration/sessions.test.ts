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

const safeSessionSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    lastUsedAt: z.string().datetime({ offset: true }).nullable(),
    userAgent: z.string().nullable(),
    ipAddress: z.string().nullable(),
    currentSession: z.boolean(),
  })
  .strict();

const sessionListResponseSchema = z
  .object({
    data: z
      .object({
        sessions: z.array(safeSessionSchema),
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
  const email = `sessions-${randomUUID()}@example.com`;
  testEmails.add(email);

  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('user-agent', 'registration-session')
    .send({
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

describe('GET /api/v1/auth/sessions', () => {
  it('lists all sessions belonging to the authenticated user', async () => {
    const registration = await registerTestUser();

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .set('user-agent', 'login-session')
      .send({
        email: registration.data.user.email,
        password: 'StrongPassword123!',
      });

    expect(loginResponse.status).toBe(200);

    const loginBody = authenticationResponseSchema.parse(parseJsonResponse(loginResponse.text));

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${loginBody.data.accessToken}`);

    expect(response.status).toBe(200);

    const responseBody = sessionListResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.sessions).toHaveLength(2);

    const sessionIds = responseBody.data.sessions.map((session) => session.id);

    const registrationSessionId = z
      .string()
      .uuid()
      .parse(decodeJwt(registration.data.accessToken).sid);
    const loginSessionId = z.string().uuid().parse(decodeJwt(loginBody.data.accessToken).sid);

    expect(sessionIds).toContain(registrationSessionId);
    expect(sessionIds).toContain(loginSessionId);

    const currentSessions = responseBody.data.sessions.filter((session) => session.currentSession);

    expect(currentSessions).toHaveLength(1);
    expect(currentSessions[0]?.id).toBe(loginSessionId);
  });

  it('returns safe metadata without authentication secrets', async () => {
    const registration = await registerTestUser();

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(200);

    const responseBody = sessionListResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.sessions).toHaveLength(1);
    expect(responseBody.data.sessions[0]?.userAgent).toBe('registration-session');
    expect(response.text).not.toContain('refreshToken');
    expect(response.text).not.toContain('refreshTokenHash');
    expect(response.text).not.toContain(registration.data.refreshToken);
  });

  it('does not expose another user’s sessions', async () => {
    const firstUser = await registerTestUser();
    const secondUser = await registerTestUser();

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${firstUser.data.accessToken}`);

    expect(response.status).toBe(200);

    const responseBody = sessionListResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.sessions).toHaveLength(1);

    const secondUserSessionId = z.string().uuid().parse(decodeJwt(secondUser.data.accessToken).sid);

    expect(responseBody.data.sessions.some((session) => session.id === secondUserSessionId)).toBe(
      false,
    );
  });

  it('rejects requests without an access token', async () => {
    const response = await request(app).get('/api/v1/auth/sessions');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests using a revoked session', async () => {
    const registration = await registerTestUser();

    const logoutResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(logoutResponse.status).toBe(204);

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });
});
