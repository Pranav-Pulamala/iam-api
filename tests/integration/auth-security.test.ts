import { randomUUID } from 'node:crypto';

import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
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
  const email = `auth-security-${randomUUID()}@example.com`;
  testEmails.add(email);

  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPassword123!',
  });

  expect(response.status).toBe(201);

  return authenticationResponseSchema.parse(parseJsonResponse(response.text));
};

const createAccessToken = async (userId: string, sessionId: string): Promise<string> => {
  const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

  return new SignJWT({
    sid: sessionId,
  })
    .setProtectedHeader({
      alg: 'HS256',
      typ: 'JWT',
    })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtSecret);
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

describe('authentication response caching', () => {
  it('prevents registration responses from being cached', async () => {
    const email = `auth-cache-${randomUUID()}@example.com`;
    testEmails.add(email);

    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('prevents login responses from being cached', async () => {
    const registration = await registerTestUser();

    const response = await request(app).post('/api/v1/auth/login').send({
      email: registration.data.user.email,
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('prevents refresh responses from being cached', async () => {
    const registration = await registerTestUser();

    const response = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });
});

describe('access-token session binding', () => {
  it('rejects a token whose user does not own its session', async () => {
    const firstUser = await registerTestUser();
    const secondUser = await registerTestUser();

    const secondUserSessionId = z.string().uuid().parse(decodeJwt(secondUser.data.accessToken).sid);

    const substitutedToken = await createAccessToken(firstUser.data.user.id, secondUserSessionId);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${substitutedToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
    expect(responseBody.error.message).toBe('Authentication is required.');
  });

  it('rejects a token referencing a nonexistent session', async () => {
    const registration = await registerTestUser();

    const tokenWithUnknownSession = await createAccessToken(
      registration.data.user.id,
      randomUUID(),
    );

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${tokenWithUnknownSession}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
    expect(responseBody.error.message).toBe('Authentication is required.');
  });

  it('rejects a token referencing an expired session', async () => {
    const registration = await registerTestUser();
    const sessionId = z.string().uuid().parse(decodeJwt(registration.data.accessToken).sid);

    await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token referencing a revoked session', async () => {
    const registration = await registerTestUser();
    const sessionId = z.string().uuid().parse(decodeJwt(registration.data.accessToken).sid);

    await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('does not expose session or token hashes in an authentication error', async () => {
    const registration = await registerTestUser();
    const sessionId = z.string().uuid().parse(decodeJwt(registration.data.accessToken).sid);

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(401);
    expect(response.text).not.toContain(storedSession.refreshTokenHash);
    expect(response.text).not.toContain(registration.data.refreshToken);
    expect(response.text).not.toContain(registration.data.accessToken);
  });
});
