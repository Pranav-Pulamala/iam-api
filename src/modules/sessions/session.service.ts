import type { Prisma, Session } from '@prisma/client';

import { env } from '../../config/env.js';
import { generateRefreshToken, hashRefreshToken } from '../../lib/refresh-token.js';
import { prisma } from '../../lib/prisma.js';
import { serializeSession, type CreatedSession, type SessionMetadata } from './session.types.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_ADDRESS_LENGTH = 45;
type SessionDatabaseClient = Pick<Prisma.TransactionClient, 'session'>;

export interface CreateSessionInput {
  userId: string;
  metadata: SessionMetadata;
}

const normalizeMetadataValue = (value: string | null, maximumLength: number): string | null => {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  return normalizedValue.slice(0, maximumLength);
};

export const calculateSessionExpiration = (createdAt: Date): Date =>
  new Date(createdAt.getTime() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * MILLISECONDS_PER_DAY);

export const createSession = async (
  input: CreateSessionInput,
  createdAt = new Date(),
  database: SessionDatabaseClient = prisma,
): Promise<CreatedSession> => {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = calculateSessionExpiration(createdAt);

  const session = await database.session.create({
    data: {
      userId: input.userId,
      refreshTokenHash,
      expiresAt,
      userAgent: normalizeMetadataValue(input.metadata.userAgent, MAX_USER_AGENT_LENGTH),
      ipAddress: normalizeMetadataValue(input.metadata.ipAddress, MAX_IP_ADDRESS_LENGTH),
    },
  });

  return {
    session: serializeSession(session, session.id),
    refreshToken,
  };
};

export const findSessionByRefreshToken = async (refreshToken: string): Promise<Session | null> => {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  return prisma.session.findUnique({
    where: {
      refreshTokenHash,
    },
  });
};

export const isSessionActive = (session: Session, checkedAt = new Date()): boolean =>
  session.revokedAt === null && session.expiresAt.getTime() > checkedAt.getTime();
