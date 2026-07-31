// apps/api-gateway/src/controllers/escrowController.ts
// Fase C — endpoints /escrow/* servidos do cache Redis (Fase B) com fallback
// RPC e 503 fail-closed (spec B §6, v2-grill-api).
//
//   GET /api/v1/escrow/my                  — escrows das NFTs do wallet (self-only)
//   GET /api/v1/escrow/status/:depositor   — status financeiro do depositor (self-only)
//   GET /api/v1/escrow/tierprices          — tabela de preços por template (público)
//   GET /api/v1/escrow/health              — liveness das fontes (público)
//
// Matriz de disponibilidade (grill P3):
//   /my (não-financeiro) → fail-open no enriquecimento; 503 só se ownership caiu
//   /status (financeiro) → fail-closed: sem cache E RPC falhou → 503 (nunca inventar)
// Métricas: reusa metricsMiddleware global (api_http_*) + counters de cache
// api_escrow_* (grill: prefixo api_, não escrow_).

import { Request, Response } from 'express';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { Counter } from 'prom-client';
import { registry } from '../services/metrics';
import { redisClient } from '../database/redis';
import {
  escrowKeys,
  readAssetEscrows,
  readDepositorSnapshot,
  readDepositorBalances,
  readEscrowHeartbeat,
  FRESH_MS,
  STALE_MS,
  type EscrowEntry,
} from '../services/escrowCacheReader';
import { logger } from '../middleware/logger';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT ?? 'bingogamescr';
const ATOMIC_CONTRACT = 'atomicassets';
const BINGO_COLLECTION = 'cryptobingo1';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/';
const TIERPRICES_TTL_SEC = 300; // 5min — config pública, cache curto

// Default da Atomic API por CHAIN_ID (decisão do grill P5#1 — testnet ≠ mainnet).
// Testnet WAX: f16b1833... (ver .env.example do escrow-service).
const WAX_TESTNET_CHAIN_ID = 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12';
const ATOMICAPI_PROXY_BASE =
  process.env.ATOMICAPI_PROXY_URL ??
  (process.env.CHAIN_ID === WAX_TESTNET_CHAIN_ID
    ? 'https://wax-testnet.api.atomicassets.io'
    : 'https://wax.api.atomicassets.io');

// ── Counters de cache (registry global, prefixo api_) ─────────────────────
const escrowCacheHits = new Counter({
  name: 'api_escrow_cache_hits_total',
  help: 'Cache hits do módulo escrow (Redis ou RPC revalidado).',
  labelNames: ['endpoint', 'source'] as const,
  registers: [registry],
});
const escrowCacheMisses = new Counter({
  name: 'api_escrow_cache_misses_total',
  help: 'Cache misses do módulo escrow (sem chave Redis → RPC).',
  labelNames: ['endpoint'] as const,
  registers: [registry],
});
const escrowFailClosed = new Counter({
  name: 'api_escrow_fail_closed_total',
  help: '503 fail-closed emitidos (dado financeiro indisponível).',
  labelNames: ['endpoint'] as const,
  registers: [registry],
});
const escrowOwnershipErrors = new Counter({
  name: 'api_escrow_ownership_errors_total',
  help: 'Falhas na fonte de ownership (Atomic API ou RPC assets).',
  labelNames: ['source'] as const,
  registers: [registry],
});

// ── Helpers ────────────────────────────────────────────────────────────────

const WAX_NAME_RE = /^[a-z1-5.]{1,12}$/;

function isWaxName(v: string): boolean {
  return WAX_NAME_RE.test(v);
}

interface AtomicAsset {
  asset_id: string;
  template_id: number | null;
  schema_name: string;
  collection_name: string;
  name?: string;
  img_url?: string;
}

/** Shape real do snapshot do escrow-service (reconciliation.ts) — NÃO tem
 * token_contract/token_amount_raw/updated_at (cast para EscrowEntry seria
 * interface mentirosa — padrão B5). Os saldos vêm em `balances` por token. */
interface SnapshotEscrow {
  esc_id: string;
  asset_id: string;
  owner: string;
  depositor: string;
  token_amount: string;
  claimed: boolean;
}

/** Ownership via Atomic API — path FIXO, query derivada do JWT (anti-SSRF, grill P4#1). */
async function fetchAtomicOwnership(owner: string): Promise<AtomicAsset[]> {
  const url =
    `${ATOMICAPI_PROXY_BASE}/atomicassets/v1/assets` +
    `?owner=${encodeURIComponent(owner)}` +
    `&collection_name=${BINGO_COLLECTION}` +
    `&page=1&limit=1000&order=desc&sort=asset_id`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Atomic API HTTP ${r.status}`);
  const body = (await r.json()) as { data?: any[] };
  return (body.data ?? []).map((a) => ({
    asset_id: String(a.asset_id),
    template_id: a.template_id != null ? Number(a.template_id) : null,
    schema_name: String(a.schema_name ?? ''),
    collection_name: String(a.collection_name ?? ''),
  }));
}

/** Fallback de ownership: RPC assets owner-scoped (NÃO é full scan — tabela é scope=owner). */
async function rpcFetchOwnership(owner: string): Promise<AtomicAsset[]> {
  const res: any = await rpcClient.v1.chain.get_table_rows({
    code: ATOMIC_CONTRACT,
    scope: owner,
    table: 'assets',
    limit: 100,
    json: true,
  });
  return (res.rows ?? [])
    .filter((a: any) => a.collection_name === BINGO_COLLECTION)
    .map((a: any) => ({
      asset_id: String(a.asset_id),
      template_id: a.template_id != null ? Number(a.template_id) : null,
      schema_name: String(a.schema_name ?? ''),
      collection_name: String(a.collection_name ?? ''),
    }));
}

/** Enriquecimento de template (name/img) — batch, sempre fail-open (grill P2). */
async function enrichTemplates(assets: AtomicAsset[]): Promise<void> {
  const ids = [...new Set(assets.map((a) => a.template_id).filter((t): t is number => t !== null))];
  if (ids.length === 0) return;
  try {
    const url =
      `${ATOMICAPI_PROXY_BASE}/atomicassets/v1/templates` +
      `?ids=${ids.join(',')}&collection_name=${BINGO_COLLECTION}&page=1&limit=1000`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return;
    const body = (await r.json()) as { data?: any[] };
    const meta = new Map<number, { name?: string; img?: string }>();
    for (const t of body.data ?? []) {
      const tid = Number(t.template_id);
      const immutable = t.immutable_data ?? {};
      meta.set(tid, { name: String(immutable.name ?? ''), img: String(immutable.img ?? '') });
    }
    for (const a of assets) {
      if (a.template_id === null) continue;
      const m = meta.get(a.template_id);
      if (!m) continue;
      a.name = m.name;
      const cid = m.img?.replace(/^ipfs:\/\//, '');
      a.img_url = cid ? `${IPFS_GATEWAY}${cid}` : undefined;
    }
  } catch {
    // fail-open — meta null não derruba o 200
  }
}

/** RPC bounded por asset (byasset) — sem retry longo no request path. */
async function rpcFetchEscrowsByAsset(assetId: string): Promise<EscrowEntry[]> {
  const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
    code: ESCROW_CONTRACT,
    scope: ESCROW_CONTRACT,
    table: 'escrows',
    index_position: 2, // byasset
    lower_bound: Number(assetId),
    upper_bound: Number(assetId),
    limit: 10,
    json: true,
  });
  return (res.rows ?? [])
    .filter((r: any) => !r.claimed)
    .map((r: any) => ({
      esc_id: String(r.esc_id),
      asset_id: String(r.asset_id),
      owner: r.owner ?? '',
      depositor: r.depositor,
      token_contract: r.token_contract,
      token_amount: r.token_amount ?? '',
      token_amount_raw: String(assetToRaw(r.token_amount)),
      updated_at: Date.now(),
    }));
}

/** assetToRaw com precisão do símbolo (grill P5#5 — nunca fator fixo ×10000). */
function assetToRaw(asset: string | undefined | null): number {
  if (!asset) return 0;
  const [amount] = asset.split(' ');
  const [, decimals = ''] = amount.split('.');
  const raw = Math.round(parseFloat(amount) * Math.pow(10, decimals.length));
  return Number.isFinite(raw) ? raw : 0;
}

/** RPC bydepositor (index_position 3) — fallback do /status. */
async function rpcFetchEscrowsByDepositor(depositor: string): Promise<EscrowEntry[]> {
  const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
    code: ESCROW_CONTRACT,
    scope: ESCROW_CONTRACT,
    table: 'escrows',
    index_position: 3, // bydepositor
    key_type: 'name',
    lower_bound: depositor,
    upper_bound: depositor,
    limit: 100,
    json: true,
  });
  return (res.rows ?? [])
    .filter((r: any) => !r.claimed)
    .map((r: any) => ({
      esc_id: String(r.esc_id),
      asset_id: String(r.asset_id),
      owner: r.owner ?? '',
      depositor: r.depositor,
      token_contract: r.token_contract,
      token_amount: r.token_amount ?? '',
      token_amount_raw: String(assetToRaw(r.token_amount)),
      updated_at: Date.now(),
    }));
}

// ── Endpoints ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/escrow/my — escrows das NFTs do jogador (self-only).
 * Ownership: Atomic API → RPC assets owner-scoped → 503 se ambos caíram.
 * Escrows: Redis by_asset → RPC byasset bounded (fail-open por item).
 */
export async function getMyEscrows(req: Request, res: Response): Promise<void> {
  // IDOR: rejeita ?owner= com 400 (grill P4 — superfície mínima)
  if (req.query.owner !== undefined) {
    res.status(400).json({ error: 'Parâmetro owner não permitido — ownership vem do JWT.' });
    return;
  }
  const wallet = req.user!.wallet;
  if (!isWaxName(wallet)) {
    res.status(400).json({ error: 'Formato de conta WAX inválido.' });
    return;
  }
  res.set('Cache-Control', 'private, no-store'); // dados pessoais (grill P4#3)

  // 1. Ownership
  let assets: AtomicAsset[];
  try {
    assets = await fetchAtomicOwnership(wallet);
    escrowCacheHits.inc({ endpoint: 'my', source: 'atomic' });
  } catch (err) {
    escrowOwnershipErrors.inc({ source: 'atomic' });
    logger.warn({ err, wallet }, 'escrow/my: Atomic API indisponível — fallback RPC assets');
    try {
      assets = await rpcFetchOwnership(wallet);
      escrowCacheHits.inc({ endpoint: 'my', source: 'rpc' });
    } catch (err2) {
      escrowOwnershipErrors.inc({ source: 'rpc' });
      escrowFailClosed.inc({ endpoint: 'my' });
      logger.error({ err: err2, wallet }, 'escrow/my: ownership indisponível (Atomic + RPC)');
      res.status(503).json({ error: 'Fonte de ownership indisponível.' });
      return;
    }
  }

  // 2. Escrows por asset (Redis → RPC bounded, fail-open por item)
  let worstStale = false;
  const items: Array<{
    asset_id: string;
    template_id: number | null;
    schema_name: string;
    collection_name: string;
    name?: string;
    img_url?: string;
    escrows: EscrowEntry[];
    escrow_source: 'redis' | 'rpc';
    cached: boolean;
  }> = [];

  for (const a of assets) {
    let read;
    try {
      read = await readAssetEscrows(a.asset_id, () => rpcFetchEscrowsByAsset(a.asset_id));
    } catch {
      // miss + RPC falhou → item sem escrows (fail-open não-financeiro)
      escrowCacheMisses.inc({ endpoint: 'my' });
      read = { data: [], source: 'rpc' as const, stale: false, cached: false };
    }
    if (read.stale) worstStale = true;
    if (read.source === 'rpc' && !read.cached) escrowCacheMisses.inc({ endpoint: 'my' });
    items.push({
      asset_id: a.asset_id,
      template_id: a.template_id,
      schema_name: a.schema_name,
      collection_name: a.collection_name,
      name: a.name,
      img_url: a.img_url,
      escrows: read.data,
      escrow_source: read.source,
      cached: read.cached,
    });
  }

  // 3. Enriquecimento (fail-open)
  await enrichTemplates(items);

  res.status(200).json({ wallet, stale: worstStale, items });
}

/**
 * GET /api/v1/escrow/status/:depositor — status financeiro (self-only, fail-closed).
 * Matriz: snapshot Redis (fresco/stale) → RPC bydepositor → 503 se sem cache E RPC falhou.
 */
export async function getEscrowStatusByDepositor(req: Request, res: Response): Promise<void> {
  const depositor = String(req.params.depositor ?? '');
  if (!isWaxName(depositor)) {
    res.status(400).json({ error: 'Formato de conta WAX inválido.' });
    return;
  }
  if (depositor !== req.user!.wallet) {
    res.status(403).json({ error: 'Você só pode consultar seu próprio status.' });
    return;
  }
  res.set('Cache-Control', 'private, no-store'); // dados financeiros pessoais

  const now = Date.now();
  const { snapshot, lastModified } = await readDepositorSnapshot(depositor);
  const balances = await readDepositorBalances(depositor);
  const age = now - lastModified;
  const hasCache = snapshot !== null;

  const respond = (
    escrows: Array<Partial<SnapshotEscrow> & { esc_id: string; asset_id: string; token_contract?: string }>,
    source: 'redis' | 'rpc',
    stale: boolean,
    cached: boolean,
  ) => {
    if (source === 'rpc' && !cached) escrowCacheMisses.inc({ endpoint: 'status' });
    else escrowCacheHits.inc({ endpoint: 'status', source });
    // Normaliza os dois shapes (snapshot sem token_contract / RPC sem claimed)
    // — nunca servir campos undefined (padrão B5).
    const normalized = escrows.map((e) => ({
      esc_id: e.esc_id,
      asset_id: e.asset_id,
      owner: e.owner ?? '',
      depositor: e.depositor ?? '',
      token_amount: e.token_amount ?? '',
      claimed: e.claimed ?? false,
      ...(e.token_contract ? { token_contract: e.token_contract } : {}),
    }));
    res.status(200).json({
      depositor,
      stale,
      cached,
      escrows: normalized,
      balances,
      last_modified: lastModified || null,
    });
  };

  // Snapshot Redis é array de {esc_id, asset_id, owner, depositor, token_amount, claimed}
  if (hasCache && age <= FRESH_MS) {
    respond(snapshot as SnapshotEscrow[], 'redis', false, true);
    return;
  }
  if (hasCache && age <= STALE_MS) {
    respond(snapshot as SnapshotEscrow[], 'redis', true, true);
    return;
  }
  if (hasCache) {
    // stale > 30min — revalida via RPC; falha → serve stale (dado conhecido)
    try {
      const escrows = await rpcFetchEscrowsByDepositor(depositor);
      respond(escrows, 'rpc', false, false);
    } catch {
      respond(snapshot as SnapshotEscrow[], 'redis', true, true);
    }
    return;
  }
  // Sem cache — RPC obrigatório; falha → 503 financial fail-closed
  try {
    const escrows = await rpcFetchEscrowsByDepositor(depositor);
    respond(escrows, 'rpc', false, false);
  } catch (err) {
    escrowFailClosed.inc({ endpoint: 'status' });
    logger.error({ err, depositor }, 'escrow/status: sem cache E RPC falhou — 503 fail-closed');
    res.status(503).json({ error: 'Dados financeiros indisponíveis.' });
  }
}

/**
 * GET /api/v1/escrow/tierprices — tabela de preços por template (público).
 * Cache Redis 5min → RPC paginado → 503.
 */
export async function getTierPrices(req: Request, res: Response): Promise<void> {
  try {
    const cached = await redisClient.get(escrowKeys.tierPrices);
    if (cached) {
      escrowCacheHits.inc({ endpoint: 'tierprices', source: 'redis' });
      res.status(200).json(JSON.parse(cached));
      return;
    }
  } catch {
    // cache indisponível — segue para RPC
  }

  try {
    const rows: any[] = [];
    let lowerBound: string | undefined;
    do {
      const r: any = await (rpcClient.v1.chain.get_table_rows as Function)({
        code: ESCROW_CONTRACT,
        scope: ESCROW_CONTRACT,
        table: 'tierprices',
        limit: 100,
        lower_bound: lowerBound as any,
        json: true,
      });
      rows.push(...(r.rows ?? []));
      lowerBound = r.more && r.next_key ? String(r.next_key) : undefined;
    } while (lowerBound);

    await redisClient.setEx(escrowKeys.tierPrices, TIERPRICES_TTL_SEC, JSON.stringify({ tierprices: rows }));
    escrowCacheMisses.inc({ endpoint: 'tierprices' });
    res.status(200).json({ tierprices: rows });
  } catch (err) {
    escrowFailClosed.inc({ endpoint: 'tierprices' });
    logger.error({ err }, 'escrow/tierprices: RPC falhou');
    res.status(503).json({ error: 'Tabela de preços indisponível.' });
  }
}

/**
 * GET /api/v1/escrow/health — liveness das fontes (público, sem dados financeiros).
 */
export async function getEscrowHealth(_req: Request, res: Response): Promise<void> {
  const heartbeat = await readEscrowHeartbeat();
  const heartbeatAge = heartbeat ? Date.now() - Number(heartbeat) : null;

  let rpcUp = false;
  try {
    await rpcClient.v1.chain.get_info();
    rpcUp = true;
  } catch {
    rpcUp = false;
  }

  // Redis up? (heartbeat null = down ou escrow-service nunca tocou)
  const redisUp = heartbeat !== null;

  res.status(200).json({
    status: 'ok',
    redis: redisUp ? 'up' : 'down',
    rpc: rpcUp ? 'up' : 'down',
    escrow_service: redisUp ? 'up' : 'down',
    heartbeat_age_ms: heartbeatAge,
    contract: ESCROW_CONTRACT,
  });
}

// re-exports para o index.ts registrar as rotas
export { ESCROW_CONTRACT, ATOMICAPI_PROXY_BASE };
