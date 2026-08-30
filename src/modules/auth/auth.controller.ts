import type { Request, RequestHandler, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import type { SessionMetadata } from '../sessions/session.types.js';
import {
  loginRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from './auth.schemas.js';
import { loginUser, logoutUserSession, refreshUserSession, registerUser } from './auth.service.js';
import {
  serializeSafeUser,
  type AuthenticationResponse,
  type AuthenticationResult,
  type CurrentUserResponse,
} from './auth.types.js';

const getSessionMetadata = (request: Request): SessionMetadata => ({
  userAgent: request.get('user-agent') ?? null,
  ipAddress: request.ip ?? null,
});

const createUnauthorizedError = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });

const sendAuthenticationResponse = (
  response: Response,
  statusCode: 200 | 201,
  result: AuthenticationResult,
): void => {
  const responseBody: AuthenticationResponse = {
    data: {
      user: serializeSafeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  };

  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.status(statusCode).json(responseBody);
};

export const register: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = registerRequestSchema.parse(unvalidatedBody);
  const result = await registerUser(input, getSessionMetadata(request));

  sendAuthenticationResponse(response, 201, result);
};

export const login: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = loginRequestSchema.parse(unvalidatedBody);
  const result = await loginUser(input, getSessionMetadata(request));

  sendAuthenticationResponse(response, 200, result);
};

export const refresh: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = refreshTokenRequestSchema.parse(unvalidatedBody);
  const result = await refreshUserSession(input, getSessionMetadata(request));

  sendAuthenticationResponse(response, 200, result);
};

export const logout: RequestHandler = async (request, response) => {
  const authenticatedUser = request.authenticatedUser;
  const authenticatedSessionId = request.authenticatedSessionId;

  if (authenticatedUser === undefined || authenticatedSessionId === undefined) {
    throw createUnauthorizedError();
  }

  await logoutUserSession(authenticatedUser.id, authenticatedSessionId);

  response.status(204).send();
};

export const getCurrentUser: RequestHandler = (request, response) => {
  const authenticatedUser = request.authenticatedUser;

  if (authenticatedUser === undefined) {
    throw createUnauthorizedError();
  }

  const responseBody: CurrentUserResponse = {
    data: {
      user: serializeSafeUser(authenticatedUser),
    },
  };

  response.status(200).json(responseBody);
};
