// apps/worker-game-loop/src/services/stateWatcher.ts
// Consome ContractEventClient (Firehose/Hyperion) e publica eventos na fila game_loop_events.
// Substitui o blockchainIndexer (poll) por streaming em tempo real.
//
// Ref: Fase B1, ADR-007

import { contractEventClient, fetchGame } from '@cryptobingo/blockchain-core';
import type { ContractEvent } from '@cryptobingo/blockchain-core';
import { redisClient } from './redis';
import { publishGameEvent } from './rabbitPublisher';
import { logger } from './logger';
import {
    stateWatcherEventsReceived,
    stateWatcherPublished,
    stateWatcherErrors,
    stateWatcherReconnections,
    stateWatcherSourceChanges,
    stateWatcherCursorPosition,
    stateWatcherPublishLatency,
    stateWatcherCursorLag,
} from './metrics';

const REDIS_CURSOR_KEY = 'statewatcher:last_global_seq';

let cursor: number = 0;
let currentSource: 'firehose' | 'hyperion' = 'firehose';
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
  } catch (err) {
    // fail-open: perde progresso do cursor mas nao quebra o stream.
    // Se o cursor some a cada restart (Redis sem persistencia), o StateWatcher
    // replaya eventos historicos -> loop de fundgame phantom. Ver referencia
    // worker-fundgame-phantom-replay-loop.md (Correcao B).
    logger.error({ err, tag: 'StateWatcher' }, 'Falha ao salvar cursor no Redis (replay de eventos possivel no restart)');
  }
}

export function startStateWatcher(): void {
  (async () => {
    await loadCursor();
    logger.info({ tag: 'StateWatcher', cursor }, 'Iniciando State Watcher com cursor');

    unsubscribe = contractEventClient.subscribe({
      onEvent: async (evt: ContractEvent) => {
        // Dedup por cursor (sessao atual)
        if (evt.global_seq <= cursor) return;
        cursor = evt.global_seq;

        // ── Anti-replay (Correcao B/C): eventos de partida ja finalizada/inexistente
        // nao devem ser republicados. O cursor do StateWatcher some a cada restart
        // (Redis sem persistencia), entao o Firehose reenvia eventos do dia -> o
        // consumer fundgame recebia phantom e loopava na DLQ. Aqui bloqueamos o
        // republish de fundgame para partida que ja nao esta em CREATED.
        if (evt.action === 'fundgame') {
          try {
            const game = await fetchGame(evt.game_id);
            if (!game || game.status !== 'created') {
              logger.warn(
                { gameId: evt.game_id, status: game?.status, global_seq: evt.global_seq },
                'StateWatcher: fundgame IGNORADO (anti-replay) — partida inexistente ou ja avancou',
              );
              return;
            }
          } catch {
            // fetch falhou: publica mesmo assim (fail-open) para nao perder
            // evento real de partida viva.
          }
        }

        if (!evt.game_id) {
          logger.warn({ action: evt.action, global_seq: evt.global_seq }, 'Evento sem game_id — ignorado');
          return;
        }

        stateWatcherEventsReceived.inc({ source: currentSource });

        const timer = stateWatcherPublishLatency.startTimer();

        try {
          await publishGameEvent('game_loop_events', evt.action, {
            gameId: evt.game_id,
            ...evt.data,
            block_num: evt.block_num,
            global_seq: evt.global_seq,
            step: evt.step,
          });
        } catch (err) {
          timer();
          stateWatcherErrors.inc();
          logger.error(
            { err, action: evt.action, gameId: evt.game_id },
            'Erro ao publicar evento no RabbitMQ:',
          );
          return; // nao salva cursor — tenta de novo na proxima execucao
        }

        timer();
        stateWatcherPublished.inc({ action: evt.action });
        stateWatcherCursorPosition.set(evt.global_seq);
        await saveCursor(evt.global_seq);

        // Lag entre block_time do evento e now()
        const evtAny = evt as any;
        const blockTimeMs = evtAny.block_time ? new Date(evtAny.block_time).getTime() : 0;
        if (blockTimeMs > 0) {
          const lagSec = (Date.now() - blockTimeMs) / 1000;
          stateWatcherCursorLag.set(lagSec);
          if (lagSec > 60) {
            logger.warn(
              { lagSec: Math.round(lagSec), global_seq: evt.global_seq, block_time: evtAny.block_time },
              'StateWatcher: lag elevado (>60s) — verificar Firehose/Hyperion',
            );
          }
        }
      },

      onError: (err: Error) => {
        stateWatcherErrors.inc();
        stateWatcherReconnections.inc();
        logger.error({ err, tag: 'StateWatcher' }, 'Erro no stream de eventos:');
      },

      onSourceChange: (src: 'firehose' | 'hyperion') => {
        currentSource = src;
        stateWatcherSourceChanges.inc();
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
