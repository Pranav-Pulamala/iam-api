import type { RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import { listUserSessions } from './session.service.js';
import type { SessionListResponse } from './session.types.js';

const createUnauthorizedError = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });

export const list: RequestHandler = async (request, response) => {
  const authenticatedUser = request.authenticatedUser;
  const authenticatedSessionId = request.authenticatedSessionId;

  if (authenticatedUser === undefined || authenticatedSessionId === undefined) {
    throw createUnauthorizedError();
  }

  const sessions = await listUserSessions(authenticatedUser.id, authenticatedSessionId);

  const responseBody: SessionListResponse = {
    data: {
      sessions,
    },
  };

  response.status(200).json(responseBody);
};
