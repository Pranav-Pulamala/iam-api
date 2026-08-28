import type { SafeUser } from '../modules/auth/auth.types.ts';

declare global {
  namespace Express {
    interface Request {
      id: string;
      authenticatedUser?: SafeUser;
      authenticatedSessionId?: string;
    }
  }
}

export {};
