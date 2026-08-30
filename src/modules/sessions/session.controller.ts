import type { Request } from 'express';
import type { RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import { sessionParamsSchema } from './session.schemas.js';
import { listUserSessions, revokeOtherSessions, revokeUserSession } from './session.service.js';
import type { SessionListResponse } from './session.types.js';

interface CurrentSessionIdentity {
  userId: string;
  sessionId: string;
}

const createUnauthorizedError = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });

const getCurrentSessionIdentity = (request: Request): CurrentSessionIdentity => {
  const authenticatedUser = request.authenticatedUser;
  const authenticatedSessionId = request.authenticatedSessionId;

  if (authenticatedUser === undefined || authenticatedSessionId === undefined) {
    throw createUnauthorizedError();
  }

  return {
    userId: authenticatedUser.id,
    sessionId: authenticatedSessionId,
  };
};

export const list: RequestHandler = async (request, response) => {
  const identity = getCurrentSessionIdentity(request);

  const sessions = await listUserSessions(identity.userId, identity.sessionId);

  const responseBody: SessionListResponse = {
    data: {
      sessions,
    },
  };

  response.status(200).json(responseBody);
};

export const remove: RequestHandler = async (request, response) => {
  const identity = getCurrentSessionIdentity(request);
  const unvalidatedParams: unknown = request.params;
  const params = sessionParamsSchema.parse(unvalidatedParams);

  const revoked = await revokeUserSession(identity.userId, params.sessionId);

  if (!revoked) {
    throw new AppError({
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found.',
    });
  }

  response.status(204).send();
};

export const removeOthers: RequestHandler = async (request, response) => {
  const identity = getCurrentSessionIdentity(request);

  await revokeOtherSessions(identity.userId, identity.sessionId);

  response.status(204).send();
};
