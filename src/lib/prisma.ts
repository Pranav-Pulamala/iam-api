import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('query', (event): void => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  logger.debug(
    {
      durationMs: event.duration,
      target: event.target,
    },
    'Prisma query completed',
  );
});

prisma.$on('info', (event): void => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  logger.info(
    {
      target: event.target,
    },
    event.message,
  );
});

prisma.$on('warn', (event): void => {
  logger.warn(
    {
      target: event.target,
    },
    event.message,
  );
});

prisma.$on('error', (event): void => {
  logger.error(
    {
      target: event.target,
    },
    event.message,
  );
});
