import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { redisConnected, setRedisConnected } from './connectionState';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient: RedisClientType = createClient({ url: REDIS_URL }) as RedisClientType;

redisClient.on('error', (err: Error) => {
    if (redisConnected) {
        console.error('❌ [Worker Redis] Conexão perdida:', err.message);
    }
    setRedisConnected(false);
});

redisClient.on('connect', () => {
    console.log('✅ [Worker Redis] Conectado com sucesso (Inverted Index).');
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
        console.warn('⚠️ [Worker Redis] Falha na conexão inicial (retry automático em background).');
    }
}
