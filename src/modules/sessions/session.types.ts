import type { Session, User } from '@prisma/client';

export interface SessionMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface SafeSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  currentSession: boolean;
}

export interface CreatedSession {
  session: SafeSession;
  refreshToken: string;
}

export interface RotatedSession {
  session: Session;
  user: User;
  refreshToken: string;
}

export const serializeSession = (
  session: Session,
  currentSessionId: string | null,
): SafeSession => ({
  id: session.id,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
  expiresAt: session.expiresAt.toISOString(),
  revokedAt: session.revokedAt?.toISOString() ?? null,
  lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
  userAgent: session.userAgent,
  ipAddress: session.ipAddress,
  currentSession: session.id === currentSessionId,
});
