// apps/escrow-service/src/redis.ts
// Cliente Redis do escrow-service.
//
// ⚠️ Grill M3: SEM fallback localhost. Se REDIS_URL não vier do ambiente,
// o serviço falha no boot (throw) em vez de conectar num redis errado.
// Em produção o REDIS_URL aponta para o container bingo_redis com credenciais.

import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { logger } from './logger.js';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  // Crashar no load: mais seguro que iniciar com cache mudo.
  throw new Error(
    'REDIS_URL obrigatória — sem fallback localhost (grill M3). ' +
    'Configure REDIS_URL no .env (ex: redis://user:senha@redis:6379).',
  );
}

export const redisClient: RedisClientType = createClient({ url: REDIS_URL });

let redisConnected = false;

redisClient.on('error', (err: Error) => {
  if (redisConnected) {
    logger.error({ err, tag: 'Escrow Redis' }, 'Conexão Redis perdida');
  }
  redisConnected = false;
});

redisClient.on('connect', () => {
  logger.info({ tag: 'Escrow Redis' }, 'Conectado ao Redis');
});

redisClient.on('ready', () => {
  redisConnected = true;
});

redisClient.on('end', () => {
  redisConnected = false;
});

/** Estado atual da conexão (usado pelo /health e /readyz). */
export function isRedisConnected(): boolean {
  return redisConnected;
}

export async function connectRedis(): Promise<void> {
  try {
    await redisClient.connect();
  } catch (err) {
    // O client do node-redis tem retry automático em background; loga e segue.
    logger.warn({ err, tag: 'Escrow Redis' }, 'Falha na conexão inicial (retry automático em background)');
  }
}
