import type { RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import { loginRequestSchema, registerRequestSchema } from './auth.schemas.js';
import { loginUser, registerUser } from './auth.service.js';
import {
  serializeSafeUser,
  type AuthenticationResponse,
  type CurrentUserResponse,
} from './auth.types.js';

export const register: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = registerRequestSchema.parse(unvalidatedBody);
  const result = await registerUser(input);

  const responseBody: AuthenticationResponse = {
    data: {
      user: serializeSafeUser(result.user),
      accessToken: result.accessToken,
    },
  };

  response.status(201).json(responseBody);
};

export const login: RequestHandler = async (request, response) => {
  const unvalidatedBody: unknown = request.body;
  const input = loginRequestSchema.parse(unvalidatedBody);
  const result = await loginUser(input);

  const responseBody: AuthenticationResponse = {
    data: {
      user: serializeSafeUser(result.user),
      accessToken: result.accessToken,
    },
  };

  response.status(200).json(responseBody);
};

export const getCurrentUser: RequestHandler = (request, response) => {
  const authenticatedUser = request.authenticatedUser;

  if (authenticatedUser === undefined) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  }

  const responseBody: CurrentUserResponse = {
    data: {
      user: serializeSafeUser(authenticatedUser),
    },
  };

  response.status(200).json(responseBody);
};
