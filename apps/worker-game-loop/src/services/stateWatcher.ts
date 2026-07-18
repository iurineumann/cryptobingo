// apps/worker-game-loop/src/services/stateWatcher.ts
// Consome ContractEventClient (Firehose/Hyperion) e publica eventos na fila game_loop_events.
// Substitui o blockchainIndexer (poll) por streaming em tempo real.
//
// Ref: Fase B1, ADR-007

import { contractEventClient } from '@cryptobingo/blockchain-core';
import type { ContractEvent } from '@cryptobingo/blockchain-core';
import { redisClient } from './redis';
import { publishGameEvent } from './rabbitPublisher';
import { logger } from './logger';

const REDIS_CURSOR_KEY = 'statewatcher:last_global_seq';

let cursor: number = 0;
let unsubscribe: (() => void) | null = null;

async function loadCursor(): Promise<void> {
  try {
    const val = await redisClient.get(REDIS_CURSOR_KEY);
    if (val) {
      cursor = parseInt(val, 10);
    } else {
      cursor = 0;
    }
  } catch {
    cursor = 0;
    // fail-open: inicia do zero se Redis indisponivel
  }
}

async function saveCursor(globalSeq: number): Promise<void> {
  try {
    await redisClient.set(REDIS_CURSOR_KEY, String(globalSeq));
  } catch {
    // fail-open: perde progresso do cursor mas nao quebra o stream
  }
}

export function startStateWatcher(): void {
  (async () => {
    await loadCursor();
    logger.info({ tag: 'StateWatcher', cursor }, 'Iniciando State Watcher com cursor');

    unsubscribe = contractEventClient.subscribe({
      onEvent: async (evt: ContractEvent) => {
        // Dedup: ignora eventos anteriores ao cursor
        if (evt.global_seq <= cursor) return;
        cursor = evt.global_seq;

        if (!evt.game_id) {
          logger.warn({ action: evt.action, global_seq: evt.global_seq }, 'Evento sem game_id — ignorado');
          return;
        }

        try {
          await publishGameEvent('game_loop_events', evt.action, {
            gameId: evt.game_id,
            ...evt.data,
            block_num: evt.block_num,
            global_seq: evt.global_seq,
            step: evt.step,
          });
        } catch (err) {
          logger.error(
            { err, action: evt.action, gameId: evt.game_id },
            'Erro ao publicar evento no RabbitMQ:',
          );
          return; // nao salva cursor — tenta de novo na proxima execucao
        }

        await saveCursor(evt.global_seq);
      },

      onError: (err: Error) => {
        logger.error({ err, tag: 'StateWatcher' }, 'Erro no stream de eventos:');
      },

      onSourceChange: (src: 'firehose' | 'hyperion') => {
        logger.info({ tag: 'StateWatcher', source: src }, 'Fonte de eventos alterada');
      },
    });
  })().catch((err) => {
    logger.error({ err, tag: 'StateWatcher' }, 'Falha ao iniciar State Watcher:');
  });
}

export function stopStateWatcher(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
