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

const currentUserResponseSchema = z
  .object({
    data: z
      .object({
        user: serializedUserSchema,
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
  const email = `session-revocation-${randomUUID()}@example.com`;
  testEmails.add(email);

  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(201);

  return authenticationResponseSchema.parse(parseJsonResponse(response.text));
};

const loginTestUser = async (
  email: string,
): Promise<z.infer<typeof authenticationResponseSchema>> => {
  const response = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(200);

  return authenticationResponseSchema.parse(parseJsonResponse(response.text));
};

const getSessionId = (accessToken: string): string =>
  z.string().uuid().parse(decodeJwt(accessToken).sid);

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

describe('DELETE /api/v1/auth/sessions/:sessionId', () => {
  it('revokes one session belonging to the current user', async () => {
    const registration = await registerTestUser();
    const currentSession = await loginTestUser(registration.data.user.email);
    const targetSessionId = getSessionId(registration.data.accessToken);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const revokedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: targetSessionId,
      },
    });

    expect(revokedSession.revokedAt).not.toBeNull();

    const targetAccessResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(targetAccessResponse.status).toBe(401);

    const currentAccessResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(currentAccessResponse.status).toBe(200);

    expect(() =>
      currentUserResponseSchema.parse(parseJsonResponse(currentAccessResponse.text)),
    ).not.toThrow();
  });

  it('can revoke the current session', async () => {
    const registration = await registerTestUser();
    const currentSessionId = getSessionId(registration.data.accessToken);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${currentSessionId}`)
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(204);

    const followUpResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(followUpResponse.status).toBe(401);
  });

  it('does not revoke another user’s session', async () => {
    const firstUser = await registerTestUser();
    const secondUser = await registerTestUser();
    const secondUserSessionId = getSessionId(secondUser.data.accessToken);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${secondUserSessionId}`)
      .set('authorization', `Bearer ${firstUser.data.accessToken}`);

    expect(response.status).toBe(404);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('SESSION_NOT_FOUND');

    const secondUserSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: secondUserSessionId,
      },
    });

    expect(secondUserSession.revokedAt).toBeNull();
  });

  it('returns not found for an already revoked session', async () => {
    const registration = await registerTestUser();
    const currentSession = await loginTestUser(registration.data.user.email);
    const targetSessionId = getSessionId(registration.data.accessToken);

    const firstResponse = await request(app)
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(firstResponse.status).toBe(204);

    const secondResponse = await request(app)
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(secondResponse.status).toBe(404);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(secondResponse.text));

    expect(responseBody.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects an invalid session ID', async () => {
    const registration = await registerTestUser();

    const response = await request(app)
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(400);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const response = await request(app).delete(`/api/v1/auth/sessions/${randomUUID()}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /api/v1/auth/sessions/others', () => {
  it('revokes every other session while preserving the current session', async () => {
    const registration = await registerTestUser();
    const secondSession = await loginTestUser(registration.data.user.email);
    const currentSession = await loginTestUser(registration.data.user.email);

    const registrationSessionId = getSessionId(registration.data.accessToken);
    const secondSessionId = getSessionId(secondSession.data.accessToken);
    const currentSessionId = getSessionId(currentSession.data.accessToken);

    const response = await request(app)
      .delete('/api/v1/auth/sessions/others')
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const sessions = await prisma.session.findMany({
      where: {
        userId: registration.data.user.id,
      },
    });

    const sessionById = new Map(sessions.map((session) => [session.id, session]));

    expect(sessionById.get(registrationSessionId)?.revokedAt).not.toBeNull();
    expect(sessionById.get(secondSessionId)?.revokedAt).not.toBeNull();
    expect(sessionById.get(currentSessionId)?.revokedAt).toBeNull();

    const currentAccessResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${currentSession.data.accessToken}`);

    expect(currentAccessResponse.status).toBe(200);

    const revokedAccessResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${secondSession.data.accessToken}`);

    expect(revokedAccessResponse.status).toBe(401);
  });

  it('succeeds when there are no other active sessions', async () => {
    const registration = await registerTestUser();

    const response = await request(app)
      .delete('/api/v1/auth/sessions/others')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(204);

    const currentSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: getSessionId(registration.data.accessToken),
      },
    });

    expect(currentSession.revokedAt).toBeNull();
  });

  it('requires authentication', async () => {
    const response = await request(app).delete('/api/v1/auth/sessions/others');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });
});
