// apps/api-gateway/src/database/redis.ts
// Ref: SPEC.md §3.1 — "hash serializado é validado atomicamente via SADD no Redis"
// Ref: SPEC.md §3.2 — estrutura de chaves Redis: game:{game_id}:matrix:{hash}

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (err: Error) => {
    // Log sem derrubar o processo — o controller tem fail-open controlado
    console.error('❌ [Redis] Erro de conexão:', err.message);
});

redisClient.on('connect', () => {
    console.log('✅ [Redis] Conectado com sucesso (Dedupe de Matrizes).');
});

redisClient.on('reconnecting', () => {
    console.warn('⚠️  [Redis] Reconectando...');
});

/**
 * Conecta ao Redis. Chamada uma vez no bootstrap do api-gateway.
 *
 * Não derruba o processo em caso de falha — o ticketController
 * opera em fail-open quando o Redis está indisponível, confiando
 * na unicidade de ticket_id garantida pelo Smart Contract.
 */
export async function connectRedis(): Promise<void> {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('❌ [Redis] Falha na conexão inicial — dedupe de matrizes degradado:', error);
    }
}
