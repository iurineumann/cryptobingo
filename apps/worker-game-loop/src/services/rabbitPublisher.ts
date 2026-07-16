// apps/worker-game-loop/src/services/rabbitPublisher.ts
// Publicação de eventos na fila RabbitMQ com publisher confirms.
// Cria um canal confirm separado do canal consumidor para evitar contenção.
//
// Ref: Fase 1 (#368), ADR-007

import type { ConfirmChannel } from 'amqplib';
import { rabbitConnected } from './connectionState';
import { connection } from './rabbitmq';
import { workerQueuePublishedTotal } from './metrics';
import { logger } from './logger';

/** Canal de publish (confirm) — criado sob demanda, mantido como singleton. */
let publishChannel: ConfirmChannel | null = null;

/**
 * Aguarda até que o RabbitMQ esteja conectado (poll rabbitConnected).
 * Timeout padrão de 10s.
 */
async function waitForRabbit(timeoutMs = 10_000): Promise<void> {
    for (let elapsed = 0; elapsed < timeoutMs; elapsed += 100) {
        if (rabbitConnected) return;
        await new Promise<void>(r => setTimeout(r, 100));
    }
    throw new Error('RabbitMQ não conectado após timeout de ' + timeoutMs + 'ms');
}

/**
 * Obtém (ou cria) um canal confirm para publicação.
 * O canal é singleton — criado uma vez e reusado.
 */
export async function getPublishChannel(): Promise<ConfirmChannel> {
    if (publishChannel) return publishChannel;
    await waitForRabbit();
    publishChannel = await connection.createConfirmChannel();

    publishChannel.on('error', (err) => {
        logger.error({ err, tag: 'RabbitPublisher' }, 'Erro no canal de publish:')
        publishChannel = null;
    });
    publishChannel.on('close', () => {
        logger.warn({ tag: 'RabbitPublisher' }, 'Canal de publish fechado.')
        publishChannel = null;
    });

    return publishChannel;
}

/**
 * Publica um evento na fila RabbitMQ com publisher confirms.
 *
 * @param routingKey — Nome da fila (ex: 'game_loop_events')
 * @param action — Nome da ação (ex: 'startdraw')
 * @param payload — Dados adicionais (gameId, etc.)
 * @returns Promise que resolve no confirm do broker, rejeita em nack/return/timeout.
 */
export async function publishGameEvent(
    routingKey: string,
    action: string,
    payload: Record<string, unknown>
): Promise<void> {
    const ch = await getPublishChannel();
    const content = Buffer.from(JSON.stringify({ action, ...payload }));

    return new Promise<void>((resolve, reject) => {
        // waitForConfirms() aguarda TODOS os confirms pendentes do canal.
        // Como publicamos 1 evento por vez antes de aguardar, cobre este publish.
        const onConfirmed = () => {
            workerQueuePublishedTotal.inc({ action });
            resolve();
        };

        const published = ch.publish('', routingKey, content, { persistent: true });

        if (!published) {
            // Backpressure — aguarda o canal drenar antes de esperar o confirm.
            ch.once('drain', () => {
                ch.waitForConfirms().then(onConfirmed).catch(reject);
            });
            return;
        }

        ch.waitForConfirms().then(onConfirmed).catch(reject);
    });
}
