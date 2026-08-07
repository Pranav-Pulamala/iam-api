import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { jwtVerify, SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import {
  accessTokenSubjectSchema,
  type LoginRequest,
  type RegisterRequest,
} from './auth.schemas.js';
import { toSafeUser, type AuthenticationResult, type SafeUser } from './auth.types.js';

const ARGON2_MEMORY_COST = 19_456;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const JWT_ALGORITHM = 'HS256';

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: ARGON2_MEMORY_COST,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
} as const;

const dummyPasswordHashPromise = argon2.hash(
  'TimingDefenseOnly-NotAUserPassword-1!',
  passwordHashOptions,
);

const createAuthenticationFailure = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  });

const issueAccessToken = async (userId: string): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({
      alg: JWT_ALGORITHM,
      typ: 'JWT',
    })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(jwtSecret);

export const registerUser = async (input: RegisterRequest): Promise<AuthenticationResult> => {
  const passwordHash = await argon2.hash(input.password, passwordHashOptions);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
      },
    });

    return {
      user: toSafeUser(user),
      accessToken: await issueAccessToken(user.id),
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        statusCode: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
        cause: error,
      });
    }

    throw error;
  }
};

export const loginUser = async (input: LoginRequest): Promise<AuthenticationResult> => {
  const [user, dummyPasswordHash] = await Promise.all([
    prisma.user.findUnique({
      where: {
        email: input.email,
      },
    }),
    dummyPasswordHashPromise,
  ]);

  const passwordHash = user?.passwordHash ?? dummyPasswordHash;
  const passwordIsValid = await argon2.verify(passwordHash, input.password);

  if (user === null || !passwordIsValid || !user.isActive) {
    throw createAuthenticationFailure();
  }

  return {
    user: toSafeUser(user),
    accessToken: await issueAccessToken(user.id),
  };
};

export const authenticateAccessToken = async (accessToken: string): Promise<SafeUser> => {
  let subject: string;

  try {
    const verification = await jwtVerify(accessToken, jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    const parsedSubject = accessTokenSubjectSchema.safeParse(verification.payload.sub);

    if (!parsedSubject.success) {
      throw new Error('JWT subject is missing or invalid.');
    }

    subject = parsedSubject.data;
  } catch (error: unknown) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
      cause: error,
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: subject,
    },
  });

  if (user?.isActive !== true) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  }

  return toSafeUser(user);
};
