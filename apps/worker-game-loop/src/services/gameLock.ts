// apps/worker-game-loop/src/services/gameLock.ts
// Lock Redis para orquestração de jogos — impede dupla execução de startdraw
// em cenário multi-nó e garante idempotência entre auto-advance e consumer.
//
// Ref: Fase 1 (#368), ADR-007

import { redisClient } from './redis';
import { logger } from './logger';

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

/**
 * Renova o TTL do lock de orquestração (heartbeat).
 * Usa PEXPIRE — só estende se a key AINDA EXISTIR (lock não foi libertado/expirou).
 * Retorna true se renovou, false se a key não existe mais.
 * Se o lock sumiu, NÃO recria (evita "roubar" lock de outro dono).
 */
export async function renewOrchestrationLock(
    gameId: string,
    ttlMs = DEFAULT_TTL_MS
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${gameId}`;
    const result = await redisClient.pExpire(key, ttlMs);
    // ioredis pExpire: 1 se renovou (key existia), 0 se a key não existe.
    return result === 1;
}

/**
 * Watchdog: renova o lock periodicamente enquanto o dono estiver vivo.
 * Em multi-nó, se o worker MORRE, o timer para e o lock expira naturalmente
 * → outro nó pode adquirir e assumir (failover correto).
 *
 * @returns handle com `stop()` para parar o watchdog (chamar no finally).
 */
export function startLockWatchdog(
    gameId: string,
    ttlMs = DEFAULT_TTL_MS
): { stop: () => void } {
    const intervalMs = Math.max(1_000, Math.floor(ttlMs / 3));
    const timer = setInterval(async () => {
        try {
            const renewed = await renewOrchestrationLock(gameId, ttlMs);
            if (!renewed) {
                logger.warn({ tag: 'GameLock' }, `Watchdog: lock do jogo ${gameId} sumiu — parando renovação.`);
                clearInterval(timer);
            }
        } catch (err) {
            logger.error({ err, tag: 'GameLock' }, `Watchdog: falha ao renovar lock do jogo ${gameId}:`);
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();

    return {
        stop: () => {
            clearInterval(timer);
        },
    };
}
