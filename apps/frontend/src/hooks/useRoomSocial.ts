// apps/frontend/src/hooks/useRoomSocial.ts
// Presença + reações ao vivo (efêmeras) via namespace /chat.
// Conexão própria — o backend conta presença por WALLET, então coexistir
// com o socket do useChat não infla a contagem.
import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthToken } from '../services/api';

const API_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '';
const WS_URL  = import.meta.env.VITE_WS_URL || API_URL;
const REACTION_TTL_MS = 4_000;

export interface FloatingReaction { id: string; wallet: string; emoji: string; }
export interface UseRoomSocialReturn {
  onlineCount: number;
  reactions: FloatingReaction[];
  sendReaction: (emoji: string) => void;
}

export function useRoomSocial({ roomId }: { roomId: string }): UseRoomSocialReturn {
  const [onlineCount, setOnlineCount] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    // Sem token (ex.: ambiente de teste/sem sessão) não abrimos socket.
    if (!token || !roomId) return;
    const s = io(`${WS_URL}/chat`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => s.emit('chat:join', { roomId }));
    s.on('presence:update', (p: { roomId: string; online: number }) => {
      if (p.roomId === roomId) setOnlineCount(p.online);
    });
    s.on('reaction:new', (r: { wallet: string; emoji: string }) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setReactions(prev => [...prev, { id, wallet: r.wallet, emoji: r.emoji }]);
      // Reação some após a animação flutuar (efêmera).
      const tmr = setTimeout(() => setReactions(prev => prev.filter(x => x.id !== id)), REACTION_TTL_MS);
      timers.current.push(tmr);
    });

    return () => {
      s.emit('chat:leave', { roomId });
      s.disconnect();
      socketRef.current = null;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [roomId]);

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit('reaction:send', { roomId, emoji });
  }, [roomId]);

  return { onlineCount, reactions, sendReaction };
}
