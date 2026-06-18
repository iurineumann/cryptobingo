import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthToken } from '../services/api';

export type MessageType = 'user' | 'system_draw' | 'system_drop' | 'system_status';

export interface ChatMessage {
    id:             string;
    wallet_address: string;
    message:        string;
    message_type:   MessageType;
    mentions:       string[];
    timestamp:      string;
}

interface UseChatOptions {
    roomId:        string;
    walletAddress: string;
}

interface UseChatReturn {
    messages:    ChatMessage[];
    loading:     boolean;
    hasMore:     boolean;
    sendMessage: (text: string) => void;
    loadMore:    () => void;
    unread:      number;
    resetUnread: () => void;
}

const API_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '';
const WS_URL  = import.meta.env.VITE_WS_URL ?? API_URL;

// ── Cache e sockets persistentes entre montagens ─────────────────
const messageCache = new Map<string, ChatMessage[]>();
const wsSockets    = new Map<string, Socket>();

// Testing only
export function __resetChatCache() { messageCache.clear(); wsSockets.clear(); }

export function useChat({ roomId, walletAddress }: UseChatOptions): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>(() => messageCache.get(roomId) ?? []);
    const [loading,  setLoading]  = useState(() => !messageCache.has(roomId));
    const [hasMore,  setHasMore]  = useState(true);
    const [unread,   setUnread]   = useState(0);
    const loadingRef = useRef(false);
    const roomRef    = useRef(roomId);
    roomRef.current  = roomId;

    // ── REST: fetch histórico ────────────────────────────────────
    const fetchPage = useCallback(async (before?: string) => {
        if (loadingRef.current) return;
        const token = getAuthToken();
        if (!token) return;
        loadingRef.current = true;
        if (!before) setLoading(true);

        try {
            const params = new URLSearchParams({ limit: '30' });
            if (before) params.set('before', before);

            const res = await fetch(`${API_URL}/api/v1/rooms/${roomId}/chat?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data: { messages: ChatMessage[]; hasMore: boolean } = await res.json();

            setMessages(prev => {
                if (!before) return data.messages;
                const existing = new Set(prev.map(m => m.id));
                const newMsgs  = data.messages.filter(m => !existing.has(m.id));
                return [...newMsgs, ...prev];
            });
            setHasMore(data.hasMore);
        } catch {
            // silencia erro de rede
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, [roomId]);

    // Cache hit → pula fetchPage inicial
    useEffect(() => {
        if (!messageCache.has(roomId)) {
            fetchPage();
        } else {
            setLoading(false);
        }
    }, [roomId, fetchPage]);

    // ── WS: tempo real ───────────────────────────────────────────
    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;

        const existing = wsSockets.get(roomId);
        if (existing?.connected) {
            existing.emit('chat:join', { roomId });
            return;
        }

        const s = io(`${WS_URL}/chat`, {
            auth:       { token },
            transports: ['websocket'],
        });

        s.on('connect', () => s.emit('chat:join', { roomId }));

        s.on('chat:message', (msg: ChatMessage) => {
            setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        });

        wsSockets.set(roomId, s);

        return () => {
            s.emit('chat:leave', { roomId });
        };
    }, [roomId, walletAddress]);

    // ── Salva no cache ao desmontar ──────────────────────────────
    const cacheRef = useRef(messages);
    cacheRef.current = messages;
    useEffect(() => {
        return () => {
            messageCache.set(roomId, cacheRef.current);
        };
    }, [roomId]);

    const sendMessage = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const s = wsSockets.get(roomId);
        if (s?.connected) s.emit('chat:send', { roomId, message: trimmed });
    }, [roomId]);

    const loadMore = useCallback(() => {
        if (loadingRef.current || messages.length === 0) return;
        const oldest = [...messages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )[0];
        const before = new Date(new Date(oldest.timestamp).getTime() - 1).toISOString();
        fetchPage(before);
    }, [messages, fetchPage]);

    const resetUnread = useCallback(() => setUnread(0), []);

    // ── Incrementa unread a cada mensagem nova ───────────────────
    const prevLenRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevLenRef.current) {
            setUnread(n => n + (messages.length - prevLenRef.current));
        }
        prevLenRef.current = messages.length;
    }, [messages.length]);

    return { messages, loading, hasMore, sendMessage, loadMore, unread, resetUnread };
}
