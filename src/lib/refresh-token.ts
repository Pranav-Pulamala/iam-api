import { createHash, randomBytes } from 'node:crypto';

const REFRESH_TOKEN_BYTES = 32;

export const generateRefreshToken = (): string =>
  randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

export const hashRefreshToken = (refreshToken: string): string =>
  createHash('sha256').update(refreshToken, 'utf8').digest('hex');
