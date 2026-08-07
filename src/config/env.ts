import 'dotenv/config';
import { z } from 'zod';

const jwtDurationSchema = z
  .string()
  .trim()
  .regex(
    /^[1-9]\d*[smhd]$/,
    'JWT_ACCESS_EXPIRES_IN must use a positive integer followed by s, m, h, or d',
  );

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SERVICE_NAME: z.string().trim().min(1).max(100).default('iam-api'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'DATABASE_URL must be a PostgreSQL connection URL',
    ),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must contain at least 32 characters')
    .refine(
      (value) => value !== 'replace-with-at-least-32-random-characters',
      'JWT_SECRET must not use the example placeholder',
    ),
  JWT_ACCESS_EXPIRES_IN: jwtDurationSchema.default('15m'),
  JWT_ISSUER: z.string().trim().min(1).max(200).default('iam-api'),
  JWT_AUDIENCE: z.string().trim().min(1).max(200).default('iam-api-client'),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const validationErrors = parsedEnvironment.error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'environment';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  throw new Error(`Invalid environment configuration: ${validationErrors}`);
}

export const env = Object.freeze(parsedEnvironment.data);

export type Environment = typeof env;
