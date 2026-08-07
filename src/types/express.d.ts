import type { SafeUser } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      authenticatedUser?: SafeUser;
    }
  }
}

export {};
