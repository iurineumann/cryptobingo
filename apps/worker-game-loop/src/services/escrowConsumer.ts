// apps/worker-game-loop/src/services/escrowConsumer.ts
// Consumidor de eventos de queima de NFT (Rota 3 do bingoescrow).
// StateWatcher publica em escrow_burn_events; aqui consumimos e chamamos releaseburn.

import amqplib, { type Channel, type ConsumeMessage } from 'amqplib';
import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { logger } from './logger';

const RABBITMQ_URL    = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUE_NAME      = 'escrow_burn_events';
const RPC_URL         = process.env.RPC_URL  || 'https://waxtestnet.greymass.com';
const CHAIN_ID        = process.env.CHAIN_ID || 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12';
const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT || 'bingogamescr';
const BOT_PRIV_KEY    = process.env.ESCROW_BOT_PRIVATE_KEY;

interface BurnMessage {
    asset_id: number;
    owner: string;
    esc_id: number;
}

let session: Session | null = null;

function getBotSession(): Session | null {
    if (!BOT_PRIV_KEY) {
        logger.warn('ESCROW_BOT_PRIVATE_KEY nao configurada');
        return null;
    }
    if (session) return session;
    session = new Session({
        actor: ESCROW_CONTRACT,
        permission: 'bot',
        chain: { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(PrivateKey.from(BOT_PRIV_KEY)),
    });
    return session;
}

async function processBurn(msg: BurnMessage): Promise<void> {
    const sess = getBotSession();
    if (!sess) {
        logger.warn({ asset_id: msg.asset_id }, 'Sem sessao bot — pulando');
        return;
    }
    try {
        await sess.transact({
            actions: [{
                account: ESCROW_CONTRACT,
                name: 'releaseburn',
                authorization: [{ actor: ESCROW_CONTRACT, permission: 'bot' }],
                data: { asset_id: msg.asset_id, owner: msg.owner },
            }],
        }, { broadcast: true });
        logger.info({ asset_id: msg.asset_id }, 'releaseburn executado');
    } catch (err: any) {
        logger.error({ err, asset_id: msg.asset_id }, 'releaseburn falhou');
        throw err;
    }
}

export async function startEscrowConsumer(): Promise<void> {
    if (!BOT_PRIV_KEY) {
        logger.info('ESCROW_BOT_PRIVATE_KEY nao definida — consumer inativo');
        return;
    }

    const conn = await amqplib.connect(RABBITMQ_URL);
    const ch: Channel = await conn.createChannel();
    await ch.assertQueue(QUEUE_NAME, { durable: true });

    ch.consume(QUEUE_NAME, async (amqpMsg: ConsumeMessage | null) => {
        if (!amqpMsg) return;
        try {
            const burn: BurnMessage = JSON.parse(amqpMsg.content.toString());
            await processBurn(burn);
            ch.ack(amqpMsg);
        } catch (err) {
            logger.error({ err }, 'Erro processando escrow_burn_events');
            ch.nack(amqpMsg!, false, false);
        }
    });

    conn.on('error', (err) => logger.error({ err }, 'EscrowConsumer: erro de conexao'));
    conn.on('close', () => {
        logger.warn('EscrowConsumer: conexao fechada, reconectando em 10s');
        setTimeout(startEscrowConsumer, 10_000);
    });

    logger.info({ queue: QUEUE_NAME }, 'EscrowConsumer: pronto');
}
