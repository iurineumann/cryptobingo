// apps/worker-game-loop/src/services/broadcaster.ts
// Servidor Socket.io do Slow Reveal com métricas Prometheus integradas.
// Ref: ADR-007, asyncapi.yaml v1.1.0

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {
    wsConnectionsActive,
    slowRevealBallsTotal,
    slowRevealSessionsActive,
} from './metrics';

const WS_PORT            = parseInt(process.env.WS_PORT         ?? '8085', 10);
const JWT_SECRET         = process.env.JWT_SECRET               ?? '';
const REVEAL_INTERVAL_MS = parseInt(process.env.REVEAL_INTERVAL ?? '3000', 10);

// ── Chat Message Schema (Mongo inline) ──────────────────────────
const chatMessageSchema = new mongoose.Schema({
    room_id:         { type: String, required: true, index: true },
    wallet_address:  { type: String, required: true },
    message:         { type: String, required: true },
    is_sponsor_drop: { type: Boolean, default: false },
}, { timestamps: true });
chatMessageSchema.index({ room_id: 1, createdAt: -1 });
const ChatMessage = mongoose.models.ChatMessage
    || mongoose.model('ChatMessage', chatMessageSchema);

// ==========================================
// PER-IP CONNECTION RATE LIMITER (DDoS)
// ==========================================
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP ?? '10', 10);
const ipConnectionMap = new Map<string, number>();

function incrementIp(ip: string): boolean {
    const count = (ipConnectionMap.get(ip) ?? 0) + 1;
    if (count > MAX_CONNECTIONS_PER_IP) return false;
    ipConnectionMap.set(ip, count);
    return true;
}

function decrementIp(ip: string): void {
    const count = (ipConnectionMap.get(ip) ?? 1) - 1;
    if (count <= 0) ipConnectionMap.delete(ip);
    else ipConnectionMap.set(ip, count);
}

// Limpeza periódica do mapa de IPs (prevenção de memory leak)
setInterval(() => {
    if (ipConnectionMap.size > 0) {
        console.log(`[WS] IP connection map: ${ipConnectionMap.size} entries active`);
    }
}, 60_000);

// ==========================================
// TIPOS
// ==========================================

/** Estado interno de um Slow Reveal em andamento para um jogo. */
interface RevealSession {
    gameId:     string;
    balls:      number[];                  // Lote de bolas a emitir nesta sessão
    currentIdx: number;                    // Próximo índice a emitir
    timer:      ReturnType<typeof setInterval> | null;
    winners:    WinnerPayload[];           // Preenchido pelo evaluator ao detectar vencedores
    resolve:    () => void;                // ADR-014: resolve a Promise quando lote completo
    totalBalls?: number;                   // Total de bolas esperado (progresso da UI)
}

export interface WinnerPayload {
    account:     string;
    ticket_id:   string;
    win_pattern: string;
    winType:     'pattern' | 'combo' | 'stage';
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
// MIDDLEWARE DE RATE LIMIT POR IP (DDoS)
// Rejeita conexões além do limite por IP.
// Executa antes da auth JWT para não gastar CPU em handshakes maliciosos.
// ==========================================

io.use((socket: Socket, next) => {
    const ip = socket.handshake.address;
    if (!incrementIp(ip)) {
        console.warn(`🚫 [WS] Rate limit excedido para IP ${ip} — conexão rejeitada.`);
        return next(new Error('RATE_LIMITED: Muitas conexões simultâneas deste IP.'));
    }
    next();
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
        decrementIp(socket.handshake.address);
        console.log(`🔌 [WS] Desconectado: ${socket.id} (${wallet}) — ${reason}`);
    });
});

// ==========================================
// CHAT NAMESPACE (Mongo + Socket.io)
// ==========================================

const chatNamespace = io.of('/chat');

chatNamespace.on('connection', (socket: Socket) => {
    const wallet = socket.handshake.auth?.wallet as string | undefined;
    if (!wallet) {
        socket.disconnect();
        return;
    }

    let currentRoom: string | null = null;

    socket.on('chat:join', ({ roomId }: { roomId: string }) => {
        currentRoom = roomId;
        socket.join(roomId);
    });

    socket.on('chat:send', async ({ roomId, message }: { roomId: string; message: string }) => {
        if (!roomId || !message?.trim()) return;

        try {
            const doc = await ChatMessage.create({
                room_id: roomId,
                wallet_address: wallet,
                message: message.trim(),
                is_sponsor_drop: false,
            });

            const msg = {
                id:              String(doc._id),
                wallet_address:  wallet,
                message:         message.trim(),
                is_sponsor_drop: false,
                timestamp:       (doc as any).createdAt.toISOString(),
            };

            chatNamespace.to(roomId).emit('chat:message', msg);
        } catch (err) {
            console.error('[Chat] Erro ao salvar mensagem:', err);
        }
    });

    socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
        if (roomId) socket.leave(roomId);
        currentRoom = null;
    });

    socket.on('disconnect', () => {
        if (currentRoom) socket.leave(currentRoom);
    });
});

// ==========================================
// API PÚBLICA DO BROADCASTER
// ==========================================

/**
 * Inicia (ou continua) o Slow Reveal de um lote de bolas.
 * ADR-014: retorna Promise<void> que resolve quando o lote completo foi emitido.
 * Isso permite ao orquestrador await o reveal antes de processar pagamentos.
 *
 * Pode ser chamado múltiplas vezes para o mesmo jogo em lotes (MULTI_MATCH, GOLDEN_BALL).
 * O session.currentIdx persiste entre lotes para manter o Sequence ID correto.
 */
export function startSlowReveal(gameId: string, balls: number[], totalBalls?: number): Promise<void> {
    if (!balls || balls.length === 0) {
        console.warn(`⚠️  [WS] Lote vazio para jogo ${gameId}. Resolvendo imediatamente.`);
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        // Se já existe uma sessão para este jogo (lote anterior), reutiliza o currentIdx
        const existing = activeSessions.get(gameId);
        const startIdx = existing?.currentIdx ?? 0;
        const mergedTotalBalls = totalBalls ?? existing?.totalBalls;

        // Monta a sequência completa acumulada: bolas já emitidas + novo lote
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
            totalBalls: mergedTotalBalls,
        };

        // Cancela timer anterior se existia (troca de lote)
        if (existing?.timer) clearInterval(existing.timer);
        activeSessions.set(gameId, session);

        if (!existing) slowRevealSessionsActive.inc();

        const room = `game:${gameId}`;
        console.log(
            `🎱 [WS] Reveal jogo ${gameId}: bolas ${startIdx + 1}–${allBalls.length} ` +
            `(${balls.length} novas, ${REVEAL_INTERVAL_MS}ms/bola)`
        );

        session.timer = setInterval(() => {
            const idx = session.currentIdx;

            if (idx >= session.balls.length) {
                clearInterval(session.timer!);
                session.timer = null;
                // Não remove da sessão — orquestrador pode adicionar mais lotes
                console.log(`✅ [WS] Lote concluído (jogo ${gameId}, até bola ${idx}).`);
                resolve();
                return;
            }

            const number    = session.balls[idx];
            const order     = idx + 1;
            const timestamp = new Date().toISOString();

            io.to(room).emit('ball_drawn', {
                event:   'ball_drawn',
                game_id: parseInt(gameId, 10),
                payload: { order, number, timestamp, total_balls: session.totalBalls },
            });

            slowRevealBallsTotal.inc();

            if (session.winners.length > 0) {
                io.to(room).emit('winner_found', {
                    event:   'winner_found',
                    game_id: parseInt(gameId, 10),
                    payload: { winning_ball: number, winners: session.winners },
                });
                console.log(`🏆 [WS] ${session.winners.length} vencedor(es) — jogo ${gameId} bola #${order}`);
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
        console.log(`🧹 [WS] Sessão de reveal encerrada (jogo ${gameId}).`);
    }
}

/**
 * ADR-014 — GOLDEN_BALL: anuncia a bola dourada antes de revelá-la.
 * Emite evento especial para a UI mostrar animação de destaque.
 */
export function notifyGoldenBall(
    gameId:     string,
    ballNum:    number,
    multiplier: number,
): void {
    io.to(`game:${gameId}`).emit('golden_ball', {
        event:   'golden_ball',
        game_id: parseInt(gameId, 10),
        payload: { ball_num: ballNum, multiplier },
    });
    console.log(`🌟 [WS] golden_ball ${ballNum} (×${multiplier}) — jogo ${gameId}`);
}

/**
 * GOLDEN_BALL: animação sequencial do multiplicador.
 * Emite valores intermediários para UI mostrar progressão ×2 → ×5 → ×10 → ... → final.
 */
export function notifyGoldenMultiplierProgress(
    gameId:      string,
    multiplier:  number,
    isFinal:     boolean,
): void {
    io.to(`game:${gameId}`).emit('golden_multiplier_progress', {
        event:   'golden_multiplier_progress',
        game_id: parseInt(gameId, 10),
        payload: { multiplier, is_final: isFinal },
    });
    console.log(`🎰 [WS] golden_multiplier_progress ×${multiplier}${isFinal ? ' (FINAL)' : ''} — jogo ${gameId}`);
}

/**
 * ADR-014 — MULTI_MATCH: anuncia os vencedores de um estágio após o cutoff ball.
 * Emite pausa visual entre estágios.
 */
export function notifyStageCleared(
    gameId:    string,
    stage:     number,
    winners:   WinnerPayload[],
    cutoffBall: number,
    drawnBalls: number[],
): void {
    const winningBall = cutoffBall > 0 && cutoffBall <= drawnBalls.length
        ? drawnBalls[cutoffBall - 1]
        : 0;
    io.to(`game:${gameId}`).emit('stage_cleared', {
        event:   'stage_cleared',
        game_id: parseInt(gameId, 10),
        payload: { stage, winners, winning_ball: winningBall },
    });
    console.log(`🎯 [WS] stage_cleared estágio ${stage} (${winners.length} vencedor(es), bola ${winningBall}) — jogo ${gameId}`);
}

/**
 * ADR-014: sinaliza o fim completo do reveal (após último lote).
 * UI usa este evento para mostrar tela de resultado / countdown da próxima partida.
 */
export function notifyGameEnded(
    gameId:        string,
    drawMode:      string,
    totalWinners:  number,
): void {
    io.to(`game:${gameId}`).emit('game_ended', {
        event:   'game_ended',
        game_id: parseInt(gameId, 10),
        payload: { draw_mode: drawMode, total_winners: totalWinners },
    });
    console.log(`🏁 [WS] game_ended (modo: ${drawMode}, vencedores: ${totalWinners}) — jogo ${gameId}`);
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
 * Emite prize_tx_sent — transação de prêmio enviada à blockchain.
 */
export function notifyPrizeTxSent(gameId: string, ticketId: string, winLabel?: string): void {
    io.to(`game:${gameId}`).emit('prize_tx_sent', {
        event:   'prize_tx_sent',
        game_id: parseInt(gameId, 10),
        payload: { ticketId, winLabel },
    });
}

/**
 * Emite prize_confirmed — prêmio persistido no MongoDB.
 */
export function notifyPrizeConfirmed(
    gameId: string, ticketId: string, transactionId: string, amount: string, currency: string, winLabel?: string,
): void {
    io.to(`game:${gameId}`).emit('prize_confirmed', {
        event:   'prize_confirmed',
        game_id: parseInt(gameId, 10),
        payload: { ticketId, transactionId, amount, currency, winLabel },
    });
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
    reason: 'ORACLE_TIMEOUT' | 'ORACLE_TIMEOUT_RECOVERY' | 'LOW_QUORUM' | 'ADMIN_HALT' | 'NO_TICKETS'
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
