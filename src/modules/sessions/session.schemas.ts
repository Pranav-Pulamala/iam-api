import { z } from 'zod';

export const sessionParamsSchema = z
  .object({
    sessionId: z.string().uuid('Session ID must be a valid UUID.'),
  })
  .strict();

export type SessionParams = z.infer<typeof sessionParamsSchema>;
