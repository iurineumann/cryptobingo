// apps/worker-game-loop/src/services/gameLock.ts
// Lock Redis para orquestração de jogos — impede dupla execução de startdraw
// em cenário multi-nó e garante idempotência entre auto-advance e consumer.
//
// Ref: Fase 1 (#368), ADR-007

import { redisClient } from './redis';

const LOCK_PREFIX = 'lock:orchestrate:';
const DEFAULT_TTL_MS = 90_000;

/**
 * Tenta adquirir o lock de orquestração para um jogo.
 * Usa NX (só cria se não existe) + PX (expira após ttlMs).
 * Retorna true se o lock foi adquirido, false se já existia.
 */
export async function acquireOrchestrationLock(
    gameId: string,
    ttlMs = DEFAULT_TTL_MS
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${gameId}`;
    const result = await redisClient.set(key, '1', { NX: true, PX: ttlMs });
    return result === 'OK';
}

/**
 * Libera o lock de orquestração manualmente.
 * Útil após conclusão do jogo para evitar espera do TTL.
 */
export async function releaseOrchestrationLock(gameId: string): Promise<void> {
    const key = `${LOCK_PREFIX}${gameId}`;
    await redisClient.del(key);
}

/**
 * Verifica se o lock de orquestração existe para um jogo.
 */
export async function isLocked(gameId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${gameId}`;
    const result = await redisClient.exists(key);
    return result === 1;
}
