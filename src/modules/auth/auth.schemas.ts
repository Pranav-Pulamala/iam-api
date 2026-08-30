import { z } from 'zod';

const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('A valid email address is required.')
  .max(320, 'Email must not exceed 320 characters.');

const registrationPasswordSchema = z
  .string()
  .min(12, 'Password must contain at least 12 characters.')
  .max(128, 'Password must not exceed 128 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.');

const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required.')
  .max(128, 'Password must not exceed 128 characters.');

export const registerRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: loginPasswordSchema,
  })
  .strict();

export const refreshTokenRequestSchema = z
  .object({
    refreshToken: z.string().trim().min(32).max(512),
  })
  .strict();

export const accessTokenSubjectSchema = z.string().uuid();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
