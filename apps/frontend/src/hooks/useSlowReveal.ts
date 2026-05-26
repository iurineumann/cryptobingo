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

export interface SlowRevealState {
    /** Bolas reveladas até agora, ordenadas por Sequence ID. */
    drawnBalls:      DrawnBall[];
    /** Última bola revelada (ou null antes do início). */
    lastBall:        DrawnBall | null;
    /** true enquanto o sorteio está em andamento. */
    isDrawing:       boolean;
    /** Vencedores detectados pelo evaluator (emitidos junto à bola vencedora). */
    winners:         WinnerPayload[];
    /** true se o jogo foi abortado (ORACLE_TIMEOUT, LOW_QUORUM, ADMIN_HALT). */
    isAborted:       boolean;
    /** Motivo do abort, se houver. */
    abortReason:     string | null;
    /** Status da conexão WebSocket. */
    wsStatus:        'connecting' | 'connected' | 'disconnected' | 'error';
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

    const [drawnBalls, setDrawnBalls] = useState<DrawnBall[]>([]);
    const [lastBall,   setLastBall]   = useState<DrawnBall | null>(null);
    const [isDrawing,  setIsDrawing]  = useState(false);
    const [winners,    setWinners]    = useState<WinnerPayload[]>([]);
    const [isAborted,  setIsAborted]  = useState(false);
    const [abortReason, setAbortReason] = useState<string | null>(null);
    const [wsStatus,   setWsStatus]   = useState<SlowRevealState['wsStatus']>('disconnected');

    // Reseta o estado quando muda de jogo
    const resetState = useCallback(() => {
        setDrawnBalls([]);
        setLastBall(null);
        setIsDrawing(false);
        setWinners([]);
        setIsAborted(false);
        setAbortReason(null);
        lastOrderRef.current = 0;
    }, []);

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
            socket.emit('subscribe', { game_id: parseInt(gameId, 10) });
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
            socket.emit('subscribe', { game_id: parseInt(gameId, 10) });
        });

        // ── ball_drawn: nova bola revelada ────────────────────────────────────
        socket.on('ball_drawn', (msg: {
            event:   string;
            game_id: number;
            payload: DrawnBall;
        }) => {
            if (String(msg.game_id) !== gameId) return; // Ignora eventos de outros jogos

            const { order, number, timestamp } = msg.payload;
            setIsDrawing(true);

            // Detecção de salto no Sequence ID → solicita reconciliação
            if (order > lastOrderRef.current + 1) {
                console.warn(
                    `[WS] Salto detectado: esperado order ${lastOrderRef.current + 1}, ` +
                    `recebido ${order}. Solicitando sync...`
                );
                socket.emit('sync', {
                    game_id:    parseInt(gameId, 10),
                    last_order: lastOrderRef.current,
                });
            }

            lastOrderRef.current = Math.max(lastOrderRef.current, order);

            const ball: DrawnBall = { order, number, timestamp };

            setDrawnBalls(prev => {
                // Insere na posição correta (idempotente — evita duplicatas por reconexão)
                const exists = prev.some(b => b.order === order);
                if (exists) return prev;
                const next = [...prev, ball].sort((a, b) => a.order - b.order);
                return next;
            });

            setLastBall(ball);
        });

        // ── sync_response: bolas faltantes após reconciliação ────────────────
        socket.on('sync_response', (msg: {
            game_id:    number;
            from_order: number;
            balls:      DrawnBall[];
        }) => {
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
                    msg.balls[msg.balls.length - 1].order
                );
            }
        });

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
    };
}
