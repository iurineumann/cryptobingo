import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient: RedisClientType = createClient({ url: REDIS_URL }) as RedisClientType;

redisClient.on('error', (err: Error) => {
    console.error('❌ [Worker Redis] Erro de conexão:', err.message);
});

redisClient.on('connect', () => {
    console.log('✅ [Worker Redis] Conectado com sucesso (Inverted Index).');
});

redisClient.on('reconnecting', () => {
    console.warn('⚠️  [Worker Redis] Reconectando...');
});

export async function connectRedis(): Promise<void> {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('❌ [Worker Redis] Falha na conexão inicial — índice invertido degradado:', error);
    }
}
