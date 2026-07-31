// apps/escrow-service/src/reconciliation.ts
// Reconciliação do cache escrow com o estado on-chain (RPC).
//
// Gatilhos (spec §5):
//   - Startup (cursor == 0) — scan completo
//   - A cada 30min — scan programado
//   - Erro de handler (agg_ratio negativo etc.) — scan forçado
//
// Grill C1/A2: usa timestamp guard — o SET só aplica se NENHUM evento
// modificou a chave desde o início do scan (não sobrescreve eventos vivos).

import { rpcClient } from '@cryptobingo/blockchain-core';
import {
  keys,
  saveSnapshot,
  setAbsolute,
  touchHeartbeat,
} from './escrowCacheManager';
import { reconciliations, reconciliationDuration, handlerErrors } from './metrics';
import { logger } from './logger';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';
const RECONCILE_INTERVAL_MS = 30 * 60 * 1000; // 30min

interface BalanceRow {
  depositor: string;
  token_contract: string;
  amount: string;
}

interface EscrowRow {
  esc_id: number;
  asset_id: number;
  owner: string;
  depositor: string;
  token_contract: string;
  token_amount: string;
  claimed: boolean;
  backing_amount: string;
  template_id: number;
}

/** Pagina uma tabela inteira via next_key. */
async function fetchTable(table: string): Promise<any[]> {
  const rows: any[] = [];
  let lowerBound: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const res: any = await rpcClient.v1.chain.get_table_rows({
      code: ESCROW_CONTRACT,
      scope: ESCROW_CONTRACT,
      table,
      limit: 100,
      lower_bound: lowerBound as any,
      json: true,
    });
    rows.push(...(res.rows ?? []));
    hasMore = !!res.more && !!res.next_key;
    lowerBound = res.next_key;
  }
  return rows;
}

/**
 * Scan completo: lê balances + escrows e reescreve as 4 chaves com guard.
 */
export async function runReconciliation(trigger: 'startup' | 'scheduled' | 'forced'): Promise<void> {
  const timer = reconciliationDuration.startTimer();
  const start = Date.now();

  logger.info({ trigger }, 'Reconciliação iniciada');

  try {
    const [balances, escrows] = await Promise.all([
      fetchTable('balances'),
      fetchTable('escrows'),
    ]);

    // Agregar por (depositor, token_contract)
    const agg = new Map<string, { balance: number; obligated: number; snapshot: any[] }>();

    for (const b of balances as BalanceRow[]) {
      const k = `${b.depositor}:${b.token_contract}`;
      if (!agg.has(k)) agg.set(k, { balance: 0, obligated: 0, snapshot: [] });
      const e = agg.get(k)!;
      e.balance += assetToRaw(b.amount);
    }

    for (const esc of escrows as EscrowRow[]) {
      if (esc.claimed) continue;
      const k = `${esc.depositor}:${esc.token_contract}`;
      if (!agg.has(k)) agg.set(k, { balance: 0, obligated: 0, snapshot: [] });
      const e = agg.get(k)!;
      e.obligated += assetToRaw(esc.token_amount);
      e.snapshot.push({
        esc_id: esc.esc_id,
        asset_id: esc.asset_id,
        owner: esc.owner,
        template_id: esc.template_id,
        depositor: esc.depositor,
        token_amount: esc.token_amount,
        backing_amount: esc.backing_amount,
        claimed: false,
      });
    }

    // Escrever com timestamp guard (grill C1): só aplica se nenhum evento
    // tocou a chave desde `start`.
    let applied = 0;
    for (const [k, v] of agg.entries()) {
      const [depositor, tokenContract] = k.split(':');
      const okBalance = await setAbsolute(keys.balance(depositor, tokenContract), String(v.balance), start, Date.now());
      const okObligated = await setAbsolute(keys.obligated(depositor, tokenContract), String(v.obligated), start, Date.now());
      const okRatio = await setAbsolute(keys.aggRatio(depositor, tokenContract), v.balance > 0 ? String(v.obligated / v.balance) : '1.0', start, Date.now());
      await saveSnapshot(depositor, v.snapshot, Date.now());
      applied += okBalance && okObligated && okRatio ? 1 : 0;
    }

    // Chaves de depositores que sumiram — expiram sozinhas (TTL 1h)
    await touchHeartbeat();

    timer();
    reconciliations.inc({ trigger });
    logger.info({ trigger, groups: agg.size, applied, durationMs: Date.now() - start }, 'Reconciliação concluída');
  } catch (err) {
    timer();
    handlerErrors.inc({ handler: 'reconciliation', error_type: 'rpc_timeout' });
    logger.error({ err, trigger }, 'Falha na reconciliação');
  }
}

/** Agenda reconciliação periódica (30min). */
export function startReconciliationScheduler(): void {
  setInterval(() => {
    runReconciliation('scheduled').catch(() => undefined);
  }, RECONCILE_INTERVAL_MS);
}

function assetToRaw(asset: string | undefined | null): number {
  if (!asset) return 0;
  const [amount] = asset.split(' ');
  const raw = Math.round(parseFloat(amount) * 10000);
  return Number.isFinite(raw) ? raw : 0;
}
