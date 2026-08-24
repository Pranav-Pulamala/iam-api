import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import { requirePermissionDecision } from '../modules/authorization/authorization.service.js';
import type { PermissionKey } from '../modules/authorization/permissions.js';

const organizationParamsSchema = z.object({
  organizationId: z.string().uuid('Organization ID must be a valid UUID.'),
});

const authenticationRequiredError = (): AppError =>
  new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });

export const requirePermission = (permission: PermissionKey): RequestHandler => {
  return async (request, response, next) => {
    void response;

    try {
      if (request.authenticatedUser === undefined) {
        throw authenticationRequiredError();
      }

      const paramsInput: unknown = request.params;
      const params = organizationParamsSchema.parse(paramsInput);

      await requirePermissionDecision({
        userId: request.authenticatedUser.id,
        organizationId: params.organizationId,
        permission,
      });

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
};
