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
  type EscrowMeta,
} from './escrowCacheManager';
import { eventsReceived, handlerErrors, nftsBought, nftsRedeemed, revenueTotal } from './metrics';
import { logger } from './logger';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';

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

/** Converte asset string ("100.0000 WAX") para unidades mínimas (int). */
function assetToRaw(asset: string | undefined | null): number {
  if (!asset) return 0;
  const [amount] = asset.split(' ');
  const raw = Math.round(parseFloat(amount) * 10000);
  return Number.isFinite(raw) ? raw : 0;
}

function fail(handler: string, err: unknown): void {
  handlerErrors.inc({ handler, error_type: errorTypeOf(err) });
  logger.error({ err, handler }, `Erro no handler ${handler}`);
}

// ─── Handlers ──────────────────────────────────────────────────────────

/** addbacking — novo escrow criado. Salva meta preventiva + obligated += amount. */
async function handleAddbacking(data: any): Promise<void> {
  const depositor = data.depositor;
  const tokenContract = data.token_contract;
  const amountRaw = assetToRaw(data.amount);

  if (!depositor || !tokenContract) {
    handlerErrors.inc({ handler: 'addbacking', error_type: 'validation_error' });
    return;
  }

  // Cache preventivo: cancelback lê daqui (0 RPC)
  const meta: EscrowMeta = {
    depositor,
    token_contract: tokenContract,
    amount: data.amount ?? '',
    amount_raw: String(amountRaw),
    owner: data.owner ?? '',
    asset_id: String(data.asset_id ?? ''),
    esc_id: String(data.esc_id ?? ''),
  };
  if (data.esc_id !== undefined && data.esc_id !== null) {
    await setEscrowMeta(data.esc_id, meta);
  }

  await adjustCounter(depositor, tokenContract, amountRaw, 'obligated');
  await recalcAggRatio(depositor, tokenContract);
}

/** cancelback — escrow cancelado. Lê meta (0 RPC) para saber valores. */
async function handleCancelback(data: any): Promise<void> {
  const escId = data.esc_id;
  const meta = escId !== undefined ? await getEscrowMeta(escId) : null;

  if (!meta) {
    // Meta não existe (escrow pré-v8 ou expirou) — fallback RPC
    try {
      const res: any = await rpcClient.v1.chain.get_table_rows({
        code: ESCROW_CONTRACT,
        scope: ESCROW_CONTRACT,
        table: 'escrows',
        lower_bound: escId,
        upper_bound: escId,
        limit: 1,
        json: true,
      });
      const row = res?.rows?.[0];
      if (!row) {
        handlerErrors.inc({ handler: 'cancelback', error_type: 'rpc_empty' });
        return;
      }
      await adjustCounter(row.depositor, row.token_contract, -assetToRaw(row.token_amount), 'obligated');
      await recalcAggRatio(row.depositor, row.token_contract);
    } catch (err) {
      fail('cancelback', err);
    }
    return;
  }

  await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'obligated');
  await recalcAggRatio(meta.depositor, meta.token_contract);

  // Remover do snapshot do depositor
  const snap = await getSnapshot(meta.depositor);
  const filtered = snap.filter((e: any) => String(e.esc_id) !== String(escId));
  if (filtered.length !== snap.length) {
    await saveSnapshot(meta.depositor, filtered);
  }
  await delEscrowMeta(escId);
}

/** transfer — depósito de backing. Só se to == bingogamescr e memo sem "buy:". */
async function handleTransfer(data: any): Promise<void> {
  const memo = String(data.memo ?? '');
  if (data.to !== ESCROW_CONTRACT) return;
  if (memo.startsWith('buy:')) {
    // Compra de NFT — faturamento de negócio
    revenueTotal.inc(assetToRaw(data.quantity));
    return;
  }
  // Depósito de backing
  await adjustCounter(data.to, data.from === 'eosio.token' ? 'eosio.token' : data.from, assetToRaw(data.quantity), 'balance');
  await recalcAggRatio(data.to, data.from === 'eosio.token' ? 'eosio.token' : data.from);
}

/** withdraw — saque de backing. balance -= amount. */
async function handleWithdraw(data: any): Promise<void> {
  await adjustCounter(data.depositor, data.token_contract, -assetToRaw(data.amount), 'balance');
  await recalcAggRatio(data.depositor, data.token_contract);
}

/** logmint — NFT mintado (on_mint do contrato cria escrows). */
async function handleLogmint(data: any): Promise<void> {
  if (data.authorized_minter !== ESCROW_CONTRACT) return;
  nftsBought.inc();

  // Firehose entrega evento ANTES do chain state refletir (grill C4).
  // Retry com backoff: 500ms × tentativa, máx 10 (≈ 27.5s total).
  let pendingRows: any[] = [];
  for (let i = 1; i <= 10; i++) {
    try {
      const res: any = await rpcClient.v1.chain.get_table_rows({
        code: ESCROW_CONTRACT,
        scope: ESCROW_CONTRACT,
        table: 'pending_mints',
        lower_bound: data.asset_id,
        upper_bound: data.asset_id,
        limit: 1,
        json: true,
      });
      pendingRows = res?.rows ?? [];
      if (pendingRows.length > 0) break;
    } catch {
      // continua tentando
    }
    await new Promise((r) => setTimeout(r, 500 * i));
  }

  if (pendingRows.length === 0) {
    // Delegar para a reconciliação forçada (próximo ciclo corrige)
    handlerErrors.inc({ handler: 'logmint', error_type: 'rpc_empty' });
    logger.warn({ asset_id: data.asset_id }, 'logmint: pending_mints não encontrado após retries — aguardando reconciliação');
    return;
  }

  const pending = pendingRows[0];
  const depositor = pending.depositor;
  const tokenContract = pending.token_contract;
  const backingRaw = assetToRaw(pending.backing_amount);

  // O on_mint: balance -= backing (vira NFT), obligated += backing (escrow ativo)
  await adjustCounter(depositor, tokenContract, -backingRaw, 'balance');
  await adjustCounter(depositor, tokenContract, backingRaw, 'obligated');
  await recalcAggRatio(depositor, tokenContract);
}

/** receive_asset — resgate (memo "redeem") ou transferência. */
async function handleReceiveAsset(data: any): Promise<void> {
  const memo = String(data.memo ?? '');
  if (memo !== 'redeem') return;
  nftsRedeemed.inc();

  const assetIds: string[] = Array.isArray(data.asset_ids)
    ? data.asset_ids.map(String)
    : [String(data.asset_id ?? '')];

  for (const assetId of assetIds) {
    const meta = await getEscrowMeta(assetId);
    if (!meta) continue;
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
    await delEscrowMeta(assetId);
  }
}

/** releaseburn — burn da NFT (mesmo efeito financeiro do redeem). */
async function handleReleaseburn(data: any): Promise<void> {
  nftsRedeemed.inc();
  const meta = await getEscrowMeta(data.asset_id);
  if (!meta) {
    handlerErrors.inc({ handler: 'releaseburn', error_type: 'rpc_empty' });
    return;
  }
  await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'obligated');
  await adjustCounter(meta.depositor, meta.token_contract, -parseInt(meta.amount_raw || '0', 10), 'balance');

  const snap = await getSnapshot(meta.depositor);
  const updated = snap.map((e: any) =>
    String(e.asset_id) === String(data.asset_id) ? { ...e, claimed: true } : e,
  );
  if (JSON.stringify(updated) !== JSON.stringify(snap)) {
    await saveSnapshot(meta.depositor, updated);
  }
  await recalcAggRatio(meta.depositor, meta.token_contract);
  await delEscrowMeta(data.asset_id);
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
