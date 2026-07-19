// apps/worker-game-loop/src/services/broadcaster.ts
// Publisher de Slow Reveal via Redis pub/sub (ADR-007, BUG #259).
//
// ANTES (BUG #259): o broadcaster rodava um Server Socket.io no WORKER
// (porta 8085, não exposta). O frontend conectava em `wss://test-api.cryptobingo.bet`
// (api-gateway, que só tinha o chat) → o worker emitia `ball_drawn` para uma porta
// interna inalcançável → o reveal ao vivo nunca chegava ao cliente.
//
// AGORA (Opção A aprovada): o REVEAL NÃO usa mais o Socket.io do worker. O worker
// publica os eventos de reveal em Redis pub/sub (`bc:reveal`); o api-gateway
// (broadcastSocket.ts) assina e re-emite via `io.to('game:'+gameId)` — Socket.io já
// exposto em test-api.cryptobingo.bet. O frontend continua apontando para o api-gateway.
//
// O `io` (Server Socket.io) é mantido A PENAS para o dropWorker emitir mensagens de
// chat de drop internamente (porta 8085, não exposta ao frontend). O reveal ao vivo
// (ball_drawn/winner_found/etc) vai 100% via Redis → api-gateway.
//
// Formato da mensagem Redis (consumida por broadcastSocket.ts):
//   { type: string, gameId: string, payload: any }
//
// Ref: ADR-007, asyncapi.yaml v1.1.0

import { Server } from 'socket.io';
import { redisClient } from './redis';
import { logger } from './logger';
import {
    slowRevealBallsTotal,
    slowRevealSessionsActive,
} from './metrics';

const WS_PORT           = parseInt(process.env.WS_PORT ?? '8085', 10);
const REVEAL_CHANNEL    = 'bc:reveal';
const REVEAL_INTERVAL_MS = parseInt(process.env.REVEAL_INTERVAL ?? '3000', 10);

// Server Socket.io mantido APENAS para o dropWorker emitir chat de drop (interno).
// O frontend NÃO se conecta aqui (usa o api-gateway). O reveal usa Redis.
// Criado no load do módulo (sempre Server, não null) p/ o dropWorker usar wsIo.of('/chat').
export const io: Server = new Server(undefined, { cors: { origin: '*' } });

// Tipo mínimo de vencedor (compatível com o payload do frontend).
export type WinnerPayload = any;

// ==========================================
// SESSÃO DE REVEAL (espelho local do worker)
// ==========================================
interface RevealSession {
    gameId:     string;
    balls:      number[];
    currentIdx: number;
    timer:      ReturnType<typeof setInterval> | null;
    winners:    WinnerPayload[];
    resolve:    () => void;
    totalBalls?: number;
}

const activeSessions = new Map<string, RevealSession>();

// ==========================================
// PUBLISHER REDIS
// ==========================================
function publishReveal(type: string, gameId: string, payload: any): void {
    const msg = JSON.stringify({ type, gameId, payload });
    redisClient.publish(REVEAL_CHANNEL, msg).catch((err) =>
        logger.error({ err, tag: 'WS' }, `Falha ao publicar ${type} no Redis (jogo ${gameId}):`),
    );
}

// ==========================================
// API PÚBLICA DO BROADCASTER
// ==========================================

/**
 * Inicia (ou continua) o Slow Reveal de um lote de bolas.
 * ADR-014: retorna Promise<void> que resolve quando o lote completo foi publicado.
 * Pode ser chamado múltiplas vezes para o mesmo jogo em lotes (MULTI_MATCH, GOLDEN_BALL).
 */
export function startSlowReveal(gameId: string, balls: number[], totalBalls?: number): Promise<void> {
    if (!balls || balls.length === 0) {
        logger.warn({ tag: 'WS' }, `Lote vazio para jogo ${gameId}. Resolvendo imediatamente.`);
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const existing    = activeSessions.get(gameId);
        const startIdx    = existing?.currentIdx ?? 0;
        const mergedTotal = totalBalls ?? existing?.totalBalls;

        const allBalls = existing
            ? [...existing.balls.slice(0, startIdx), ...balls]
            : balls;

        const session: RevealSession = {
            gameId,
            balls:      allBalls,
            currentIdx: startIdx,
            timer:      null,
            winners:    existing?.winners ?? [],
            resolve,
            totalBalls: mergedTotal,
        };

        if (existing?.timer) clearInterval(existing.timer);
        activeSessions.set(gameId, session);

        if (!existing) slowRevealSessionsActive.inc();

        logger.info(
            `🎱 [WS] Reveal jogo ${gameId}: bolas ${startIdx + 1}–${allBalls.length} ` +
            `(${balls.length} novas, ${REVEAL_INTERVAL_MS}ms/bola) — publicando em Redis ${REVEAL_CHANNEL}`,
        );

        session.timer = setInterval(() => {
            const idx = session.currentIdx;

            if (idx >= session.balls.length) {
                clearInterval(session.timer!);
                session.timer = null;
                logger.info({ tag: 'WS' }, `Lote concluído (jogo ${gameId}, até bola ${idx}).`);
                resolve();
                return;
            }

            const number    = session.balls[idx];
            const order     = idx + 1;
            const timestamp = new Date().toISOString();

            publishReveal('ball_drawn', gameId, {
                event:   'ball_drawn',
                game_id: parseInt(gameId, 10),
                payload: { order, number, timestamp, total_balls: session.totalBalls },
            });

            slowRevealBallsTotal.inc();

            if (session.winners.length > 0) {
                publishReveal('winner_found', gameId, {
                    event:   'winner_found',
                    game_id: parseInt(gameId, 10),
                    payload: { winning_ball: number, winners: session.winners },
                });
                logger.info({ tag: 'WS' }, `${session.winners.length} vencedor(es) — jogo ${gameId} bola #${order}`);
                session.winners = [];
            }

            session.currentIdx++;
        }, REVEAL_INTERVAL_MS);
    });
}

/**
 * Encerra e limpa a sessão de reveal de um jogo.
 * Chamado pelo orquestrador após o último lote para liberar memória.
 */
export function endRevealSession(gameId: string): void {
    const session = activeSessions.get(gameId);
    if (session) {
        if (session.timer) clearInterval(session.timer);
        activeSessions.delete(gameId);
        slowRevealSessionsActive.dec();
        logger.info({ tag: 'WS' }, `Sessão de reveal encerrada (jogo ${gameId}).`);
    }
}

/**
 * ADR-014 — GOLDEN_BALL: anuncia a bola dourada antes de revelá-la.
 */
export function notifyGoldenBall(gameId: string, ballNum: number, multiplier: number): void {
    publishReveal('golden_ball', gameId, {
        event:   'golden_ball',
        game_id: parseInt(gameId, 10),
        payload: { ball_num: ballNum, multiplier },
    });
    logger.info({ tag: 'WS' }, `golden_ball ${ballNum} (×${multiplier}) — jogo ${gameId}`);
}

/**
 * GOLDEN_BALL: animação sequencial do multiplicador.
 */
export function notifyGoldenMultiplierProgress(gameId: string, multiplier: number, isFinal: boolean): void {
    publishReveal('golden_multiplier_progress', gameId, {
        event:   'golden_multiplier_progress',
        game_id: parseInt(gameId, 10),
        payload: { multiplier, is_final: isFinal },
    });
    logger.info({ tag: 'WS' }, `golden_multiplier_progress ×${multiplier}${isFinal ? ' (FINAL)' : ''} — jogo ${gameId}`);
}

/**
 * ADR-014 — MULTI_MATCH: anuncia os vencedores de um estágio após o cutoff ball.
 */
export function notifyStageCleared(
    gameId:     string,
    stage:      number,
    winners:    WinnerPayload[],
    cutoffBall: number,
    drawnBalls: number[],
): void {
    const winningBall = cutoffBall > 0 && cutoffBall <= drawnBalls.length
        ? drawnBalls[cutoffBall - 1]
        : 0;
    publishReveal('stage_cleared', gameId, {
        event:   'stage_cleared',
        game_id: parseInt(gameId, 10),
        payload: { stage, winners, winning_ball: winningBall },
    });
    logger.info({ tag: 'WS' }, `stage_cleared estágio ${stage} (${winners.length} vencedor(es), bola ${winningBall}) — jogo ${gameId}`);
}

/**
 * ADR-014: sinaliza o fim completo do reveal (após último lote).
 */
export function notifyGameEnded(gameId: string, drawMode: string, totalWinners: number): void {
    publishReveal('game_ended', gameId, {
        event:   'game_ended',
        game_id: parseInt(gameId, 10),
        payload: { draw_mode: drawMode, total_winners: totalWinners },
    });
    logger.info({ tag: 'WS' }, `game_ended (modo: ${drawMode}, vencedores: ${totalWinners}) — jogo ${gameId}`);
}

/**
 * Injeta vencedores na sessão de reveal ativa.
 * Publicados junto à próxima bola sorteada (iteração do timer).
 * Se o reveal já encerrou, publica diretamente.
 */
export function notifyWinners(gameId: string, winners: WinnerPayload[]): void {
    const session = activeSessions.get(gameId);
    if (session) {
        session.winners = winners;
        logger.info({ tag: 'WS' }, `${winners.length} vencedor(es) enfileirados para emissão no jogo ${gameId}`);
    } else {
        publishReveal('winner_found', gameId, {
            event:   'winner_found',
            game_id: parseInt(gameId, 10),
            payload: { winning_ball: null, winners },
        });
        logger.info({ tag: 'WS' }, `Jogo ${gameId} — vencedores publicados diretamente (reveal já encerrado)`);
    }
}

/**
 * Emite prize_tx_sent — transação de prêmio enviada à blockchain.
 */
export function notifyPrizeTxSent(gameId: string, ticketId: string, winLabel?: string): void {
    publishReveal('prize_tx_sent', gameId, {
        event:   'prize_tx_sent',
        game_id: parseInt(gameId, 10),
        payload: { ticketId, winLabel },
    });
}

/**
 * Emite prize_confirmed — prêmio persistido no MongoDB.
 */
export function notifyPrizeConfirmed(
    gameId:        string,
    ticketId:      string,
    transactionId: string,
    amount:        string,
    currency:      string,
    winLabel?:     string,
): void {
    publishReveal('prize_confirmed', gameId, {
        event:   'prize_confirmed',
        game_id: parseInt(gameId, 10),
        payload: { ticketId, transactionId, amount, currency, winLabel },
    });
}

/**
 * Emite game_locked para todos os clientes de um jogo.
 */
export function notifyGameLocked(gameId: string): void {
    publishReveal('game_locked', gameId, {
        event:     'game_locked',
        game_id:   parseInt(gameId, 10),
        timestamp: new Date().toISOString(),
    });
    logger.info({ tag: 'WS' }, `game_locked publicado para jogo ${gameId}`);
}

/**
 * Emite reveal_started — início do SLOW REVEAL (nosso lado, "showing").
 * Chamado pelo gameOrchestrator APÓS o contrato confirmar `drawn` e ANTES do
 * startSlowReveal. Substitui semanticamente o antigo notifyDrawingStarted (que
 * era emitido junto com executeStartDraw, confundindo sorteio on-chain com reveal).
 * Permite o lobby/frontend transitar locked→drawing (showing) em tempo real.
 */
export function notifyRevealStarted(gameId: string): void {
    publishReveal('reveal_started', gameId, {
        event:     'reveal_started',
        game_id:   parseInt(gameId, 10),
        timestamp: new Date().toISOString(),
    });
    logger.info({ tag: 'WS' }, `reveal_started publicado para jogo ${gameId}`);
}

/**
 * Emite game_funded — jogo abriu para vendas (CREATED → FUNDING).
 * Permite o lobby atualizar o status em tempo real (sem esperar polling).
 */
export function notifyGameFunded(gameId: string): void {
    publishReveal('game_funded', gameId, {
        event:   'game_funded',
        game_id: parseInt(gameId, 10),
        timestamp: new Date().toISOString(),
    });
    logger.info({ tag: 'WS' }, `game_funded publicado para jogo ${gameId}`);
}

/**
 * Emite game_aborted e encerra qualquer reveal ativo.
 */
export function notifyGameAborted(
    gameId: string,
    reason: 'ORACLE_TIMEOUT' | 'ORACLE_TIMEOUT_RECOVERY' | 'LOW_QUORUM' | 'ADMIN_HALT' | 'NO_TICKETS' | 'NO_TICKETS_DRAWING' | 'NO_TICKETS_LOCKED',
): void {
    const session = activeSessions.get(gameId);
    if (session?.timer) {
        clearInterval(session.timer);
        activeSessions.delete(gameId);
        slowRevealSessionsActive.dec();
    }

    publishReveal('game_aborted', gameId, {
        event:   'game_aborted',
        game_id: parseInt(gameId, 10),
        payload: { reason },
    });
    logger.info({ tag: 'WS' }, `game_aborted (${reason}) publicado para jogo ${gameId}`);
}

// ==========================================
// BOOTSTRAP
// ==========================================

/**
 * Modo híbrido (BUG #259):
 *  - Sobe o Server Socket.io (porta WS_PORT, interna) APENAS para o dropWorker
 *    emitir chat de drop. O frontend não se conecta aqui.
 *  - O reveal ao vivo vai via Redis pub/sub (bc:reveal) → api-gateway.
 */
export function startBroadcaster(): void {
    io.listen(WS_PORT);
    logger.info(
        { tag: 'WS' },
        `Broadcaster: Socket.io (chat interno dropWorker) na porta ${WS_PORT}; ` +
        `reveal ao vivo via Redis pub/sub ${REVEAL_CHANNEL} → api-gateway.`,
    );
}

/**
 * Encerra todas as sessões de reveal ativas e o servidor Socket.io (shutdown gracioso).
 */
export function stopBroadcaster(): void {
    for (const [gameId, session] of activeSessions) {
        if (session.timer) clearInterval(session.timer);
        activeSessions.delete(gameId);
    }
    slowRevealSessionsActive.set(0);
    io.close();
    logger.info({ tag: 'WS' }, 'Broadcaster encerrado (todas as sessões de reveal limpas).');
}
