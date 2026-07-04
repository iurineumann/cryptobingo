import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { redisConnected, setRedisConnected } from './connectionState';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient: RedisClientType = createClient({ url: REDIS_URL }) as RedisClientType;

redisClient.on('error', (err: Error) => {
    if (redisConnected) {
        logger.error({ err, tag: 'Worker Redis' }, 'Conexão perdida:')
    }
    setRedisConnected(false);
});

redisClient.on('connect', () => {
    logger.info({ tag: 'Worker Redis' }, 'Conectado com sucesso (Inverted Index).')
});

redisClient.on('ready', () => {
    setRedisConnected(true);
});

redisClient.on('end', () => {
    setRedisConnected(false);
});

export async function connectRedis(): Promise<void> {
    try {
        await redisClient.connect();
    } catch {
        logger.warn({ tag: 'Worker Redis' }, 'Falha na conexão inicial (retry automático em background).')
    }
}
