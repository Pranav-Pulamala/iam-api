import type { User } from '@prisma/client';

export interface SafeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedIdentity {
  user: SafeUser;
  sessionId: string;
}

export interface SerializedSafeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticationResult {
  user: SafeUser;
  accessToken: string;
}

export interface AuthenticationResponse {
  data: {
    user: SerializedSafeUser;
    accessToken: string;
  };
}

export interface CurrentUserResponse {
  data: {
    user: SerializedSafeUser;
  };
}

export const toSafeUser = (user: User): SafeUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isActive: user.isActive,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const serializeSafeUser = (user: SafeUser): SerializedSafeUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isActive: user.isActive,
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
