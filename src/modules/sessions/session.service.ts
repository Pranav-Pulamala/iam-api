import type { Prisma, Session } from '@prisma/client';

import { env } from '../../config/env.js';
import { generateRefreshToken, hashRefreshToken } from '../../lib/refresh-token.js';
import { prisma } from '../../lib/prisma.js';
import {
  serializeSession,
  type CreatedSession,
  type RotatedSession,
  type SafeSession,
  type SessionMetadata,
} from './session.types.js';

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

export const rotateSessionRefreshToken = async (
  refreshToken: string,
  metadata: SessionMetadata,
  rotatedAt = new Date(),
): Promise<RotatedSession | null> => {
  const presentedTokenHash = hashRefreshToken(refreshToken);
  const replacementRefreshToken = generateRefreshToken();
  const replacementTokenHash = hashRefreshToken(replacementRefreshToken);

  return prisma.$transaction(async (transaction) => {
    const matchedSession = await transaction.session.findFirst({
      where: {
        OR: [
          {
            refreshTokenHash: presentedTokenHash,
          },
          {
            previousRefreshTokenHash: presentedTokenHash,
          },
        ],
      },
      include: {
        user: true,
      },
    });

    if (matchedSession === null) {
      return null;
    }

    const replayDetected = matchedSession.previousRefreshTokenHash === presentedTokenHash;

    if (replayDetected) {
      await transaction.session.updateMany({
        where: {
          userId: matchedSession.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: rotatedAt,
        },
      });

      return null;
    }

    if (
      matchedSession.refreshTokenHash !== presentedTokenHash ||
      matchedSession.revokedAt !== null ||
      matchedSession.expiresAt.getTime() <= rotatedAt.getTime() ||
      !matchedSession.user.isActive
    ) {
      return null;
    }

    const rotation = await transaction.session.updateMany({
      where: {
        id: matchedSession.id,
        refreshTokenHash: presentedTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: rotatedAt,
        },
      },
      data: {
        refreshTokenHash: replacementTokenHash,
        previousRefreshTokenHash: presentedTokenHash,
        lastUsedAt: rotatedAt,
        userAgent: normalizeMetadataValue(metadata.userAgent, MAX_USER_AGENT_LENGTH),
        ipAddress: normalizeMetadataValue(metadata.ipAddress, MAX_IP_ADDRESS_LENGTH),
      },
    });

    if (rotation.count !== 1) {
      await transaction.session.updateMany({
        where: {
          userId: matchedSession.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: rotatedAt,
        },
      });

      return null;
    }

    const rotatedSession = await transaction.session.findUniqueOrThrow({
      where: {
        id: matchedSession.id,
      },
    });

    return {
      session: rotatedSession,
      user: matchedSession.user,
      refreshToken: replacementRefreshToken,
    };
  });
};

export const revokeSession = async (
  userId: string,
  sessionId: string,
  revokedAt = new Date(),
): Promise<void> => {
  await prisma.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt,
    },
  });
};

export const listUserSessions = async (
  userId: string,
  currentSessionId: string,
): Promise<SafeSession[]> => {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
  });

  return sessions.map((session) => serializeSession(session, currentSessionId));
};

export const isSessionActive = (session: Session, checkedAt = new Date()): boolean =>
  session.revokedAt === null && session.expiresAt.getTime() > checkedAt.getTime();
