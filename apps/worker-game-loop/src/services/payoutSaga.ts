// apps/worker-game-loop/src/services/payoutSaga.ts
// Saga de pagamento batch — coordena plano, progresso e fechamento via Redis.
// Fase 2 (#369): setPayoutPlan → N consumers paralelos → recordPayoutCompletion → triggerCloseGame

import { redisClient } from './redis';
import { acquireOrchestrationLock, releaseOrchestrationLock } from './gameLock';
import { executeCloseGame } from './blockchain';
import { logger } from './logger';

const PAYOUT_PLAN_KEY  = 'payout:plan:';
const PAYOUT_PAID_KEY  = 'payout:paid:';
const PAYOUT_EVENTS_KEY = 'payout:events:';

export async function setPayoutPlan(gameId: string, expected: number): Promise<void> {
    await redisClient.set(`${PAYOUT_PLAN_KEY}${gameId}`, JSON.stringify({ expected }));
    await redisClient.set(`${PAYOUT_PAID_KEY}${gameId}`, '0');
    logger.info({ tag: 'PayoutSaga' }, `Plano: jogo ${gameId}, ${expected} evento(s).`);
}

export async function recordPayoutCompletion(gameId: string, chunkId: string): Promise<void> {
    const paidKey    = `${PAYOUT_PAID_KEY}${gameId}`;
    const eventsKey  = `${PAYOUT_EVENTS_KEY}${gameId}`;
    const planKey    = `${PAYOUT_PLAN_KEY}${gameId}`;

    const paid = await redisClient.incr(paidKey);
    await redisClient.sAdd(eventsKey, chunkId);

    const planStr = await redisClient.get(planKey);
    if (!planStr) {
        logger.warn({ tag: 'PayoutSaga' }, `Plano ausente p/ jogo ${gameId}. Pulando close.`);
        return;
    }
    const { expected } = JSON.parse(planStr);

    logger.info({ tag: 'PayoutSaga' }, `Progresso: jogo ${gameId}, ${paid}/${expected}.`);

    if (paid >= expected) {
        await triggerCloseGame(gameId);
    }
}

export async function triggerCloseGame(gameId: string): Promise<void> {
    const lockKey = `${gameId}:close`;
    const acquired = await acquireOrchestrationLock(lockKey, 30_000);
    if (!acquired) {
        logger.info({ tag: 'PayoutSaga' }, `closegame jogo ${gameId} já em andamento.`);
        return;
    }
    try {
        await executeCloseGame(gameId);
        logger.info({ tag: 'PayoutSaga' }, `Jogo ${gameId} arquivado via saga.`);
    } finally {
        await releaseOrchestrationLock(lockKey).catch(() => {});
    }
}

export async function getPayoutProgress(gameId: string): Promise<{ paid: number; expected: number } | null> {
    const planStr = await redisClient.get(`${PAYOUT_PLAN_KEY}${gameId}`);
    if (!planStr) return null;
    const { expected } = JSON.parse(planStr);
    const paidStr = await redisClient.get(`${PAYOUT_PAID_KEY}${gameId}`);
    const paid = paidStr ? Number.parseInt(paidStr, 10) : 0;
    return { paid, expected };
}

export async function clearPayoutPlan(gameId: string): Promise<void> {
    await redisClient.del(`${PAYOUT_PLAN_KEY}${gameId}`);
    await redisClient.del(`${PAYOUT_PAID_KEY}${gameId}`);
    await redisClient.del(`${PAYOUT_EVENTS_KEY}${gameId}`);
}
