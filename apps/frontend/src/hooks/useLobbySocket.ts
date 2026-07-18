// apps/frontend/src/hooks/useLobbySocket.ts
// Escuta eventos de jogo via Socket.io para atualizar status do lobby em tempo real.
// O polling do Lobby continua como fallback — push só acelera a atualização entre polls.
// Ref: ADR/issue #403
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthToken } from '../services/api';
import { WS_BASE } from '@/config/env';

type GameStatus = 'funding' | 'locked' | 'aborted' | 'drawing' | 'drawn';

interface PushEvent {
    event: string;
    game_id: number;
}

export function useLobbySocket(gameIds: string[]): { statuses: Record<string, string> } {
    const [statuses, setStatuses] = useState<Record<string, string>>({});
    const socketRef = useRef<Socket | null>(null);
    const gameIdsRef = useRef<string[]>([]);

    useEffect(() => {
        gameIdsRef.current = gameIds;
        const token = getAuthToken();

        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        const socket = io(WS_BASE, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 2_000,
            reconnectionAttempts: 10,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            gameIdsRef.current.forEach(gameId => {
                socket.emit('subscribe', { game_id: Number(gameId) });
            });
        });

        socket.on('reconnect', () => {
            gameIdsRef.current.forEach(gameId => {
                socket.emit('subscribe', { game_id: Number(gameId) });
            });
        });

        const handleStatus = (eventType: GameStatus) => (msg: PushEvent) => {
            const gid = String(msg.game_id);
            setStatuses(prev => ({ ...prev, [gid]: eventType }));
        };

        socket.on('game_funded', handleStatus('funding'));
        socket.on('game_locked', handleStatus('locked'));
        socket.on('game_aborted', handleStatus('aborted'));
        socket.on('drawing_started', handleStatus('drawing'));

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [gameIds]);

    return { statuses };
}
