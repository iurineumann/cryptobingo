// apps/worker-game-loop/src/services/broadcaster.ts
// Servidor Socket.io do Slow Reveal com métricas Prometheus integradas.
// Ref: ADR-007, asyncapi.yaml v1.1.0

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import {
    wsConnectionsActive,
    slowRevealBallsTotal,
    slowRevealSessionsActive,
} from './metrics';

const WS_PORT            = parseInt(process.env.WS_PORT         ?? '8085', 10);
const JWT_SECRET         = process.env.JWT_SECRET               ?? '';
const REVEAL_INTERVAL_MS = parseInt(process.env.REVEAL_INTERVAL ?? '3000', 10);

// ==========================================
// TIPOS
// ==========================================

/** Estado interno de um Slow Reveal em andamento para um jogo. */
interface RevealSession {
    gameId:     string;
    balls:      number[];         // Sequência completa do sorteio (75 bolas)
    currentIdx: number;           // Próximo índice a emitir (0-74)
    timer:      ReturnType<typeof setInterval> | null;
    winners:    WinnerPayload[];  // Preenchido pelo evaluator ao detectar vencedores
}

export interface WinnerPayload {
    account:     string;
    ticket_id:   string;
    win_pattern: string;
    payouts:     string[];        // ["10.0000 WAX", ...]
}

// ==========================================
// ESTADO INTERNO (stateless entre partidas)
// ==========================================

const activeSessions = new Map<string, RevealSession>();

// ==========================================
// SERVIDOR SOCKET.IO
// ==========================================

const httpServer = createServer();

export const io = new Server(httpServer, {
    cors: {
        origin:  process.env.ALLOWED_ORIGIN ?? '*',
        methods: ['GET', 'POST'],
    },
    pingTimeout:  30_000,
    pingInterval: 10_000,
    transports:   ['websocket', 'polling'],
});

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO (JWT)
// Valida JWT antes de aceitar a conexão WebSocket.
// Conexões sem token válido são rejeitadas — prevenção de DDoS.
// Ref: ADR-007 §5
// ==========================================

io.use((socket: Socket, next) => {
    if (!JWT_SECRET) {
        console.warn('⚠️  [WS] JWT_SECRET ausente — autenticação desabilitada (apenas DEV).');
        return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('AUTH_REQUIRED: Token JWT ausente no handshake.'));

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { wallet: string };
        (socket as any).wallet = payload.wallet;
        next();
    } catch {
        next(new Error('AUTH_INVALID: Token JWT inválido ou expirado.'));
    }
});

// ==========================================
// HANDLERS DE CONEXÃO
// ==========================================

io.on('connection', (socket: Socket) => {
    const wallet = (socket as any).wallet ?? 'anonymous';
    wsConnectionsActive.inc();
    console.log(`🔌 [WS] Conectado: ${socket.id} (${wallet})`);

    // ── subscribe: cliente entra na room de um jogo ───────────────────────────
    socket.on('subscribe', (data: { game_id: number }) => {
        const gameId = String(data?.game_id);
        if (!gameId || gameId === 'undefined') {
            socket.emit('error', { message: 'game_id inválido.' });
            return;
        }

        const room = `game:${gameId}`;
        socket.join(room);
        console.log(`📡 [WS] ${wallet} entrou na room ${room}`);

        // Envia estado atual imediatamente se o reveal já está em andamento
        const session = activeSessions.get(gameId);
        if (session && session.currentIdx > 0) {
            const emittedBalls = session.balls.slice(0, session.currentIdx);
            socket.emit('sync_response', {
                game_id:    parseInt(gameId, 10),
                from_order: 1,
                balls:      emittedBalls.map((number, i) => ({
                    order:     i + 1,
                    number,
                    timestamp: new Date().toISOString(),
                })),
            });
            console.log(
                `📨 [WS] Estado atual (${emittedBalls.length} bolas) enviado para ${wallet} (jogo ${gameId})`
            );
        }
    });

    // ── sync: reconciliação por Sequence ID ──────────────────────────────────
    // Ref: ADR-007 §4
    socket.on('sync', (data: { game_id: number; last_order: number }) => {
        const gameId    = String(data?.game_id);
        const lastOrder = data?.last_order ?? 0;
        const session   = activeSessions.get(gameId);

        if (!session) {
            socket.emit('error', { message: `Jogo ${gameId} sem reveal ativo.` });
            return;
        }

        const missedBalls = session.balls
            .slice(lastOrder, session.currentIdx)
            .map((number, i) => ({
                order:     lastOrder + i + 1,
                number,
                timestamp: new Date().toISOString(),
            }));

        if (missedBalls.length > 0) {
            socket.emit('sync_response', {
                game_id:    parseInt(gameId, 10),
                from_order: lastOrder + 1,
                balls:      missedBalls,
            });
            console.log(
                `🔄 [WS] Reconciliação: ${missedBalls.length} bola(s) reenviadas ` +
                `para ${wallet} (jogo ${gameId}, a partir do order ${lastOrder + 1})`
            );
        }
    });

    socket.on('disconnect', (reason) => {
        wsConnectionsActive.dec();
        console.log(`🔌 [WS] Desconectado: ${socket.id} (${wallet}) — ${reason}`);
    });
});

// ==========================================
// API PÚBLICA DO BROADCASTER
// ==========================================

/**
 * Inicia o Slow Reveal de um jogo.
 * Emite uma bola a cada REVEAL_INTERVAL_MS para todos os clientes na room.
 * Carrega wsConnectionsActive, slowRevealBallsTotal e slowRevealSessionsActive.
 * Ref: ADR-007 §2, §6
 */
export function startSlowReveal(gameId: string, balls: number[]): void {
    if (activeSessions.has(gameId)) {
        console.warn(`⚠️  [WS] Jogo ${gameId} já tem um reveal em andamento. Ignorando.`);
        return;
    }

    if (!balls || balls.length === 0) {
        console.error(`❌ [WS] drawn_balls vazio para jogo ${gameId}. Abortando reveal.`);
        return;
    }

    const session: RevealSession = {
        gameId,
        balls,
        currentIdx: 0,
        timer:      null,
        winners:    [],
    };

    activeSessions.set(gameId, session);
    slowRevealSessionsActive.inc();

    const room = `game:${gameId}`;
    console.log(`🎱 [WS] Iniciando Slow Reveal do jogo ${gameId} (${balls.length} bolas, ${REVEAL_INTERVAL_MS}ms/bola)`);

    session.timer = setInterval(() => {
        const idx = session.currentIdx;

        if (idx >= session.balls.length) {
            // Todas as bolas emitidas — encerra o reveal
            clearInterval(session.timer!);
            activeSessions.delete(gameId);
            slowRevealSessionsActive.dec();
            console.log(`✅ [WS] Slow Reveal do jogo ${gameId} concluído.`);
            return;
        }

        const number    = session.balls[idx];
        const order     = idx + 1; // Sequence ID 1-based
        const timestamp = new Date().toISOString();

        io.to(room).emit('ball_drawn', {
            event:   'ball_drawn',
            game_id: parseInt(gameId, 10),
            payload: { order, number, timestamp },
        });

        slowRevealBallsTotal.inc();
        console.log(`🎱 [WS] Jogo ${gameId} — Bola #${order}: ${number}`);

        // Verifica se algum vencedor foi detectado nesta bola.
        // Winners são injetados por notifyWinners() após processAllGameWinners().
        if (session.winners.length > 0) {
            io.to(room).emit('winner_found', {
                event:   'winner_found',
                game_id: parseInt(gameId, 10),
                payload: {
                    winning_ball: number,
                    winners:      session.winners,
                },
            });
            console.log(`🏆 [WS] Jogo ${gameId} — ${session.winners.length} vencedor(es) notificados!`);
            session.winners = [];
        }

        session.currentIdx++;
    }, REVEAL_INTERVAL_MS);
}

/**
 * Injeta vencedores na sessão de reveal ativa.
 * Emitidos junto à próxima bola sorteada (iteração do timer).
 * Se o reveal já encerrou, emite diretamente para a room.
 */
export function notifyWinners(gameId: string, winners: WinnerPayload[]): void {
    const session = activeSessions.get(gameId);
    if (session) {
        session.winners = winners;
        console.log(
            `🏆 [WS] ${winners.length} vencedor(es) enfileirados para emissão no jogo ${gameId}`
        );
    } else {
        // Reveal já encerrou — emite diretamente
        io.to(`game:${gameId}`).emit('winner_found', {
            event:   'winner_found',
            game_id: parseInt(gameId, 10),
            payload: { winning_ball: null, winners },
        });
        console.log(
            `🏆 [WS] Jogo ${gameId} — vencedores emitidos diretamente (reveal já encerrado)`
        );
    }
}

/**
 * Emite game_locked para todos os clientes de um jogo.
 * Sinaliza que as vendas foram encerradas (FSM funding → locked).
 */
export function notifyGameLocked(gameId: string): void {
    io.to(`game:${gameId}`).emit('game_locked', {
        event:     'game_locked',
        game_id:   parseInt(gameId, 10),
        timestamp: new Date().toISOString(),
    });
    console.log(`🔒 [WS] game_locked emitido para jogo ${gameId}`);
}

/**
 * Emite game_aborted e encerra qualquer reveal ativo.
 * Decrementa slowRevealSessionsActive se havia sessão em andamento.
 * Sinaliza ao frontend para cancelar animações e exibir tela de estorno.
 */
export function notifyGameAborted(
    gameId: string,
    reason: 'ORACLE_TIMEOUT' | 'LOW_QUORUM' | 'ADMIN_HALT'
): void {
    const session = activeSessions.get(gameId);
    if (session?.timer) {
        clearInterval(session.timer);
        activeSessions.delete(gameId);
        slowRevealSessionsActive.dec();
    }

    io.to(`game:${gameId}`).emit('game_aborted', {
        event:   'game_aborted',
        game_id: parseInt(gameId, 10),
        payload: { reason },
    });
    console.log(`❌ [WS] game_aborted (${reason}) emitido para jogo ${gameId}`);
}

// ==========================================
// BOOTSTRAP
// ==========================================

/**
 * Inicia o servidor WebSocket na porta WS_PORT.
 * Chamado uma vez no bootstrap do worker (index.ts).
 */
export function startBroadcaster(): void {
    httpServer.listen(WS_PORT, () => {
        console.log(`✅ [WS] Broadcaster Socket.io escutando na porta ${WS_PORT}`);
    });
}
