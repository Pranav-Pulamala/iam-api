import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import { authenticateAccessToken } from '../modules/auth/auth.service.js';

const createUnauthorizedError = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });

export const authenticate: RequestHandler = async (request, response, next) => {
  void response;

  const authorizationHeader = request.get('authorization');

  if (authorizationHeader === undefined) {
    next(createUnauthorizedError());
    return;
  }

  const authorizationParts = authorizationHeader.trim().split(/\s+/);

  if (
    authorizationParts.length !== 2 ||
    authorizationParts[0] !== 'Bearer' ||
    authorizationParts[1] === undefined
  ) {
    next(createUnauthorizedError());
    return;
  }

  try {
    request.authenticatedUser = await authenticateAccessToken(authorizationParts[1]);

    next();
  } catch (error: unknown) {
    next(error);
  }
};
