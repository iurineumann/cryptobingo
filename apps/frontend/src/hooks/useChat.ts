import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
    id:              string;
    wallet_address:  string;
    message:         string;
    is_sponsor_drop: boolean;
    timestamp:       string;
}

interface UseChatOptions {
    roomId:        string;
    walletAddress: string;
}

interface UseChatReturn {
    messages:    ChatMessage[];
    loading:     boolean;
    sendMessage: (text: string) => void;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:8080';

export function useChat({ roomId, walletAddress }: UseChatOptions): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [socket,   setSocket]   = useState<Socket | null>(null);

    useEffect(() => {
        const s = io(`${WS_URL}/chat`, {
            auth:       { wallet: walletAddress },
            transports: ['websocket'],
        });

        s.on('connect', () => {
            s.emit('chat:join', { roomId });
            setLoading(false);
        });

        s.on('chat:messages', (msgs: ChatMessage[]) => {
            setMessages(msgs);
        });

        s.on('chat:message', (msg: ChatMessage) => {
            setMessages(prev => [...prev, msg]);
        });

        s.on('chat:sponsor_drop', (msg: ChatMessage) => {
            setMessages(prev => [...prev, msg]);
        });

        setSocket(s);

        return () => {
            s.emit('chat:leave', { roomId });
            s.disconnect();
        };
    }, [roomId, walletAddress]);

    const sendMessage = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed || !socket) return;
        socket.emit('chat:send', { roomId, message: trimmed });
    }, [socket, roomId]);

    return { messages, loading, sendMessage };
}
