// apps/api-gateway/src/services/escrowCacheReader.ts
// Leituras do cache escrow (Fase B) com matriz de fallback Redis → RPC → 503.
// Spec B §6 + grill v2-grill-api P3:
//   fresco  ≤30s            → stale:false, cached:true
//   stale   30s–30min       → stale:true  (serve stale)
//   stale  >30min + RPC ok  → serve RPC (cached:false, revalidado)
//   stale  >30min + RPC falha → serve stale (caller decide 503 p/ financial)
//   vazio (sem chave) + RPC ok → serve RPC (cached:false)
//   vazio + RPC falha       → lança (caller decide: 503 financial / fail-open)
//
// __lm__ = última ESCRITA/VERIFICAÇÃO do HASH (evento OU reconciliação) — o
// relógio de frescor. Reconciliação bumpa SEMPRE (grill P1-1).

import { redisClient } from '../database/redis';

const FRESH_MS = 30_000; // 30s — dado verificado recentemente
const STALE_MS = 30 * 60_000; // 30min — janela de staleness (ciclo da reconciliação)

export { FRESH_MS, STALE_MS };

/** Campo reservado do HASH by_asset: última verificação/escrita (epoch ms). */
export const LM_FIELD = '__lm__';

/** Chaves compartilhadas com o escrow-service (prefixo escrow: isola — grill R9). */
export const escrowKeys = {
  byAsset: (assetId: string) => `escrow:by_asset:${assetId}`,
  snapshot: (depositor: string) => `escrow:active:snapshot:${depositor}`,
  balance: (depositor: string, token: string) => `escrow:balance:${depositor}:${token}`,
  obligated: (depositor: string, token: string) => `escrow:obligated:${depositor}:${token}`,
  aggRatio: (depositor: string, token: string) => `escrow:agg_ratio:${depositor}:${token}`,
  lastModified: 'escrow:last_modified',
  heartbeat: 'escrow:heartbeat',
  tierPrices: 'escrow:tierprices',
} as const;

/** Entry do índice by_asset (mesmo shape do escrow-service). */
export interface EscrowEntry {
  esc_id: string;
  asset_id: string;
  owner: string;
  depositor: string;
  token_contract: string;
  token_amount: string;
  token_amount_raw: string;
  updated_at: number;
}

export interface ReadResult<T> {
  data: T;
  source: 'redis' | 'rpc';
  stale: boolean;
  cached: boolean;
}

/** Parseia um HASH by_asset, ignorando o __lm__. Entradas corrompidas são descartadas. */
export function parseEscrowHash(raw: Record<string, string> | null | undefined): EscrowEntry[] {
  if (!raw) return [];
  const entries: EscrowEntry[] = [];
  for (const [field, value] of Object.entries(raw)) {
    if (field === LM_FIELD) continue;
    try {
      entries.push(JSON.parse(value) as EscrowEntry);
    } catch {
      // entrada corrompida — descarta (reconciliação re-gera)
    }
  }
  return entries;
}

/**
 * Lê os escrows ativos de um asset com a matriz de fallback.
 * rpcFetcher: () => Promise<EscrowEntry[]> — consulta bounded (byasset, sem retry
 * longo: request path não espera 27s).
 */
export async function readAssetEscrows(
  assetId: string,
  rpcFetcher: () => Promise<EscrowEntry[]>,
): Promise<ReadResult<EscrowEntry[]>> {
  let raw: Record<string, string> | null = null;
  try {
    raw = await redisClient.hGetAll(escrowKeys.byAsset(assetId));
  } catch {
    raw = null;
  }

  const entries = parseEscrowHash(raw);
  const lm = parseInt(raw?.[LM_FIELD] ?? '0', 10);
  const age = Date.now() - lm;
  const hasCache = raw !== null && Object.keys(raw).length > 0;

  if (hasCache && age <= FRESH_MS) {
    return { data: entries, source: 'redis', stale: false, cached: true };
  }
  if (hasCache && age <= STALE_MS) {
    return { data: entries, source: 'redis', stale: true, cached: true };
  }
  if (hasCache) {
    // stale > 30min — revalida via RPC; falha → serve stale (caller decide financial)
    try {
      const rpc = await rpcFetcher();
      return { data: rpc, source: 'rpc', stale: false, cached: false };
    } catch {
      return { data: entries, source: 'redis', stale: true, cached: true };
    }
  }
  // Sem cache (chave ausente ou TTL expirado) — RPC bloqueante; falha → lança
  const rpc = await rpcFetcher();
  return { data: rpc, source: 'rpc', stale: false, cached: false };
}

/** Lê o snapshot financeiro de um depositor + last_modified global. null se ausente. */
export async function readDepositorSnapshot(
  depositor: string,
): Promise<{ snapshot: any[] | null; lastModified: number }> {
  try {
    const [raw, lm] = await Promise.all([
      redisClient.get(escrowKeys.snapshot(depositor)),
      redisClient.get(escrowKeys.lastModified),
    ]);
    let snapshot: any[] | null = null;
    if (raw !== null) {
      try {
        snapshot = JSON.parse(raw) as any[];
      } catch {
        snapshot = null;
      }
    }
    return { snapshot, lastModified: parseInt(lm ?? '0', 10) };
  } catch {
    return { snapshot: null, lastModified: 0 };
  }
}

/** Lê os saldos/obligated do depositor via SCAN (nunca KEYS — grill P4#4). */
export async function readDepositorBalances(
  depositor: string,
): Promise<Record<string, { balance: string | null; obligated: string | null; agg_ratio: string | null }>> {
  const out: Record<string, { balance: string | null; obligated: string | null; agg_ratio: string | null }> = {};
  try {
    const pattern = `escrow:balance:${depositor}:*`;
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      const token = String(key).split(':').pop()!;
      const [b, o, r] = await Promise.all([
        redisClient.get(escrowKeys.balance(depositor, token)),
        redisClient.get(escrowKeys.obligated(depositor, token)),
        redisClient.get(escrowKeys.aggRatio(depositor, token)),
      ]);
      out[token] = { balance: b, obligated: o, agg_ratio: r };
    }
  } catch {
    // Redis indisponível — caller decide (financial → 503 se sem fallback)
  }
  return out;
}

/** Lê o heartbeat do escrow-service. null se ausente/Redis down. */
export async function readEscrowHeartbeat(): Promise<string | null> {
  try {
    return await redisClient.get(escrowKeys.heartbeat);
  } catch {
    return null;
  }
}
