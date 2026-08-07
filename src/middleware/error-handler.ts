import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;

  const caughtError: unknown = error;
  const requestId = request.id;

  if (caughtError instanceof ZodError) {
    const responseBody: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid data.',
        requestId,
        details: caughtError.issues,
      },
    };

    response.status(400).json(responseBody);
    return;
  }

  if (caughtError instanceof AppError) {
    logger.warn(
      {
        error: caughtError,
        requestId,
        statusCode: caughtError.statusCode,
        errorCode: caughtError.code,
      },
      'Operational request error',
    );

    const responseBody: ErrorResponse = {
      error: {
        code: caughtError.code,
        message: caughtError.message,
        requestId,
        ...(caughtError.details === undefined ? {} : { details: caughtError.details }),
      },
    };

    response.status(caughtError.statusCode).json(responseBody);
    return;
  }

  logger.error(
    {
      error: caughtError,
      requestId,
    },
    'Unhandled request error',
  );

  const responseBody: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    },
  };

  response.status(500).json(responseBody);
};
