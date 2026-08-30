import { randomUUID } from 'node:crypto';

import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { hashRefreshToken } from '../../src/lib/refresh-token.js';
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

const createTestEmail = (): string => {
  const email = `auth-${randomUUID()}@example.com`;
  testEmails.add(email);
  return email;
};

const registerTestUser = async (
  email: string,
  password = 'StrongPassword123!',
): Promise<z.infer<typeof authenticationResponseSchema>> => {
  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
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

describe('POST /api/v1/auth/register', () => {
  it('registers a user and creates a persistent session', async () => {
    const email = createTestEmail();

    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('user-agent', 'iam-api-registration-test')
      .send({
        email,
        password: 'StrongPassword123!',
      });

    expect(response.status).toBe(201);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.user.email).toBe(email);
    expect(responseBody.data.accessToken.length).toBeGreaterThan(0);
    expect(responseBody.data.refreshToken.length).toBeGreaterThanOrEqual(32);

    const accessTokenPayload = decodeJwt(responseBody.data.accessToken);
    const sessionId = z.string().uuid().parse(accessTokenPayload.sid);

    expect(accessTokenPayload.sub).toBe(responseBody.data.user.id);

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: {
        email,
      },
    });

    expect(storedUser.passwordHash).not.toBe('StrongPassword123!');
    expect(storedUser.passwordHash.startsWith('$argon2id$')).toBe(true);

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    expect(storedSession.userId).toBe(storedUser.id);
    expect(storedSession.refreshTokenHash).toBe(hashRefreshToken(responseBody.data.refreshToken));
    expect(storedSession.refreshTokenHash).not.toBe(responseBody.data.refreshToken);
    expect(storedSession.userAgent).toBe('iam-api-registration-test');
    expect(storedSession.ipAddress).not.toBeNull();
    expect(storedSession.revokedAt).toBeNull();
    expect(storedSession.lastUsedAt).toBeNull();
    expect(storedSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('trims and lowercases an email before storage', async () => {
    const normalizedEmail = createTestEmail();

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `  ${normalizedEmail.toUpperCase()}  `,
        password: 'StrongPassword123!',
      });

    expect(response.status).toBe(201);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.user.email).toBe(normalizedEmail);

    const storedUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    expect(storedUser).not.toBeNull();
  });

  it('rejects an invalid email', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(400);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a weak password', async () => {
    const email = createTestEmail();

    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'weak-password',
    });

    expect(response.status).toBe(400);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate email registration', async () => {
    const email = createTestEmail();

    await registerTestUser(email);

    const response = await request(app).post('/api/v1/auth/register').send({
      email: email.toUpperCase(),
      password: 'AnotherStrongPassword456!',
    });

    expect(response.status).toBe(409);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('does not return the password or refresh-token hash', async () => {
    const email = createTestEmail();

    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(201);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('StrongPassword123!');
    expect(response.text).not.toContain(hashRefreshToken(responseBody.data.refreshToken));
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in and creates a separate persistent session', async () => {
    const email = createTestEmail();
    await registerTestUser(email);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('user-agent', 'iam-api-login-test')
      .send({
        email: `  ${email.toUpperCase()}  `,
        password: 'StrongPassword123!',
      });

    expect(response.status).toBe(200);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

    const accessTokenPayload = decodeJwt(responseBody.data.accessToken);
    const sessionId = z.string().uuid().parse(accessTokenPayload.sid);

    expect(responseBody.data.user.email).toBe(email);
    expect(accessTokenPayload.sub).toBe(responseBody.data.user.id);

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    expect(storedSession.userId).toBe(responseBody.data.user.id);
    expect(storedSession.refreshTokenHash).toBe(hashRefreshToken(responseBody.data.refreshToken));
    expect(storedSession.userAgent).toBe('iam-api-login-test');

    const sessionCount = await prisma.session.count({
      where: {
        userId: responseBody.data.user.id,
      },
    });

    expect(sessionCount).toBe(2);
  });

  it('rejects an incorrect password', async () => {
    const email = createTestEmail();
    await registerTestUser(email);

    const response = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'IncorrectPassword123!',
    });

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('INVALID_CREDENTIALS');
    expect(responseBody.error.message).toBe('Invalid email or password.');
  });

  it('rejects an unknown email', async () => {
    const email = createTestEmail();

    const response = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('INVALID_CREDENTIALS');
    expect(responseBody.error.message).toBe('Invalid email or password.');
  });

  it('uses the same response for wrong-password and unknown-email failures', async () => {
    const existingEmail = createTestEmail();
    const unknownEmail = createTestEmail();
    const requestId = randomUUID();

    await registerTestUser(existingEmail);

    const wrongPasswordResponse = await request(app)
      .post('/api/v1/auth/login')
      .set('x-request-id', requestId)
      .send({
        email: existingEmail,
        password: 'IncorrectPassword123!',
      });

    const unknownEmailResponse = await request(app)
      .post('/api/v1/auth/login')
      .set('x-request-id', requestId)
      .send({
        email: unknownEmail,
        password: 'StrongPassword123!',
      });

    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownEmailResponse.status).toBe(401);

    const wrongPasswordBody = errorResponseSchema.parse(
      parseJsonResponse(wrongPasswordResponse.text),
    );
    const unknownEmailBody = errorResponseSchema.parse(
      parseJsonResponse(unknownEmailResponse.text),
    );

    expect(wrongPasswordBody).toEqual(unknownEmailBody);
  });

  it('does not return the password hash', async () => {
    const email = createTestEmail();
    await registerTestUser(email);

    const response = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'StrongPassword123!',
    });

    expect(response.status).toBe(200);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));

    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('StrongPassword123!');
    expect(response.text).not.toContain(hashRefreshToken(responseBody.data.refreshToken));
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);
    const originalAccessPayload = decodeJwt(registration.data.accessToken);
    const sessionId = z.string().uuid().parse(originalAccessPayload.sid);

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('user-agent', 'iam-api-refresh-test')
      .send({
        refreshToken: registration.data.refreshToken,
      });

    expect(response.status).toBe(200);

    const responseBody = authenticationResponseSchema.parse(parseJsonResponse(response.text));
    const replacementAccessPayload = decodeJwt(responseBody.data.accessToken);

    expect(responseBody.data.user.id).toBe(registration.data.user.id);
    expect(responseBody.data.refreshToken).not.toBe(registration.data.refreshToken);
    expect(replacementAccessPayload.sub).toBe(registration.data.user.id);
    expect(replacementAccessPayload.sid).toBe(sessionId);

    const storedSession = await prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    expect(storedSession.refreshTokenHash).toBe(hashRefreshToken(responseBody.data.refreshToken));
    expect(storedSession.previousRefreshTokenHash).toBe(
      hashRefreshToken(registration.data.refreshToken),
    );
    expect(storedSession.refreshTokenHash).not.toBe(responseBody.data.refreshToken);
    expect(storedSession.lastUsedAt).not.toBeNull();
    expect(storedSession.userAgent).toBe('iam-api-refresh-test');
    expect(storedSession.revokedAt).toBeNull();
  });

  it('rejects a malformed request body', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: '',
    });

    expect(response.status).toBe(400);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown refresh token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: 'unknown-refresh-token-that-is-long-enough-for-validation',
    });

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(responseBody.error.message).toBe('Refresh token is invalid or expired.');
  });

  it('rejects an expired session', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);
    const accessPayload = decodeJwt(registration.data.accessToken);
    const sessionId = z.string().uuid().parse(accessPayload.sid);

    await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(responseBody.error.message).toBe('Refresh token is invalid or expired.');
  });

  it('rejects a revoked session', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);
    const accessPayload = decodeJwt(registration.data.accessToken);
    const sessionId = z.string().uuid().parse(accessPayload.sid);

    await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const response = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(responseBody.error.message).toBe('Refresh token is invalid or expired.');
  });

  it('detects replay and revokes all active sessions', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'StrongPassword123!',
    });

    expect(loginResponse.status).toBe(200);

    const loginBody = authenticationResponseSchema.parse(parseJsonResponse(loginResponse.text));

    const rotationResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(rotationResponse.status).toBe(200);

    const rotationBody = authenticationResponseSchema.parse(
      parseJsonResponse(rotationResponse.text),
    );

    const replayResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: registration.data.refreshToken,
    });

    expect(replayResponse.status).toBe(401);

    const replayBody = errorResponseSchema.parse(parseJsonResponse(replayResponse.text));

    expect(replayBody.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(replayBody.error.message).toBe('Refresh token is invalid or expired.');

    const activeSessionCount = await prisma.session.count({
      where: {
        userId: registration.data.user.id,
        revokedAt: null,
      },
    });

    expect(activeSessionCount).toBe(0);

    const rotatedTokenResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: rotationBody.data.refreshToken,
    });

    expect(rotatedTokenResponse.status).toBe(401);

    const secondSessionResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: loginBody.data.refreshToken,
    });

    expect(secondSessionResponse.status).toBe(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the authenticated user', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(200);

    const responseBody = currentUserResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.data.user.id).toBe(registration.data.user.id);
    expect(responseBody.data.user.email).toBe(email);
  });

  it('rejects a missing Authorization header', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed Bearer header', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', 'Basic invalid-credentials');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an otherwise valid token without a session ID claim', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);
    const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

    const tokenWithoutSessionId = await new SignJWT({})
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setSubject(registration.data.user.id)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(jwtSecret);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${tokenWithoutSessionId}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);
    const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

    const expiredToken = await new SignJWT({})
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setSubject(registration.data.user.id)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(jwtSecret);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token belonging to a deleted user', async () => {
    const email = createTestEmail();
    const registration = await registerTestUser(email);

    await prisma.user.delete({
      where: {
        id: registration.data.user.id,
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${registration.data.accessToken}`);

    expect(response.status).toBe(401);

    const responseBody = errorResponseSchema.parse(parseJsonResponse(response.text));

    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });
});
