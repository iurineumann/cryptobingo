// apps/escrow-service/src/stateWatcher.ts
// Watcher que detecta eventos logburnasset (burn de NFT no AtomicAssets)
// e publica mensagens na fila RabbitMQ escrow_burn_events.
//
// Producao: Pinax Firehose (streaming) → fila.
// Dev/local: poll da tabela assets do atomicassets (verificacao periodica).
//
// Fase 3 — esboco. Implementacao real em F4 com Firehose + Hyperion fallback.

import { rpcClient } from '@cryptobingo/blockchain-core';
import { logger }   from './logger';
import {
  connect as connectRabbit,
  type Channel,
} from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME    = 'escrow_burn_events';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';
const ATOMIC_ACCOUNT  = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';
const POLL_INTERVAL_MS = parseInt(process.env.BURN_POLL_INTERVAL_MS || '30000', 10);

let channel: Channel | null = null;

async function ensureQueue(): Promise<Channel> {
  if (channel) return channel;
  const conn = await connectRabbit(RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  logger.info({ queue: QUEUE_NAME }, 'Fila RabbitMQ assertada');
  return channel;
}

/**
 * Poll da tabela escrows do bingoescrow: assets com escrow NAO claimed e
 * asset NAO mais presente em atomicassets::assets (scope=owner) sao burns.
 */
async function pollBurns(): Promise<void> {
  try {
    const ch = await ensureQueue();

    const { rows: escrows } = (await rpcClient.v1.chain.get_table_rows({
      code: ESCROW_CONTRACT,
      scope: ESCROW_CONTRACT,
      table: 'escrows',
      limit: 500,
      json: true,
    })) as any;

    for (const e of escrows) {
      if (e.claimed) continue;

      const { rows: assets } = (await rpcClient.v1.chain.get_table_rows({
        code: ATOMIC_ACCOUNT,
        scope: e.owner,
        table: 'assets',
        lower_bound: String(e.asset_id),
        upper_bound: String(e.asset_id),
        limit: 1,
        json: true,
      })) as any;

      if (!assets.length) {
        const msg = Buffer.from(JSON.stringify({
          asset_id: e.asset_id,
          owner: e.owner,
          esc_id: e.esc_id,
        }));
        ch.sendToQueue(QUEUE_NAME, msg, { persistent: true });
        logger.info({ asset_id: e.asset_id, owner: e.owner }, 'Burn detectado');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Erro no poll de burns');
  }
}

let pollTimer: NodeJS.Timeout | null = null;

export async function startStateWatcher(): Promise<void> {
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'StateWatcher iniciado (modo poll)');

  await pollBurns(); // primeira passagem imediata

  pollTimer = setInterval(pollBurns, POLL_INTERVAL_MS);
}

export async function stopStateWatcher(): Promise<void> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (channel) {
    await channel.close();
    channel = null;
  }
  logger.info('StateWatcher parado');
}
