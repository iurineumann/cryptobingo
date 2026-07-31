// apps/escrow-service/src/escrowEventHandlers.ts
// Handlers de eventos on-chain do bingogamescr → atualização do cache Redis.
//
// ⚠️ DIFERENTE do worker: eventos de escrow (bingogamescr) NÃO têm game_id.
// O dispatch é por action, não por game_id. NÃO adicionar o filtro
// `if (!evt.game_id) return` que existe no worker stateWatcher.ts.
//
// Eventos tratados (7):
//   addbacking, cancelback, transfer (depósito sem buy:), withdraw,
//   logmint (on_mint), receive_asset (memo redeem), releaseburn.

import type { ContractEvent } from '@cryptobingo/blockchain-core';
import { rpcClient } from '@cryptobingo/blockchain-core';
import {
  adjustCounter,
  getEscrowMeta,
  setEscrowMeta,
  delEscrowMeta,
  getSnapshot,
  saveSnapshot,
  recalcAggRatio,
  upsertAssetEscrow,
  removeAssetEscrow,
  deleteAssetEscrows,
  markEscrowClaimed,
  type EscrowMeta,
  type AssetEscrowEntry,
} from './escrowCacheManager';
import { eventsReceived, handlerErrors, nftsBought, nftsRedeemed, revenueTotal } from './metrics';
import { logger } from './logger';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';

/** Backoff do retry de RPC (mockável nos testes). 500ms × tentativa, máx 10. */
export const RETRY_BACKOFF_MS = 500;
const RETRY_MAX_ATTEMPTS = 10;

// ─── Helpers ───────────────────────────────────────────────────────────

/** Normaliza error_type para labels de métricas (grill M1 — nunca err.message cru). */
function errorTypeOf(err: unknown): string {
  if (!err) return 'unknown';
  const msg = String((err as any)?.message ?? err);
  if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(msg)) return 'rpc_timeout';
  if (/empty|not found|no rows/i.test(msg)) return 'rpc_empty';
  if (/redis|ECONNREFUSED/i.test(msg)) return 'redis_error';
  if (/invalid|validation/i.test(msg)) return 'validation_error';
  return 'unknown';
}

/**
 * Converte asset string ("100.0000 WAX") para unidades mínimas (int).
 * Precisão derivada do símbolo (grill v2-grill-api P5#5 — NUNCA fator fixo
 * ×10000: WAX tem 8 casas, BINGO 4).
 */
function assetToRaw(asset: string | undefined | null): number {
  if (!asset) return 0;
  const [amount] = asset.split(' ');
  const [, decimals = ''] = amount.split('.');
  const factor = Math.pow(10, decimals.length);
  const raw = Math.round(parseFloat(amount) * factor);
  return Number.isFinite(raw) ? raw : 0;
}

/** Monta a entry do índice by_asset a partir de uma row da tabela escrows. */
function toAssetEntry(row: any, updatedAt = Date.now()): AssetEscrowEntry {
  return {
    esc_id: String(row.esc_id),
    asset_id: String(row.asset_id),
    owner: row.owner ?? '',
    depositor: row.depositor,
    token_contract: row.token_contract,
    token_amount: row.token_amount ?? '',
    token_amount_raw: String(assetToRaw(row.token_amount)),
    updated_at: updatedAt,
  };
}

function fail(handler: string, err: unknown): void {
  handlerErrors.inc({ handler, error_type: errorTypeOf(err) });
  logger.error({ err, handler }, `Erro no handler ${handler}`);
}

// ─── Handlers ──────────────────────────────────────────────────────────

/** addbacking — novo escrow criado. Salva meta preventiva (por asset_id — B2) + obligated += amount. */
async function handleAddbacking(data: any): Promise<void> {
  const depositor = data.depositor;
  const tokenContract = data.token_contract;
  const amountRaw = assetToRaw(data.amount);
  const assetId = String(data.asset_id ?? '');

  if (!depositor || !tokenContract) {
    handlerErrors.inc({ handler: 'addbacking', error_type: 'validation_error' });
    return;
  }

  // Cache preventivo (B2): meta keyed por ASSET_ID (o evento não carrega esc_id —
  // o contrato gera internamente). cancelback usa RPC por esc_id (não lê meta aqui).
  const meta: EscrowMeta = {
    depositor,
    token_contract: tokenContract,
    amount: data.amount ?? '',
    amount_raw: String(amountRaw),
    owner: data.owner ?? '',
    asset_id: assetId,
    esc_id: '',
  };
  if (assetId) {
    await setEscrowMeta(assetId, meta);
  }

  // C2: upsert no índice by_asset — resolver esc_id via RPC byasset (o evento não
  // traz esc_id; a row do addbacking existe na chain pós-action, retry 500ms×10).
  if (assetId) {
    let row: any = null;
    for (let i = 1; i <= RETRY_MAX_ATTEMPTS; i++) {
      try {
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
        // Seleciona a row não-claimada do (depositor, token_contract) mais recente
        const match = (res?.rows ?? []).filter(
          (r: any) => !r.claimed && r.depositor === depositor && r.token_contract === tokenContract,
        );
        if (match.length > 0) {
          row = match[match.length - 1];
          break;
        }
      } catch {
        // continua tentando
      }
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * i));
    }
    if (row) {
      await upsertAssetEscrow(assetId, toAssetEntry(row));
    } else {
      // Pré-mint (source=1 ainda não indexado) — logmint/reconciliação cobrem
      handlerErrors.inc({ handler: 'addbacking', error_type: 'rpc_empty' });
    }
  }

  await adjustCounter(depositor, tokenContract, amountRaw, 'obligated');
  await recalcAggRatio(depositor, tokenContract);
}

/** cancelback — escrow cancelado (só source=1). ABI = [esc_id] (sem asset_id). C2: RPC por PK como caminho primário + guarda claimed. */
async function handleCancelback(data: any): Promise<void> {
  const escId = data.esc_id;
  if (escId === undefined || escId === null) {
    handlerErrors.inc({ handler: 'cancelback', error_type: 'validation_error' });
    return;
  }

  try {
    const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
      code: ESCROW_CONTRACT,
      scope: ESCROW_CONTRACT,
      table: 'escrows',
      lower_bound: Number(escId),
      upper_bound: Number(escId),
      limit: 1,
      json: true,
    });
    const row = res?.rows?.[0];
    if (!row) {
      handlerErrors.inc({ handler: 'cancelback', error_type: 'rpc_empty' });
      return;
    }
    if (row.claimed) return; // guarda claimed — evita decremento 2× (replay)

    await adjustCounter(row.depositor, row.token_contract, -assetToRaw(row.token_amount), 'obligated');
    await recalcAggRatio(row.depositor, row.token_contract);

    // Remover do snapshot do depositor
    const snap = await getSnapshot(row.depositor);
    const filtered = snap.filter((e: any) => String(e.esc_id) !== String(escId));
    if (filtered.length !== snap.length) {
      await saveSnapshot(row.depositor, filtered);
    }

    // Remover do índice by_asset (C2) + meta
    await removeAssetEscrow(row.asset_id, escId);
    await delEscrowMeta(row.asset_id);
  } catch (err) {
    fail('cancelback', err);
  }
}

/**
 * transfer — roteamento por shape (B4):
 *  - atomicassets::transfer (asset_ids, SEM quantity) → claim de NFT (redeem)
 *  - eosio.token::transfer (quantity, SEM asset_ids) → depósito/compra de backing
 * Mutuamente exclusivos por protocolo — determinístico, não heurístico.
 */
async function handleTransfer(data: any): Promise<void> {
  if (data.to !== ESCROW_CONTRACT) return;

  // Claim de NFT: atomicassets::transfer carrega asset_ids (sem quantity)
  if (Array.isArray(data.asset_ids) && data.asset_ids.length > 0) {
    await handleClaim(data);
    return;
  }

  // Depósito/compra de token: eosio.token::transfer carrega quantity (sem asset_ids)
  const memo = String(data.memo ?? '');
  if (memo.startsWith('buy:')) {
    // Compra de NFT — faturamento de negócio
    revenueTotal.inc(assetToRaw(data.quantity));
    return;
  }
  // Depósito de backing
  await adjustCounter(data.to, data.from === 'eosio.token' ? 'eosio.token' : data.from, assetToRaw(data.quantity), 'balance');
  await recalcAggRatio(data.to, data.from === 'eosio.token' ? 'eosio.token' : data.from);
}

/**
 * Claim de NFT (redeem) — corpo do antigo handleReceiveAsset com fallback RPC.
 * receive_asset/releaseburn carregam asset_ids → roteado aqui (B4).
 */
async function handleClaim(data: any): Promise<void> {
  const memo = String(data.memo ?? '');
  if (memo !== 'redeem') return;
  nftsRedeemed.inc();

  const assetIds: string[] = Array.isArray(data.asset_ids)
    ? data.asset_ids.map(String)
    : [String(data.asset_id ?? '')];

  for (const assetId of assetIds) {
    let meta = await getEscrowMeta(assetId);
    if (!meta) {
      // Fallback RPC byasset (escrows pré-fix ou meta expirada) — B4
      try {
        const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
          code: ESCROW_CONTRACT,
          scope: ESCROW_CONTRACT,
          table: 'escrows',
          index_position: 2, // byasset
          lower_bound: Number(assetId),
          upper_bound: Number(assetId),
          limit: 1,
          json: true,
        });
        const row = res?.rows?.[0];
        if (row && !row.claimed) {
          meta = {
            depositor: row.depositor,
            token_contract: row.token_contract,
            amount: row.token_amount ?? '',
            amount_raw: String(assetToRaw(row.token_amount)),
            owner: row.owner ?? '',
            asset_id: assetId,
            esc_id: String(row.esc_id ?? ''),
          };
        }
      } catch (err) {
        fail('claim', err);
      }
    }
    if (!meta) {
      handlerErrors.inc({ handler: 'claim', error_type: 'rpc_empty' });
      continue;
    }
    await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'obligated');
    await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'balance');

    // Marcar claimed=true no snapshot (não remove — histórico)
    const snap = await getSnapshot(meta.depositor);
    const updated = snap.map((e: any) =>
      String(e.asset_id) === assetId ? { ...e, claimed: true } : e,
    );
    if (JSON.stringify(updated) !== JSON.stringify(snap)) {
      await saveSnapshot(meta.depositor, updated);
    }
    await recalcAggRatio(meta.depositor, meta.token_contract);

    // C2: meta marcada claimed (nunca deletada — guard anti-ressurreição) + DEL do índice (asset sai de circulação)
    await markEscrowClaimed(assetId);
    await deleteAssetEscrows(assetId);
  }
}

/** receive_asset — alias defensivo (a notification pode chegar com esse nome). */
async function handleReceiveAsset(data: any): Promise<void> {
  await handleClaim(data);
}

/** withdraw — saque de backing. balance -= amount. */
async function handleWithdraw(data: any): Promise<void> {
  await adjustCounter(data.depositor, data.token_contract, -assetToRaw(data.amount), 'balance');
  await recalcAggRatio(data.depositor, data.token_contract);
}

/** logmint — NFT mintado (on_mint cria escrows). B1+B3: lê escrows via byasset (não pendingmints), grava meta por asset_id. */
async function handleLogmint(data: any): Promise<void> {
  if (data.authorized_minter !== ESCROW_CONTRACT) return;
  nftsBought.inc();
  const assetId = String(data.asset_id ?? '');
  const owner = data.new_asset_owner ?? '';

  // B1: pendingmint é inviável (sem índice por asset_id; logmint não carrega mint_id).
  // Fonte correta: escrows via índice byasset (mesma tx do mint; retry 500ms×10).
  let rows: any[] = [];
  for (let i = 1; i <= RETRY_MAX_ATTEMPTS; i++) {
    try {
      const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
        code: ESCROW_CONTRACT,
        scope: ESCROW_CONTRACT,
        table: 'escrows',
        index_position: 2, // byasset (i64)
        lower_bound: Number(assetId),
        upper_bound: Number(assetId),
        limit: 10,
        json: true,
      });
      rows = res?.rows ?? [];
      if (rows.length > 0) break;
    } catch {
      // continua tentando
    }
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * i));
  }

  if (rows.length === 0) {
    // Delegar para a reconciliação forçada (próximo ciclo corrige)
    handlerErrors.inc({ handler: 'logmint', error_type: 'rpc_empty' });
    logger.warn({ asset_id: assetId }, 'logmint: escrows byasset não encontrado após retries — aguardando reconciliação');
    return;
  }

  for (const row of rows) {
    if (row.claimed) continue; // B1: não re-ajustar escrow já claimado (reclaim/reorg)
    const depositor = row.depositor;
    const tokenContract = row.token_contract;
    const backingRaw = assetToRaw(row.token_amount);

    // B3: gravar meta por asset_id (fecha o ciclo do claim — receive_asset/releaseburn acertam com 0 RPC)
    if (assetId) {
      await setEscrowMeta(assetId, {
        depositor,
        token_contract: tokenContract,
        amount: row.token_amount ?? '',
        amount_raw: String(backingRaw),
        owner,
        asset_id: assetId,
        esc_id: String(row.esc_id ?? ''),
      });
    }

    // C2: upsert no índice by_asset (mint cria M escrows — 1 entry por row)
    if (assetId) {
      await upsertAssetEscrow(assetId, toAssetEntry(row));
    }

    // O on_mint: balance -= backing (vira NFT), obligated += backing (escrow ativo)
    await adjustCounter(depositor, tokenContract, -backingRaw, 'balance');
    await adjustCounter(depositor, tokenContract, backingRaw, 'obligated');
    await recalcAggRatio(depositor, tokenContract);
  }
}

/** releaseburn — burn da NFT (mesmo efeito financeiro do redeem). B4: claim por asset_id + fallback RPC + guarda claimed. */
async function handleReleaseburn(data: any): Promise<void> {
  nftsRedeemed.inc();
  const assetId = String(data.asset_id ?? '');
  let meta = await getEscrowMeta(assetId);
  if (!meta) {
    // Fallback RPC byasset (escrows pré-fix ou meta expirada) — B4
    try {
      const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
        code: ESCROW_CONTRACT,
        scope: ESCROW_CONTRACT,
        table: 'escrows',
        index_position: 2, // byasset
        lower_bound: Number(assetId),
        upper_bound: Number(assetId),
        limit: 1,
        json: true,
      });
      const row = res?.rows?.[0];
      if (row && !row.claimed) {
        meta = {
          depositor: row.depositor,
          token_contract: row.token_contract,
          amount: row.token_amount ?? '',
          amount_raw: String(assetToRaw(row.token_amount)),
          owner: row.owner ?? '',
          asset_id: assetId,
          esc_id: String(row.esc_id ?? ''),
        };
      }
    } catch (err) {
      fail('releaseburn', err);
    }
  }
  if (!meta) {
    handlerErrors.inc({ handler: 'releaseburn', error_type: 'rpc_empty' });
    return;
  }
  await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'obligated');
  await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'balance');

  const snap = await getSnapshot(meta.depositor);
  const updated = snap.map((e: any) =>
    String(e.asset_id) === assetId ? { ...e, claimed: true } : e,
  );
  if (JSON.stringify(updated) !== JSON.stringify(snap)) {
    await saveSnapshot(meta.depositor, updated);
  }
  await recalcAggRatio(meta.depositor, meta.token_contract);

  // C2: meta marcada claimed (guard anti-ressurreição) + DEL do índice (asset fora de circulação)
  await markEscrowClaimed(assetId);
  await deleteAssetEscrows(assetId);
}

// ─── Dispatch ──────────────────────────────────────────────────────────

/** Roteia um evento on-chain para o handler correto. */
export async function handleEvent(evt: ContractEvent): Promise<void> {
  eventsReceived.inc({ action: evt.action });

  switch (evt.action) {
    case 'addbacking':
      await handleAddbacking(evt.data);
      break;
    case 'cancelback':
      await handleCancelback(evt.data);
      break;
    case 'transfer':
      await handleTransfer(evt.data);
      break;
    case 'withdraw':
      await handleWithdraw(evt.data);
      break;
    case 'logmint':
      await handleLogmint(evt.data);
      break;
    case 'receive_asset':
      await handleReceiveAsset(evt.data);
      break;
    case 'releaseburn':
      await handleReleaseburn(evt.data);
      break;
    default:
      // Não é evento de escrow — ignorar silenciosamente
      break;
  }
}
