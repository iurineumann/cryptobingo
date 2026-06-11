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
import { findAllWinners }                          from './evaluator';
import { buildInvertedIndex }                       from './invertedIndex';
import { onGameResolved }                           from './roomManager';
import { orchestrateGame }                          from './gameOrchestrator';
import {
    notifyGameLocked,
    notifyGameAborted,
    notifyWinners,
    type WinnerPayload,
}                          from './broadcaster';
import { fetchGame }       from '@cryptobingo/blockchain-core';
import { rpcClient }       from '@cryptobingo/blockchain-core';
import { Name, UInt64 }    from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord, BlockchainRoom } from '@cryptobingo/shared-types';
import {
    eventsProcessedTotal,
    eventsFailedTotal,
    eventsDeadLetteredTotal,
    eventProcessingDuration,
    oraclePollAttempts,
}                          from './metrics';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL         = process.env.RABBITMQ_URL         || 'amqp://localhost:5672';
const CONTRACT_ACCOUNT     = process.env.CONTRACT_ACCOUNT     || 'bingogamectr';
const RETRY_DELAY_MS       = 5_000;
const CONNECT_TIMEOUT_MS   = 10_000; // amqp.connect() não tem timeout nativo — forçamos 10s
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

        // amqp.connect() pode travar indefinidamente em TCP half-open — timeout explícito
        connection = await Promise.race([
            amqp.connect(RABBITMQ_URL),
            new Promise<never>((_, reject) => {
                const t = setTimeout(
                    () => reject(new Error(`timeout após ${CONNECT_TIMEOUT_MS / 1000}s`)),
                    CONNECT_TIMEOUT_MS,
                );
                t.unref(); // não impede o processo de sair em testes
            }),
        ]);

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

                // ── startdraw: LOCKED → DRAWING → aguarda oráculo → orquestra reveal + pagamento ──
                // ADR-014: ACK imediato antes do reveal (o reveal pode durar ~120s para 35 bolas).
                // O orquestrador assume o controle: reveal → avalia → paga → próxima partida.
                case 'startdraw': {
                    await executeStartDraw(gameId);

                    const drawnBalls = await waitForDrawnBalls(gameId);

                    if (!drawnBalls) {
                        console.error(`❌ [RabbitMQ] Timeout do oráculo para jogo ${gameId}.`);
                        await executeAbortGame(gameId, 'ORACLE_TIMEOUT');
                        notifyGameAborted(gameId, 'ORACLE_TIMEOUT');
                        eventsFailedTotal.inc({ action, reason: 'oracle_timeout' });
                        eventsDeadLetteredTotal.inc({ action });
                        timer();
                        channel.nack(msg, false, false);
                        return;
                    }

                    // ACK antes de iniciar o reveal longo — libera o consumidor RabbitMQ
                    timer();
                    channel.ack(msg);

                    // Orquestra reveal + avaliação + pagamentos (pode demorar vários minutos)
                    orchestrateGame(gameId).catch(err =>
                        console.error(`❌ [RabbitMQ] orchestrateGame error (jogo ${gameId}):`, err)
                    );
                    return; // Retorno antecipado — ACK já foi enviado acima
                }

                // ── claimwin (fallback manual): reprocessa jogo em DRAWN/PAYING ────────────
                // ADR-014: no fluxo normal, o orquestrador faz tudo via startdraw.
                // Este handler serve para reprocessamento manual de jogos presos.
                case 'claimwin': {
                    console.log(`[RabbitMQ] claimwin manual (fallback) para jogo ${gameId}`);
                    orchestrateGame(gameId).catch(err =>
                        console.error(`❌ [RabbitMQ] orchestrateGame fallback error (jogo ${gameId}):`, err)
                    );
                    break;
                }

                // ── abortgame: fail-safe manual (admin halt) ─────────────────
                // Ref: SPEC.md §5.2, COMPLIANCE.md §4
                case 'abortgame': {
                    const reason = (payload as any).reason ?? 'ADMIN_HALT';
                    await executeAbortGame(gameId, reason);
                    notifyGameAborted(gameId, reason as any);
                    // ADR-014: onGameResolved no abort (cria próxima partida da sala)
                    onGameResolved(gameId).catch(err =>
                        console.error(`[RabbitMQ] onGameResolved error (abort, jogo ${gameId}):`, err)
                    );
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
            scope:       Name.from(UInt64.from(gameId)),
            table:       'tickets',
            key_type:    'i64',
            limit:       GC_BATCH_SIZE,
            lower_bound: lowerBound as any,
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
            scope: Name.from(UInt64.from(gameId)),
            table: 'tickets',
            limit: 1,
            json:  true,
        });

        keepGoing = response.rows.length > 0;
        if (keepGoing) await sleep(600); // Respeita budget de CPU entre blocos
    }

    console.log(`✅ [RabbitMQ] cleargame concluído: ~${totalCleared} linhas liberadas (jogo ${gameId})`);
}

// ==========================================
// AUTO-ADVANCE: polling do ciclo de vida do jogo
// ==========================================

/**
 * Auto-lock: encontra jogos em FUNDING com game_id (timestamp) anterior ao cutoff
 * e publica lockgame + inicia o sorteio.
 *
 * O game_id é gerado via Date.now() em generateGameId(), então o valor numérico
 * é um timestamp válido para medir idade do jogo.
 *
 * ⚠️ BUG FIX: jogos de salas têm game_id numérico muito menor que jogos diretos
 * (room_id=0). Com reverse:true e limit:20, os jogos de sala nunca aparecem no
 * topo. Corrigido com varredura adicional por sala ativa.
 */
const AUTO_LOCK_DELAY_SEC = parseInt(process.env.AUTO_LOCK_DELAY_SEC ?? '60', 10);
const processedGames = new Set<string>();

async function fetchActiveRoomGameIds(): Promise<string[]> {
    const roomsResponse = await rpcClient.v1.chain.get_table_rows({
        code:  CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'rooms',
        limit: 100,
        json:  true,
    });
    const rooms = roomsResponse.rows as BlockchainRoom[];
    return rooms
        .filter(r => r.status === 'active' && String(r.current_game_id) !== '0')
        .map(r => String(r.current_game_id));
}

export async function autoLockFundingGames(): Promise<void> {
    const cutoff = Date.now() - AUTO_LOCK_DELAY_SEC * 1000;
    const seen = new Set<string>();

    try {
        // ── 1. Jogos diretos (room_id=0) pela tabela games ────────────────
        const response = await rpcClient.v1.chain.get_table_rows({
            code:    CONTRACT_ACCOUNT,
            scope:   CONTRACT_ACCOUNT,
            table:   'games',
            limit:   100,
            reverse: false,
            json:    true,
        });

        for (const game of response.rows as BlockchainGameState[]) {
            const gameId = String(game.game_id);
            if (game.status !== 'funding') continue;
            seen.add(gameId);
            if (processedGames.has(gameId)) continue;
            if (Number(gameId) > cutoff || Number(gameId) <= 0) continue;
            await processFundingGame(game, gameId);
        }

        // ── 2. Jogos de salas ativas (room.current_game_id) ────────────────
        const roomGameIds = await fetchActiveRoomGameIds();
        for (const gameId of roomGameIds) {
            if (seen.has(gameId) || processedGames.has(gameId)) continue;
            let game: BlockchainGameState | null = null;
            try {
                game = await fetchGame(gameId);
            } catch { continue; }
            if (!game || game.status !== 'funding') continue;
            if (Number(gameId) > cutoff || Number(gameId) <= 0) continue;
            await processFundingGame(game, gameId);
        }
    } catch (err) {
        console.error('[AutoAdvance] Erro no polling funding:', err);
    }
}

async function processFundingGame(game: BlockchainGameState, gameId: string): Promise<void> {
    processedGames.add(gameId);

    const wagered = (game as any).total_wagered;
    const amount  = parseFloat(wagered?.quantity ?? '0') || 0;
    const hasTickets = amount > 0;

    if (!hasTickets) {
        console.log(`[AutoAdvance] 🗑️ Jogo ${gameId} sem cartelas. Abortando...`);
        try {
            await executeLockGame(gameId);
            await executeAbortGame(gameId, 'NO_TICKETS');
            notifyGameAborted(gameId, 'NO_TICKETS');
            onGameResolved(gameId).catch(err =>
                console.error(`[AutoAdvance] onGameResolved error (abort vazio, jogo ${gameId}):`, err)
            );
        } catch (err) {
            console.error(`[AutoAdvance] Erro ao abortar jogo vazio ${gameId}:`, err);
            processedGames.delete(gameId);
        }
        return;
    }

    console.log(`[AutoAdvance] 🔒 Travando jogo ${gameId} (funding >${AUTO_LOCK_DELAY_SEC}s)...`);

    try {
        await executeLockGame(gameId);
        notifyGameLocked(gameId);

        buildInvertedIndex(gameId).catch(err =>
            console.error(`[AutoAdvance] Erro índice invertido (jogo ${gameId}):`, err)
        );

        autoStartDraw(gameId).catch(err => {
            console.error(`[AutoAdvance] Erro startdraw (jogo ${gameId}):`, err);
            processedGames.delete(gameId);
        });
    } catch (err) {
        console.error(`[AutoAdvance] Erro ao travar jogo ${gameId}:`, err);
        processedGames.delete(gameId);
    }
}

export async function autoClaimDrawnGames(): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:    CONTRACT_ACCOUNT,
            scope:   CONTRACT_ACCOUNT,
            table:   'games',
            limit:   100,
            reverse: false,
            json:    true,
        });

        const games = response.rows as BlockchainGameState[];
        for (const game of games) {
            const gameId = String(game.game_id);
            if (game.status !== 'drawn') continue;
            if (processedGames.has(gameId)) continue;
            await processDrawnGame(gameId);
        }

        // Jogos de salas ativas
        const roomGameIds = await fetchActiveRoomGameIds();
        for (const gameId of roomGameIds) {
            if (processedGames.has(gameId)) continue;
            let game: BlockchainGameState | null = null;
            try {
                game = await fetchGame(gameId);
            } catch { continue; }
            if (!game || game.status !== 'drawn') continue;
            await processDrawnGame(gameId);
        }
    } catch (err) {
        console.error('[AutoAdvance] Erro no polling drawn:', err);
    }
}

async function processDrawnGame(gameId: string): Promise<void> {
    processedGames.add(gameId);
    console.log(`[AutoAdvance] 🏁 Jogo ${gameId} em DRAWN. Orquestrando conclusão...`);
    orchestrateGame(gameId).catch(err => {
        console.error(`[AutoAdvance] Erro orquestrando jogo ${gameId}:`, err);
        processedGames.delete(gameId);
    });
}

export async function autoStartLockedGames(): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:    CONTRACT_ACCOUNT,
            scope:   CONTRACT_ACCOUNT,
            table:   'games',
            limit:   100,
            reverse: false,
            json:    true,
        });

        const games = response.rows as BlockchainGameState[];
        for (const game of games) {
            const gameId = String(game.game_id);
            if (game.status !== 'locked') continue;
            if (processedGames.has(gameId)) continue;
            await processLockedGame(gameId);
        }

        // Jogos de salas ativas
        const roomGameIds = await fetchActiveRoomGameIds();
        for (const gameId of roomGameIds) {
            if (processedGames.has(gameId)) continue;
            let game: BlockchainGameState | null = null;
            try {
                game = await fetchGame(gameId);
            } catch { continue; }
            if (!game || game.status !== 'locked') continue;
            await processLockedGame(gameId);
        }
    } catch (err) {
        console.error('[AutoAdvance] Erro no polling locked:', err);
    }
}

async function processLockedGame(gameId: string): Promise<void> {
    processedGames.add(gameId);
    autoStartDraw(gameId).catch(err => {
        console.error(`[AutoAdvance] Erro startdraw locked (jogo ${gameId}):`, err);
        processedGames.delete(gameId);
    });
}

async function autoStartDraw(gameId: string): Promise<void> {
    console.log(`[AutoAdvance] 🎲 Iniciando sorteio do jogo ${gameId}...`);

    await executeStartDraw(gameId);

    const drawnBalls = await waitForDrawnBalls(gameId);

    if (!drawnBalls) {
        console.error(`[AutoAdvance] ❌ Timeout do oráculo para jogo ${gameId}. Abortando.`);
        await executeAbortGame(gameId, 'ORACLE_TIMEOUT');
        notifyGameAborted(gameId, 'ORACLE_TIMEOUT');
        return;
    }

    console.log(`[AutoAdvance] ✅ Oráculo respondeu (jogo ${gameId}). Orquestrando...`);
    await orchestrateGame(gameId);
}

