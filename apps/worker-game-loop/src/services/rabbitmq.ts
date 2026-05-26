// apps/worker-game-loop/src/services/rabbitmq.ts
// Consumidor RabbitMQ com DLQ, métricas Prometheus e handlers completos da FSM.
//
// Handlers adicionados nesta sprint:
//   fundgame    — CREATED → FUNDING (abre vendas)
//   abortgame   — LOCKED|DRAWING → ABORTED (fail-safe manual)
//   refundall   — processa lote de estornos após abortgame
//   cleargame   — GC de RAM após quarentena de 24h (SPEC.md §5.1)
//
// Ref: SPEC.md §2 (ABI), §5 (GC), COMPLIANCE.md §4

import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import {
    executeFundGame,
    executeLockGame,
    executeStartDraw,
    executeClaimWin,
    executeAbortGame,
    executeRefundTicket,
    executeClearGame,
}                          from './blockchain';
import { processAllGameWinners, findAllWinners } from './evaluator';
import { buildInvertedIndex, deleteIndex }        from './invertedIndex';
import {
    startSlowReveal,
    notifyGameLocked,
    notifyGameAborted,
    notifyWinners,
    type WinnerPayload,
}                          from './broadcaster';
import { fetchGame }       from '@cryptobingo/blockchain-core';
import { rpcClient }       from '@cryptobingo/blockchain-core';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';
import {
    eventsProcessedTotal,
    eventsFailedTotal,
    eventsDeadLetteredTotal,
    eventProcessingDuration,
    oraclePollAttempts,
}                          from './metrics';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL       = process.env.RABBITMQ_URL       || 'amqp://localhost:5672';
const CONTRACT_ACCOUNT   = process.env.CONTRACT_ACCOUNT   || 'bingo.game';
const RETRY_DELAY_MS     = 5_000;
const QUEUE_NAME         = 'game_loop_events';
const DLX_NAME           = 'game_loop_dlx';
const DLQ_NAME           = 'game_loop_dead';
const MAX_RETRIES        = parseInt(process.env.RABBITMQ_MAX_RETRIES ?? '3', 10);

// Polling do oráculo: 75 tentativas × 2s = 150s máximo
const ORACLE_POLL_MAX_ATTEMPTS = 75;
const ORACLE_POLL_INTERVAL_MS  = 2_000;

// Batch size para refundall e cleargame (respeita budget de CPU WAX ~30ms/bloco)
const GC_BATCH_SIZE = 50;

let connection: ChannelModel;
let channel:    Channel;

// ==========================================
// TIPOS DE PAYLOAD
// ==========================================

type GameEventPayload =
    | { action: 'fundgame';   gameId: string }
    | { action: 'lockgame';   gameId: string }
    | { action: 'startdraw';  gameId: string }
    | { action: 'claimwin';   gameId: string }
    | { action: 'abortgame';  gameId: string; reason?: string }
    | { action: 'refundall';  gameId: string }
    | { action: 'cleargame';  gameId: string };

// ==========================================
// HELPERS
// ==========================================

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function getDeliveryCount(msg: ConsumeMessage): number {
    const xDeath = msg.properties.headers?.['x-death'];
    if (!Array.isArray(xDeath) || xDeath.length === 0) return 0;
    return (xDeath[0].count as number) ?? 0;
}

async function waitForDrawnBalls(gameId: string): Promise<number[] | null> {
    console.log(`⏳ [RabbitMQ] Aguardando oráculo — jogo ${gameId}...`);

    for (let attempt = 1; attempt <= ORACLE_POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(ORACLE_POLL_INTERVAL_MS);
        try {
            const game = await fetchGame(gameId);
            if (game && game.drawn_balls.length === 75) {
                oraclePollAttempts.observe(attempt);
                console.log(`✅ [RabbitMQ] Oráculo respondeu (jogo ${gameId}, tentativa ${attempt})`);
                return game.drawn_balls;
            }
            console.log(
                `⏳ [RabbitMQ] Jogo ${gameId}: ${game?.drawn_balls.length ?? 0}/75 bolas ` +
                `(tentativa ${attempt}/${ORACLE_POLL_MAX_ATTEMPTS})`
            );
        } catch (err) {
            console.warn(`⚠️  [RabbitMQ] Erro ao consultar jogo ${gameId} (tentativa ${attempt}):`, err);
        }
    }

    oraclePollAttempts.observe(ORACLE_POLL_MAX_ATTEMPTS);
    return null;
}

// ==========================================
// SETUP DE FILAS E DLQ
// ==========================================

async function setupQueues(): Promise<void> {
    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, QUEUE_NAME);
    await channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange':    DLX_NAME,
            'x-dead-letter-routing-key': QUEUE_NAME,
        },
    });
    console.log(`✅ [RabbitMQ] Fila "${QUEUE_NAME}" + DLQ "${DLQ_NAME}" configuradas.`);
}

// ==========================================
// CONEXÃO RESILIENTE
// ==========================================

export async function connectRabbitMQ(): Promise<void> {
    try {
        console.log('🐇 [RabbitMQ] Conectando ao Message Broker...');
        connection = await amqp.connect(RABBITMQ_URL);

        connection.on('error', (err) => {
            console.error('❌ [RabbitMQ] Erro na conexão:', err.message);
        });
        connection.on('close', () => {
            console.warn(`⚠️  [RabbitMQ] Conexão encerrada. Reconectando em ${RETRY_DELAY_MS / 1000}s...`);
            setTimeout(connectRabbitMQ, RETRY_DELAY_MS);
        });

        channel = await connection.createChannel();
        await setupQueues();
        await channel.prefetch(1);

        console.log(`✅ [RabbitMQ] Escutando "${QUEUE_NAME}" (max retries: ${MAX_RETRIES})`);
        consumeMessages();

    } catch (error) {
        console.error(`❌ [RabbitMQ] Falha ao conectar. Tentando em ${RETRY_DELAY_MS / 1000}s...`, error);
        setTimeout(connectRabbitMQ, RETRY_DELAY_MS);
    }
}

// ==========================================
// CONSUMIDOR
// ==========================================

function consumeMessages(): void {
    channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const payloadStr    = msg.content.toString();
        const deliveryCount = getDeliveryCount(msg);

        console.log(`\n📥 [RabbitMQ] Mensagem recebida (delivery #${deliveryCount + 1}): ${payloadStr}`);

        // ── Parse ─────────────────────────────────────────────────────────────
        let payload: GameEventPayload;
        try {
            payload = JSON.parse(payloadStr) as GameEventPayload;
        } catch {
            console.error('❌ [RabbitMQ] JSON malformado. Descartando para DLQ.');
            eventsFailedTotal.inc({ action: 'unknown', reason: 'json_parse_error' });
            eventsDeadLetteredTotal.inc({ action: 'unknown' });
            channel.nack(msg, false, false);
            return;
        }

        if (!payload.action || !payload.gameId) {
            console.error('❌ [RabbitMQ] Campos obrigatórios ausentes. Descartando para DLQ.');
            eventsFailedTotal.inc({ action: 'unknown', reason: 'missing_fields' });
            eventsDeadLetteredTotal.inc({ action: 'unknown' });
            channel.nack(msg, false, false);
            return;
        }

        const { action, gameId } = payload;

        // ── DLQ Guard ─────────────────────────────────────────────────────────
        if (deliveryCount >= MAX_RETRIES) {
            console.error(
                `💀 [RabbitMQ] "${action}" jogo ${gameId} excedeu ${MAX_RETRIES} retentativas → DLQ.`
            );
            eventsFailedTotal.inc({ action, reason: 'max_retries_exceeded' });
            eventsDeadLetteredTotal.inc({ action });
            channel.nack(msg, false, false);
            return;
        }

        // ── Execução ──────────────────────────────────────────────────────────
        const timer = eventProcessingDuration.startTimer({ action });

        try {
            switch (action) {

                // ── fundgame: CREATED → FUNDING ──────────────────────────────
                case 'fundgame': {
                    await executeFundGame(gameId);
                    break;
                }

                // ── lockgame: FUNDING → LOCKED ───────────────────────────────
                case 'lockgame': {
                    await executeLockGame(gameId);
                    notifyGameLocked(gameId);
                    // Constrói o Índice Invertido Redis (SPEC.md §3.2)
                    // Executa após o lock — os tickets estão finalizados
                    buildInvertedIndex(gameId).catch(err =>
                        console.error(`[RabbitMQ] Erro ao construir índice para jogo ${gameId}:`, err)
                    );
                    break;
                }

                // ── startdraw: LOCKED → DRAWING → aguarda oráculo ────────────
                case 'startdraw': {
                    await executeStartDraw(gameId);

                    const drawnBalls = await waitForDrawnBalls(gameId);

                    if (!drawnBalls) {
                        console.error(`❌ [RabbitMQ] Timeout do oráculo para jogo ${gameId}.`);
                        // Aborta o jogo e notifica clientes
                        await executeAbortGame(gameId, 'ORACLE_TIMEOUT');
                        notifyGameAborted(gameId, 'ORACLE_TIMEOUT');
                        eventsFailedTotal.inc({ action, reason: 'oracle_timeout' });
                        eventsDeadLetteredTotal.inc({ action });
                        timer();
                        channel.nack(msg, false, false);
                        return;
                    }

                    startSlowReveal(gameId, drawnBalls);
                    break;
                }

                // ── claimwin: liquida vencedores e notifica broadcaster ───────
                case 'claimwin': {
                    const winners = await processAllGameWinnersWithResult(gameId);
                    if (winners.length > 0) {
                        notifyWinners(gameId, winners);
                    }
                    break;
                }

                // ── abortgame: fail-safe manual (admin halt) ─────────────────
                // Ref: SPEC.md §5.2, COMPLIANCE.md §4
                case 'abortgame': {
                    const reason = (payload as any).reason ?? 'ADMIN_HALT';
                    await executeAbortGame(gameId, reason);
                    notifyGameAborted(gameId, reason as any);
                    break;
                }

                // ── refundall: lote de estornos após ABORTED ──────────────────
                // Processa GC_BATCH_SIZE tickets por chamada (budget de CPU WAX)
                // Ref: SPEC.md §5.2
                case 'refundall': {
                    await processRefundAll(gameId);
                    break;
                }

                // ── cleargame: Garbage Collection de RAM após 24h ─────────────
                // Ref: SPEC.md §5.1
                case 'cleargame': {
                    await processClearGame(gameId);
                    break;
                }

                default: {
                    console.warn(`⚠️  [RabbitMQ] Ação desconhecida: "${action}". Descartando para DLQ.`);
                    eventsFailedTotal.inc({ action: 'unknown', reason: 'unknown_action' });
                    eventsDeadLetteredTotal.inc({ action: 'unknown' });
                    timer();
                    channel.nack(msg, false, false);
                    return;
                }
            }

            // ── Sucesso ───────────────────────────────────────────────────────
            const durationMs = timer();
            eventsProcessedTotal.inc({ action });
            channel.ack(msg);
            console.log(
                `✅ [RabbitMQ] "${action}" jogo ${gameId} processado ` +
                `em ${Math.round(durationMs ?? 0)}ms.`
            );

        } catch (err) {
            timer();
            const remaining = MAX_RETRIES - deliveryCount - 1;
            console.error(
                `❌ [RabbitMQ] Erro em "${action}" jogo ${gameId} ` +
                `(delivery #${deliveryCount + 1}, restam ${remaining} tentativas):`, err
            );
            eventsFailedTotal.inc({ action, reason: 'blockchain_error' });
            if (remaining <= 0) {
                console.error(`💀 [RabbitMQ] Descartando "${action}" jogo ${gameId} para DLQ.`);
                eventsDeadLetteredTotal.inc({ action });
                channel.nack(msg, false, false);
            } else {
                channel.nack(msg, false, true);
            }
        }

    }, { noAck: false });
}

// ==========================================
// HELPERS DE AÇÃO COMPLEXA
// ==========================================

/**
 * Processa estornos em lote para um jogo ABORTED.
 * Varre a tabela de tickets on-chain e chama refundticket() por ticket.
 * O tamanho do lote (GC_BATCH_SIZE) respeita o budget de CPU do bloco WAX.
 * Ref: SPEC.md §5.2
 */
async function processRefundAll(gameId: string): Promise<void> {
    console.log(`💸 [RabbitMQ] Iniciando refundall para jogo ${gameId}...`);

    let lowerBound: string | undefined;
    let totalRefunded = 0;
    let hasMore = true;

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       gameId,
            table:       'tickets',
            limit:       GC_BATCH_SIZE,
            lower_bound: lowerBound,
            json:        true,
        });

        const tickets = response.rows as BlockchainTicketRecord[];
        if (tickets.length === 0) break;

        for (const ticket of tickets) {
            await executeRefundTicket(gameId, ticket.ticket_id);
            totalRefunded++;
            // Aguarda 1 bloco WAX (~500ms) entre chamadas para não exceder CPU do bloco
            await sleep(600);
        }

        hasMore = response.more === true && tickets.length === GC_BATCH_SIZE;
        if (hasMore) {
            lowerBound = (BigInt(tickets[tickets.length - 1].ticket_id) + 1n).toString();
        }
    }

    console.log(`✅ [RabbitMQ] refundall concluído: ${totalRefunded} cartelas estornadas (jogo ${gameId})`);
}

/**
 * Garbage Collection iterativo de RAM após quarentena de 24h.
 * Continua chamando cleargame() com GC_BATCH_SIZE até não restar linhas.
 * Ref: SPEC.md §5.1
 */
async function processClearGame(gameId: string): Promise<void> {
    console.log(`🧹 [RabbitMQ] Iniciando cleargame para jogo ${gameId}...`);

    let totalCleared = 0;
    let keepGoing = true;

    while (keepGoing) {
        await executeClearGame(gameId, GC_BATCH_SIZE);
        totalCleared += GC_BATCH_SIZE;

        // Verifica se ainda há tickets
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: gameId,
            table: 'tickets',
            limit: 1,
            json:  true,
        });

        keepGoing = response.rows.length > 0;
        if (keepGoing) await sleep(600); // Respeita budget de CPU entre blocos
    }

    console.log(`✅ [RabbitMQ] cleargame concluído: ~${totalCleared} linhas liberadas (jogo ${gameId})`);
}

/**
 * Wrapper que combina processAllGameWinners + monta payload para o broadcaster.
 */
async function processAllGameWinnersWithResult(gameId: string): Promise<WinnerPayload[]> {
    await processAllGameWinners(gameId);

    const game = await fetchGame(gameId);
    if (!game || !game.drawn_balls.length) return [];

    const winResults = await findAllWinners(gameId, game.drawn_balls);

    return winResults.map(({ ticket, patternName }) => ({
        account:     ticket.owner,
        ticket_id:   ticket.ticket_id,
        win_pattern: patternName,
        payouts:     [game.prize_pool.quantity],
    }));
}
