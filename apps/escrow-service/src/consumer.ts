// apps/escrow-service/src/consumer.ts
// Consumer RabbitMQ — processa eventos da fila escrow_burn_events
// e chama bingogamescr::releaseburn on-chain (assinando como bot).
//
// Fase 3 — esboco funcional com poll (Firehose em F4).

import amqp, { type Channel, type ChannelModel }    from 'amqplib';
import { PrivateKey, Session }                       from '@wharfkit/session';
import { WalletPluginPrivateKey }                    from '@wharfkit/wallet-plugin-privatekey';
import { logger }                                    from './logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME    = 'escrow_burn_events';

const RPC_URL   = process.env.RPC_URL          || 'http://127.0.0.1:8888';
const CHAIN_ID  = process.env.CHAIN_ID         || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';

const keyRaw = process.env.MICROSERVICE_PRIVATE_KEY ||
               process.env.MICROSERVICE_KEY ||
               process.env.BINGOGAMESVC_KEY;
const microKey = keyRaw ? PrivateKey.from(keyRaw) : null;

function getSession(): Session | null {
  if (!microKey) {
    logger.warn('MICROSERVICE_PRIVATE_KEY nao configurada — assinatura offline');
    return null;
  }
  return new Session({
    actor: 'bingogamesvc',
    permission: 'active',
    chain: { id: CHAIN_ID, url: RPC_URL },
    walletPlugin: new WalletPluginPrivateKey(microKey),
  });
}

interface BurnMessage {
  asset_id: number;
  owner: string;
  esc_id: number;
}

async function processMessage(session: Session, msg: BurnMessage): Promise<void> {
  logger.info({ asset_id: msg.asset_id, owner: msg.owner }, 'Processando releaseburn');

  try {
    await session.transact({
      actions: [{
        account: ESCROW_CONTRACT,
        name: 'releaseburn',
        authorization: [{ actor: 'bingogamesvc', permission: 'bot' }],
        data: {
          asset_id: msg.asset_id,
          owner: msg.owner,
        },
      }],
    }, { broadcast: true });

    logger.info({ asset_id: msg.asset_id }, 'releaseburn concluido');
  } catch (err: any) {
    logger.error({ err, asset_id: msg.asset_id }, 'Falha ao chamar releaseburn');
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

  logger.info({ queue: QUEUE_NAME }, 'Consumer aguardando eventos');
}
