// apps/escrow-service/src/consumer.ts
// Consumer RabbitMQ — processa eventos da fila escrow_burn_events
// e chama bingogamescr::releaseburn on-chain (assinando como bot).
//
// ⚠️ FIX (grill M3, 2026-07-31): a auth antiga usava `bingogamesvc@active` —
// NUNCA funcionaria, pois releaseburn exige a permissão `bot` do próprio
// bingogamescr (linkauth bot→releaseburn). Corrigido: actor = ESCROW_CONTRACT
// (bingogamescr), permission = 'bot', chave ESCROW_BOT_PRIVATE_KEY.
//
// Rota 3 foi REMOVIDA do worker-game-loop (2026-07-31) — este é o único
// consumer da fila escrow_burn_events.

import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { logger } from './logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'escrow_burn_events';

const RPC_URL = process.env.RPC_URL || 'https://waxtestnet.greymass.com';
const CHAIN_ID = process.env.CHAIN_ID || 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12';
const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';

const keyRaw = process.env.ESCROW_BOT_PRIVATE_KEY;
const botKey = keyRaw ? PrivateKey.from(keyRaw) : null;

interface BurnMessage {
  asset_id: number;
  owner: string;
  esc_id: number;
}

function getSession(): Session | null {
  if (!botKey) {
    logger.warn('ESCROW_BOT_PRIVATE_KEY nao configurada — assinatura offline');
    return null;
  }
  return new Session({
    actor: ESCROW_CONTRACT,
    permission: 'bot',
    chain: { id: CHAIN_ID, url: RPC_URL },
    walletPlugin: new WalletPluginPrivateKey(botKey),
  });
}

async function processMessage(session: Session, msg: BurnMessage): Promise<void> {
  logger.info({ asset_id: msg.asset_id, owner: msg.owner }, 'Processando releaseburn');

  try {
    await session.transact({
      actions: [{
        account: ESCROW_CONTRACT,
        name: 'releaseburn',
        authorization: [{
          actor: ESCROW_CONTRACT,
          permission: 'bot',
        }],
        data: {
          asset_id: msg.asset_id,
          owner: msg.owner,
        },
      }],
    }, { broadcast: true });

    logger.info({ asset_id: msg.asset_id }, 'releaseburn concluido');
  } catch (err: any) {
    logger.error({ err, asset_id: msg.asset_id }, 'Falha ao chamar releaseburn');
    throw err;
  }
}

export async function startConsumer(): Promise<void> {
  logger.info('Consumer iniciando...');

  const session = getSession();
  if (!session) {
    logger.warn('Consumer rodando sem sessao WAX (apenas log)');
  }

  const conn: ChannelModel = await amqp.connect(RABBITMQ_URL);
  const ch: Channel = await conn.createChannel();
  await ch.assertQueue(QUEUE_NAME, { durable: true });

  ch.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    try {
      const burn: BurnMessage = JSON.parse(msg.content.toString());
      if (session) {
        await processMessage(session, burn);
      } else {
        logger.info({ burn }, 'Evento recebido (sem sessao)');
      }
      ch.ack(msg);
    } catch (err) {
      logger.error({ err }, 'Erro ao processar mensagem');
      ch.nack(msg, false, false);
    }
  });

  conn.on('error', (err) => logger.error({ err }, 'Consumer: erro de conexao'));
  conn.on('close', () => {
    logger.warn('Consumer: conexao fechada, reconectando em 10s');
    setTimeout(startConsumer, 10_000);
  });

  logger.info({ queue: QUEUE_NAME }, 'Consumer aguardando eventos');
}
