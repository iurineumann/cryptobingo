// apps/frontend/src/hooks/useSlowReveal.ts
// Hook que gerencia a conexão WebSocket com o Broadcaster e
// o estado do Slow Reveal de um jogo específico.
//
// Funcionalidades:
//   - Conecta ao servidor Socket.io com JWT no handshake
//   - Entra automaticamente na room game:{gameId}
//   - Reconecta e reentra na room em caso de queda de conexão
//   - Mantém lista de bolas reveladas com Sequence ID
//   - Detecta saltos no Sequence ID e solicita reconciliação
//   - Expõe eventos de vencedores, game_locked e game_aborted
//
// Ref: ADR-007, asyncapi.yaml v1.1.0

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthToken } from '../services/api';
import type { WinnerPayload } from '../types/events';

const WS_URL = import.meta.env.VITE_WS_URL ?? '';

// ==========================================
// TIPOS
// ==========================================

export interface DrawnBall {
    order:     number;   // Sequence ID 1-based — chave de reconciliação
    number:    number;   // Valor da bola (1-75)
    timestamp: string;
}

/** ADR-014: informações da bola dourada (GOLDEN_BALL mode). */
export interface GoldenBallInfo {
    ballNum:    number;
    multiplier: number;
}

/** ADR-014: progresso da animação do multiplicador golden ball. */
export interface GoldenMultiplierProgress {
    multiplier: number;
    isFinal:    boolean;
}

/** ADR-013/014: estágio limpo no MULTI_MATCH. */
export interface ClearedStage {
    stage:   number;
    winners: WinnerPayload[];
}

/** Status de pagamento de um ticket, atualizado via prize_tx_sent / prize_confirmed. */
export interface PrizeStatus {
    status: 'preparing' | 'confirming' | 'confirmed';
    tx_id?: string;
    amount?: string;
}

export interface SlowRevealState {
    drawnBalls:      DrawnBall[];
    lastBall:        DrawnBall | null;
    isDrawing:       boolean;
    winners:         WinnerPayload[];
    isAborted:       boolean;
    abortReason:     string | null;
    wsStatus:        'connecting' | 'connected' | 'disconnected' | 'error';
    /** ADR-014: true após game_ended — jogador vê tela de resultado antes da próxima partida. */
    isGameEnded:     boolean;
    /** ADR-014/012: informação da bola dourada (GOLDEN_BALL mode). */
    goldenBall:      GoldenBallInfo | null;
    /** ADR-014: progresso da animação do multiplicador golden ball. */
    goldenMultiplierProgress: GoldenMultiplierProgress | null;
    /** ADR-013/014: estágios limpos acumulados (MULTI_MATCH mode). */
    clearedStages:   ClearedStage[];
    /** Draw mode do jogo, informado via game_ended. */
    drawMode:        string | null;
    /** Status de pagamento por ticket — atualizado via winner_found → prize_tx_sent → prize_confirmed. */
    prizeStatuses:   Record<string, PrizeStatus>;
}

// ==========================================
// HOOK
// ==========================================

/**
 * Conecta ao Broadcaster WebSocket e gerencia o estado do Slow Reveal.
 *
 * @param gameId - ID do jogo a observar. Null desconecta o socket.
 */
export function useSlowReveal(gameId: string | null): SlowRevealState {
    const socketRef  = useRef<Socket | null>(null);
    const lastOrderRef = useRef<number>(0); // Último Sequence ID recebido com sucesso

    const [drawnBalls,    setDrawnBalls]    = useState<DrawnBall[]>([]);
    const [lastBall,      setLastBall]      = useState<DrawnBall | null>(null);
    const [isDrawing,     setIsDrawing]     = useState(false);
    const [winners,       setWinners]       = useState<WinnerPayload[]>([]);
    const [isAborted,     setIsAborted]     = useState(false);
    const [abortReason,   setAbortReason]   = useState<string | null>(null);
    const [wsStatus,      setWsStatus]      = useState<SlowRevealState['wsStatus']>('disconnected');
    const [isGameEnded,   setIsGameEnded]   = useState(false);
    const [goldenBall,    setGoldenBall]    = useState<GoldenBallInfo | null>(null);
    const [goldenMultiplierProgress, setGoldenMultiplierProgress] = useState<GoldenMultiplierProgress | null>(null);
    const [clearedStages, setClearedStages] = useState<ClearedStage[]>([]);
    const [drawMode,      setDrawMode]      = useState<string | null>(null);
    const [prizeStatuses, setPrizeStatuses]  = useState<Record<string, PrizeStatus>>({});

    const resetState = useCallback(() => {
        setDrawnBalls([]);
        setLastBall(null);
        setIsDrawing(false);
        setWinners([]);
        setIsAborted(false);
        setAbortReason(null);
        setIsGameEnded(false);
        setGoldenBall(null);
        setGoldenMultiplierProgress(null);
        setClearedStages([]);
        setDrawMode(null);
        setPrizeStatuses({});
        lastOrderRef.current = 0;
    }, []);

    // ── ball_drawn handler extraído do useEffect (S2004) ─────────────────
    function handleBallDrawn(msg: {
        event:   string;
        game_id: number;
        payload: DrawnBall;
    }) {
        if (String(msg.game_id) !== gameId) return;

        const { order, number, timestamp } = msg.payload;
        setIsDrawing(true);

        if (order > lastOrderRef.current + 1) {
            console.warn(
                `[WS] Salto detectado: esperado order ${lastOrderRef.current + 1}, ` +
                `recebido ${order}. Solicitando sync...`
            );
            socketRef.current?.emit('sync', {
                game_id:    Number.parseInt(gameId, 10),
                last_order: lastOrderRef.current,
            });
        }

        lastOrderRef.current = Math.max(lastOrderRef.current, order);

        const ball: DrawnBall = { order, number, timestamp };

        setDrawnBalls(prev => {
            const exists = prev.some(b => b.order === order);
            if (exists) return prev;
            const next = [...prev, ball].sort((a, b) => a.order - b.order);
            return next;
        });

        setLastBall(ball);
    }

    // ── sync_response handler extraído do useEffect (S2004) ──────────────
    function handleSyncResponse(msg: {
        game_id:    number;
        from_order: number;
        balls:      DrawnBall[];
    }) {
        if (String(msg.game_id) !== gameId) return;

        console.log(
            `[WS] Reconciliação recebida: ${msg.balls.length} bola(s) ` +
            `(a partir do order ${msg.from_order})`
        );

        setDrawnBalls(prev => {
            const existing = new Set(prev.map(b => b.order));
            const newBalls = msg.balls.filter(b => !existing.has(b.order));
            if (newBalls.length === 0) return prev;
            return [...prev, ...newBalls].sort((a, b) => a.order - b.order);
        });

        if (msg.balls.length > 0) {
            lastOrderRef.current = Math.max(
                lastOrderRef.current,
                msg.balls.at(-1)!.order
            );
        }
    }

    useEffect(() => {
        // Sem gameId → desconecta e limpa
        if (!gameId) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            resetState();
            setWsStatus('disconnected');
            return;
        }

        resetState();
        setWsStatus('connecting');

        // ── Inicializa a conexão Socket.io ────────────────────────────────────
        // O JWT é enviado no handshake — validado pelo middleware do broadcaster.
        // Sem token: o servidor aceita a conexão em modo dev (sem JWT_SECRET).
        const socket = io(WS_URL, {
            auth:         { token: getAuthToken() ?? '' },
            transports:   ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay:    2_000,
            reconnectionAttempts: 10,
        });

        socketRef.current = socket;

        // ── Handlers de conexão ───────────────────────────────────────────────

        socket.on('connect', () => {
            setWsStatus('connected');
            console.log(`🔌 [WS] Conectado ao Broadcaster (jogo ${gameId})`);

            // Entra na room do jogo — o servidor envia o estado atual imediatamente
            socket.emit('subscribe', { game_id: Number.parseInt(gameId, 10) });
        });

        socket.on('disconnect', (reason) => {
            setWsStatus('disconnected');
            console.warn(`🔌 [WS] Desconectado: ${reason}`);
        });

        socket.on('connect_error', (err) => {
            setWsStatus('error');
            console.error('[WS] Erro de conexão:', err.message);
        });

        // ── Reconexão: resubscreve na room após reconexão ────────────────────
        socket.on('reconnect', () => {
            setWsStatus('connected');
            console.log('[WS] Reconectado. Resubscrevendo na room...');
            socket.emit('subscribe', { game_id: Number.parseInt(gameId, 10) });
        });

        // ── ball_drawn: delega p/ handleBallDrawn ───────────────────────────
        socket.on('ball_drawn', handleBallDrawn);

        // ── sync_response: delega p/ handleSyncResponse ─────────────────────
        socket.on('sync_response', handleSyncResponse);

        // ── winner_found: vencedores detectados pelo evaluator ────────────────
        socket.on('winner_found', (msg: {
            event:   string;
            game_id: number;
            payload: { winning_ball: number | null; winners: WinnerPayload[] };
        }) => {
            if (String(msg.game_id) !== gameId) return;

            console.log(
                `🏆 [WS] winner_found no jogo ${gameId}: ` +
                `${msg.payload.winners.length} vencedor(es)`
            );

            setWinners(msg.payload.winners);
            setIsDrawing(false);
            setPrizeStatuses(prev => {
                const next = { ...prev };
                for (const w of msg.payload.winners) {
                    if (!next[w.ticket_id]) {
                        next[w.ticket_id] = { status: 'preparing' };
                    }
                }
                return next;
            });
        });

        // ── game_locked: vendas encerradas ────────────────────────────────────
        socket.on('game_locked', (msg: { event: string; game_id: number }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`🔒 [WS] game_locked recebido para jogo ${gameId}`);
            // Lobby.tsx recarregará os dados da blockchain no próximo ciclo de polling
        });

        // ── game_aborted: sorteio cancelado (fail-safe) ───────────────────────
        socket.on('game_aborted', (msg: {
            event:   string;
            game_id: number;
            payload: { reason: string };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.warn(`❌ [WS] game_aborted (${msg.payload.reason}) no jogo ${gameId}`);
            setIsAborted(true);
            setAbortReason(msg.payload.reason);
            setIsDrawing(false);
        });

        // ── golden_ball: bola dourada anunciada (GOLDEN_BALL mode — ADR-012/014) ──
        socket.on('golden_ball', (msg: {
            event:   string;
            game_id: number;
            payload: { ball_num: number; multiplier: number };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`🌟 [WS] golden_ball: bola ${msg.payload.ball_num} ×${msg.payload.multiplier}`);
            setGoldenBall({ ballNum: msg.payload.ball_num, multiplier: msg.payload.multiplier });
        });

        // ── golden_multiplier_progress: animação do multiplicador golden ball ─
        socket.on('golden_multiplier_progress', (msg: {
            event:   string;
            game_id: number;
            payload: { multiplier: number; is_final: boolean };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`🌟 [WS] golden_multiplier_progress: ×${msg.payload.multiplier}${msg.payload.is_final ? ' (FINAL)' : ''}`);
            setGoldenMultiplierProgress({ multiplier: msg.payload.multiplier, isFinal: msg.payload.is_final });
        });

        // ── stage_cleared: estágio MULTI_MATCH limpo (ADR-013/014) ──────────
        socket.on('stage_cleared', (msg: {
            event:   string;
            game_id: number;
            payload: { stage: number; winners: WinnerPayload[] };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`🎯 [WS] stage_cleared: estágio ${msg.payload.stage}, ${msg.payload.winners.length} vencedor(es)`);
            setClearedStages(prev => [...prev, { stage: msg.payload.stage, winners: msg.payload.winners }]);
        });

        // ── prize_tx_sent: transação de prêmio enviada à blockchain ─────────
        socket.on('prize_tx_sent', (msg: {
            event:   string;
            game_id: number;
            payload: { ticketId: string };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`💸 [WS] prize_tx_sent: ticket ${msg.payload.ticketId}`);
            setPrizeStatuses(prev => ({
                ...prev,
                [msg.payload.ticketId]: { status: 'confirming' },
            }));
        });

        // ── prize_confirmed: prêmio confirmado no MongoDB ─────────────────
        socket.on('prize_confirmed', (msg: {
            event:   string;
            game_id: number;
            payload: { ticketId: string; transactionId: string; amount: string; currency: string };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`✅ [WS] prize_confirmed: ticket ${msg.payload.ticketId} (${msg.payload.amount} ${msg.payload.currency})`);
            setPrizeStatuses(prev => ({
                ...prev,
                [msg.payload.ticketId]: {
                    status: 'confirmed',
                    tx_id: msg.payload.transactionId,
                    amount: msg.payload.amount,
                },
            }));
        });

        // ── game_ended: reveal completo, próxima partida a caminho (ADR-014) ─
        socket.on('game_ended', (msg: {
            event:   string;
            game_id: number;
            payload: { draw_mode: string; total_winners: number };
        }) => {
            if (String(msg.game_id) !== gameId) return;
            console.log(`🏁 [WS] game_ended: modo ${msg.payload.draw_mode}, ${msg.payload.total_winners} vencedor(es)`);
            setIsGameEnded(true);
            setIsDrawing(false);
            setDrawMode(msg.payload.draw_mode);
        });

        // ── Cleanup: desconecta ao desmontar ou trocar de jogo ────────────────
        return () => {
            console.log(`[WS] Desconectando do jogo ${gameId}`);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [gameId, resetState]);

    return {
        drawnBalls,
        lastBall,
        isDrawing,
        winners,
        isAborted,
        abortReason,
        wsStatus,
        isGameEnded,
        goldenBall,
        goldenMultiplierProgress,
        clearedStages,
        drawMode,
        prizeStatuses,
    };
}
