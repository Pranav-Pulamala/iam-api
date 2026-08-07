export interface AppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  public constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });

    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.isOperational = true;

    Error.captureStackTrace(this, AppError);
  }
}
