// retryBackoff.ts
// Helpers compartilhados de backoff exponencial para erros de recurso (CPU/net).
// Usado por rabbitmq.ts e roomManager.ts para evitar retry storm que esgota
// CPU budget da conta WAX na testnet.
//
// Padrão: exponential backoff 60s base, 1.8M max, 6 retries max.
// Ref: ADR-008 errata v3

export const RES_RETRY_MAX = 6;
export const RES_RETRY_BASE_MS = 60_000;
export const RES_RETRY_MAX_MS = 1_800_000;

export const resRetryMap = new Map<string, { count: number; lastAttempt: number }>();

export function isResourceExhausted(err: any): boolean {
    const m = err?.message ?? '';
    return /account cpu limit|billed CPU time|subjective cpu|net usage|expired by/.test(m);
}

export function resBackoffMs(key: string): number {
    const r = resRetryMap.get(key) ?? { count: 0, lastAttempt: 0 };
    return Math.min(RES_RETRY_BASE_MS * Math.pow(2, r.count), RES_RETRY_MAX_MS);
}

import { logger } from './logger';

export function handleResourceBackoff(
    key: string,
    tag: string,
    label: string,
): void {
    const r = resRetryMap.get(key) ?? { count: 0, lastAttempt: 0 };
    r.count++;
    r.lastAttempt = Date.now();
    resRetryMap.set(key, r);
    logger.info(
        { tag },
        `backoff de ${resBackoffMs(key) / 1000}s p/ ${label} (tentativa ${r.count}/${RES_RETRY_MAX})`,
    );
}
