// apps/escrow-service/src/escrowCacheManager.ts
// Operações atômicas nas chaves Redis do escrow via Lua scripts (EVAL).
//
// Grill (2026-07-30) — achados C1/C3/A1/A3/A4:
//   - READ-modify-WRITE de snapshot em memória JS NÃO é atômico → Lua.
//   - agg_ratio calculado e setado num único EVAL (sem race com reconciliação).
//   - Reconciliação com timestamp guard: não sobrescreve eventos recentes.
//   - Cache preventivo escrow:meta:<esc_id> evita RPC no cancelback.
//   - TTL 1h refresh on event + heartbeat 2min.

import { redisClient } from './redis';
import { cacheUpdates, handlerErrors } from './metrics';
import { logger } from './logger';

// ─── Chaves ────────────────────────────────────────────────────────────

const PREFIX = 'escrow';
const TTL_CACHE_SEC = 3600;        // 1h — refresh a cada evento/reconciliação
const TTL_META_SEC = 86400;        // 24h — metadados do escrow
const TTL_CURSOR_SEC = 86400;      // 24h — cursor sobrevive a restart
const TTL_HEARTBEAT_SEC = 120;     // 2min — touch a cada 1min

export const keys = {
  snapshot: (depositor: string) => `${PREFIX}:active:snapshot:${depositor}`,
  meta: (escId: number | string) => `${PREFIX}:meta:${escId}`,
  balance: (depositor: string, tokenContract: string) => `${PREFIX}:balance:${depositor}:${tokenContract}`,
  obligated: (depositor: string, tokenContract: string) => `${PREFIX}:obligated:${depositor}:${tokenContract}`,
  aggRatio: (depositor: string, tokenContract: string) => `${PREFIX}:agg_ratio:${depositor}:${tokenContract}`,
  cursor: `${PREFIX}:statewatcher:cursor`,
  heartbeat: `${PREFIX}:heartbeat`,
  lastModified: `${PREFIX}:last_modified`,
} as const;

// ─── Lua scripts (rodam DENTRO do Redis — atômicos) ────────────────────

/**
 * Atualiza o snapshot de um depositor de forma atômica.
 * ARGV[1] = JSON novo do array (já montado no handler).
 * Guard de timestamp: ARGV[2] = last_modified minimo aceito; se a chave
 * last_modified global for > ARGV[2], o SET é pulado (reconciliação não
 * sobrescreve evento recente).
 */
const LUA_SET_SNAPSHOT = `
local snapshot_key = KEYS[1]
local lm_key = KEYS[2]
local min_lm = tonumber(ARGV[2] or '0')
local current_lm = tonumber(redis.call('GET', lm_key) or '0')
if current_lm > min_lm then
  return 0
end
redis.call('SET', snapshot_key, ARGV[1])
redis.call('EXPIRE', snapshot_key, ARGV[3])
redis.call('SET', lm_key, ARGV[4])
return 1
`;

/**
 * Calcula e seta agg_ratio de forma atômica:
 * agg_ratio = obligated / balance (se balance > 0), senão 1.0 (teto).
 * Guard de timestamp idêntico ao snapshot.
 */
const LUA_CALC_AGG_RATIO = `
local ob_key = KEYS[1]
local ba_key = KEYS[2]
local ratio_key = KEYS[3]
local lm_key = KEYS[4]
local min_lm = tonumber(ARGV[1] or '0')
local current_lm = tonumber(redis.call('GET', lm_key) or '0')
if current_lm > min_lm then
  return -1
end
local obligated = tonumber(redis.call('GET', ob_key) or '0')
local balance = tonumber(redis.call('GET', ba_key) or '0')
local ratio = '1.0'
if balance > 0 then
  ratio = tostring(obligated / balance)
end
redis.call('SET', ratio_key, ratio)
redis.call('EXPIRE', ratio_key, ARGV[2])
return ratio
`;

/**
 * Incrementa uma chave e renova TTL — operação única (evita perder TTL
 * se o processo morrer entre INCRBY e EXPIRE).
 */
const LUA_INCR_TTL = `
redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`;

// ─── Operações públicas ────────────────────────────────────────────────

export interface EscrowMeta {
  depositor: string;
  token_contract: string;
  amount: string;       // asset string (ex: "100.0000 BINGO")
  amount_raw: string;   // unidades mínimas (int64)
  owner: string;
  asset_id: string;
  esc_id: string;
}

/** Salva metadados preventivos do escrow (cancelback usa isso, não RPC). */
export async function setEscrowMeta(escId: number | string, meta: EscrowMeta): Promise<void> {
  await redisClient.hSet(keys.meta(escId), {
    depositor: meta.depositor,
    token_contract: meta.token_contract,
    amount: meta.amount,
    amount_raw: meta.amount_raw,
    owner: meta.owner,
    asset_id: meta.asset_id,
    esc_id: String(meta.esc_id),
  });
  await redisClient.expire(keys.meta(escId), TTL_META_SEC);
  cacheUpdates.inc({ key: 'meta' });
}

/** Lê metadados do escrow (0 RPC no cancelback). */
export async function getEscrowMeta(escId: number | string): Promise<EscrowMeta | null> {
  const raw = await redisClient.hGetAll(keys.meta(escId));
  if (!raw || Object.keys(raw).length === 0) return null;
  return raw as unknown as EscrowMeta;
}

/** Remove metadados (escrow cancelado/claimado). */
export async function delEscrowMeta(escId: number | string): Promise<void> {
  await redisClient.del(keys.meta(escId));
}

/** INCRBY/DECRBY + refresh TTL atômico. amount pode ser negativo (decremento). */
export async function adjustCounter(
  depositor: string,
  tokenContract: string,
  amountRaw: number,
  kind: 'balance' | 'obligated',
): Promise<void> {
  const key = kind === 'balance'
    ? keys.balance(depositor, tokenContract)
    : keys.obligated(depositor, tokenContract);
  await redisClient.eval(LUA_INCR_TTL, {
    keys: [key],
    arguments: [String(amountRaw), String(TTL_CACHE_SEC)],
  });
  cacheUpdates.inc({ key: kind });
}

/** Define valor absoluto (reconciliação) com guard de timestamp. */
export async function setAbsolute(
  key: string,
  value: string,
  minLastModified: number,
  now: number,
): Promise<boolean> {
  const res = await redisClient.eval(LUA_SET_SNAPSHOT, {
    keys: [key, keys.lastModified],
    arguments: [value, String(minLastModified), String(TTL_CACHE_SEC), String(now)],
  });
  return Number(res) === 1;
}

/** Recalcula agg_ratio atômico (após qualquer mutação de balance/obligated). */
export async function recalcAggRatio(
  depositor: string,
  tokenContract: string,
  minLastModified = 0,
): Promise<number> {
  const res = await redisClient.eval(LUA_CALC_AGG_RATIO, {
    keys: [
      keys.obligated(depositor, tokenContract),
      keys.balance(depositor, tokenContract),
      keys.aggRatio(depositor, tokenContract),
      keys.lastModified,
    ],
    arguments: [String(minLastModified), String(TTL_CACHE_SEC)],
  });
  const ratio = typeof res === 'string' ? parseFloat(res) : Number(res);
  cacheUpdates.inc({ key: 'agg_ratio' });
  return ratio;
}

/** Lê valor inteiro de uma chave (balance/obligated). */
export async function getCounter(key: string): Promise<number> {
  const v = await redisClient.get(key);
  return v ? parseInt(v, 10) : 0;
}

/** Lê o snapshot JSON de um depositor. */
export async function getSnapshot(depositor: string): Promise<any[]> {
  const raw = await redisClient.get(keys.snapshot(depositor));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    handlerErrors.inc({ handler: 'cache', error_type: 'snapshot_parse_error' });
    logger.error({ depositor }, 'Snapshot JSON inválido no Redis');
    return [];
  }
}

/** Salva snapshot completo (usado nos handlers após montar o array). */
export async function saveSnapshot(depositor: string, snapshot: any[], now = Date.now()): Promise<void> {
  await redisClient.set(keys.snapshot(depositor), JSON.stringify(snapshot), {
    EX: TTL_CACHE_SEC,
  });
  await redisClient.set(keys.lastModified, String(now));
  cacheUpdates.inc({ key: 'snapshot' });
}

// ─── Cursor + heartbeat ────────────────────────────────────────────────

export async function loadCursor(): Promise<number> {
  try {
    const v = await redisClient.get(keys.cursor);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export async function saveCursor(globalSeq: number): Promise<void> {
  try {
    await redisClient.set(keys.cursor, String(globalSeq), { EX: TTL_CURSOR_SEC });
  } catch (err) {
    logger.error({ err }, 'Falha ao salvar cursor (replay possível no restart)');
  }
}

/** Heartbeat — tocado a cada minuto; expira em 2min se o watcher morrer. */
export async function touchHeartbeat(): Promise<void> {
  try {
    await redisClient.set(keys.heartbeat, String(Date.now()), { EX: TTL_HEARTBEAT_SEC });
  } catch {
    // fail-silent: heartbeat é best-effort
  }
}

/** 1 se heartbeat fresco (<90s), 0 se expirado. */
export async function isWatcherAlive(): Promise<boolean> {
  try {
    const v = await redisClient.get(keys.heartbeat);
    if (!v) return false;
    return Date.now() - parseInt(v, 10) < 90_000;
  } catch {
    return false;
  }
}
