// apps/escrow-service/src/stateWatcher.ts
// Watcher event-driven do bingogamescr — Firehose Pinax com fallback Hyperion.
// Substitui o antigo poll de 30s (burns).
//
// Cadeia de fallback (spec §6):
//   Firehose (N1) → Hyperion (N2, automático no ContractEventClient) → RPC (reconciliação)
//
// ⚠️ Eventos de escrow NÃO têm game_id — o dispatch é por ACTION (ver
// escrowEventHandlers.ts). NÃO copiar o filtro !evt.game_id do worker.

import { ContractEventClient, type ContractEvent } from '@cryptobingo/blockchain-core';
import { handleEvent } from './escrowEventHandlers';
import { loadCursor, saveCursor, touchHeartbeat } from './escrowCacheManager';
import { cursorPosition, watcherSource, handlerErrors } from './metrics';
import { logger } from './logger';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';
const HEARTBEAT_INTERVAL_MS = 60_000; // touch a cada 1min (TTL da chave: 2min)

let client: ContractEventClient | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Inicia o watcher event-driven.
 * - Carrega cursor do Redis (se 0, a reconciliação roda ANTES no bootstrap)
 * - Inscreve handler de eventos
 * - Heartbeat a cada minuto
 */
export async function startStateWatcher(): Promise<void> {
  const cursor = await loadCursor();

  logger.info({ tag: 'EscrowWatcher', cursor, contract: ESCROW_CONTRACT }, 'Iniciando watcher event-driven');

  client = new ContractEventClient({
    contractAccount: ESCROW_CONTRACT,
    pinaxKey: process.env.PINAX_KEY,
    startGlobalSeq: cursor > 0 ? cursor : 0,
  });

  client.subscribe({
    onEvent: async (evt: ContractEvent) => {
      try {
        // Dedup por cursor
        if (evt.global_seq <= cursor) return;
        await handleEvent(evt);
        await saveCursor(evt.global_seq);
        cursorPosition.set(evt.global_seq);
      } catch (err) {
        handlerErrors.inc({ handler: 'dispatch', error_type: 'unknown' });
        logger.error({ err, action: evt.action }, 'Erro processando evento');
        // Não salva cursor — o evento será reprocessado
      }
    },
    onError: (err: Error) => {
      handlerErrors.inc({ handler: 'watcher', error_type: 'stream_error' });
      logger.error({ err }, 'Erro no stream de eventos');
    },
    onSourceChange: (source: 'firehose' | 'hyperion') => {
      watcherSource.set(source === 'firehose' ? 1 : 0);
      logger.info({ source }, 'Fonte de eventos alterada');
    },
  });

  // Heartbeat — sinaliza vida para o API Gateway decidir stale vs 503
  await touchHeartbeat();
  heartbeatTimer = setInterval(() => {
    touchHeartbeat().catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);

  logger.info({ tag: 'EscrowWatcher' }, 'Watcher pronto');
}

export function stopStateWatcher(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  // unsubscribe fica no retorno do subscribe; simplificado: cliente morre com o processo
}
