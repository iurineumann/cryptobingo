// apps/escrow-service/src/logger.ts
// Logger via pino — padrao consistente com worker-game-loop.

import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level,
  name: 'escrow-service',
  transport: level === 'debug'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
