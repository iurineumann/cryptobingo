import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChat, __resetChatCache } from './useChat';

// ── Mock getAuthToken ──────────────────────────────────────────────────────────
vi.mock('../services/api', () => ({
    getAuthToken: vi.fn(() => 'test-token'),
}));

// ── Mock socket.io-client ─────────────────────────────────────────────────────

interface MockSocket {
    on:         ReturnType<typeof vi.fn>;
    emit:       ReturnType<typeof vi.fn>;
    connected:  boolean;
    _trigger:   (event: string, payload?: unknown) => void;
}

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => {
        const s: MockSocket = {
            on:        vi.fn(),
            emit:      vi.fn(),
            connected: true,
            _trigger(event: string, payload?: unknown) {
                const calls = (this.on as ReturnType<typeof vi.fn>).mock.calls as [string, (p: unknown) => void][];
                for (const [ev, cb] of calls) { if (ev === event) cb(payload); }
            },
        };
        mockSocket = s;
        return s;
    }),
}));

import { io } from 'socket.io-client';
const mockIo = io as ReturnType<typeof vi.fn>;

// ── Mock fetch ────────────────────────────────────────────────────────────────
let fetchResolve: (v: unknown) => void;
const mockFetch = vi.fn(() => new Promise(r => { fetchResolve = r; }));
vi.stubGlobal('fetch', mockFetch);

// ─────────────────────────────────────────────────────────────────────────────

const ROOM   = 'room-1';
const WALLET = 'player1.wam';

function makeMsg(override: Partial<{
    id: string; wallet_address: string; message: string;
    message_type: 'user' | 'system_draw' | 'system_drop' | 'system_status';
    mentions: string[]; timestamp: string;
}> = {}) {
    return {
        id:             'msg-1',
        wallet_address: WALLET,
        message:        'Olá!',
        message_type:   'user' as const,
        mentions:       [],
        timestamp:      new Date().toISOString(),
        ...override,
    };
}

function resolveHistory(messages = [makeMsg()], hasMore = false) {
    fetchResolve?.({ ok: true, json: () => Promise.resolve({ messages, hasMore }) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    __resetChatCache();
    mockFetch.mockImplementation(() => new Promise(r => { fetchResolve = r; }));
});

// ── 1. Conexão WS ────────────────────────────────────────────────────────────

describe('conexão WS', () => {
    it('conecta ao namespace /chat com auth token', () => {
        renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(mockIo).toHaveBeenCalledWith(
            expect.stringContaining('/chat'),
            expect.objectContaining({ auth: { token: 'test-token' } }),
        );
    });

    it('emite chat:join após connect', () => {
        renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { roomId: ROOM });
    });

    it('emite chat:leave ao desmontar', () => {
        const { unmount } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        unmount();
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { roomId: ROOM });
    });
});

// ── 2. Fetch histórico ────────────────────────────────────────────────────────

describe('fetch histórico', () => {
    it('começa com loading=true na primeira montagem', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(result.current.loading).toBe(true);
    });

    it('chama GET /rooms/:roomId/chat com auth header', async () => {
        renderHook(() => useChat({ roomId: 'room-fetch', walletAddress: WALLET }));
        await act(async () => { resolveHistory([]); });
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/rooms/room-fetch/chat'),
            expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
        );
    });

    it('popula messages após fetch bem-sucedido', async () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        await act(async () => { resolveHistory([makeMsg({ id: 'm1' })]); });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].id).toBe('m1');
    });

    it('usa cache na segunda montagem sem chamar fetch', async () => {
        const { unmount } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        await act(async () => { resolveHistory([makeMsg({ id: 'cached' })]); });
        unmount();
        mockFetch.mockClear();

        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.current.messages[0].id).toBe('cached');
    });
});

// ── 3. Recebimento de mensagens via WS ───────────────────────────────────────

describe('recebimento de mensagens via WS', () => {
    it('chat:message acrescenta ao array', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'ws-1' })); });
        expect(result.current.messages.some(m => m.id === 'ws-1')).toBe(true);
    });

    it('não duplica mensagem com mesmo id', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'dup' })); });
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'dup' })); });
        expect(result.current.messages.filter(m => m.id === 'dup')).toHaveLength(1);
    });

    it('preserva message_type system_draw', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'd1', message_type: 'system_draw' })); });
        const msg = result.current.messages.find(m => m.id === 'd1');
        expect(msg?.message_type).toBe('system_draw');
    });

    it('preserva mentions no payload', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'm2', mentions: ['abc1.wam'] })); });
        const msg = result.current.messages.find(m => m.id === 'm2');
        expect(msg?.mentions).toContain('abc1.wam');
    });
});

// ── 4. sendMessage ────────────────────────────────────────────────────────────

describe('sendMessage', () => {
    it('emite chat:send com roomId e mensagem', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        act(() => { result.current.sendMessage('Boa sorte!'); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', { roomId: ROOM, message: 'Boa sorte!' });
    });

    it('faz trim antes de enviar', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { result.current.sendMessage('  Olá  '); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', { roomId: ROOM, message: 'Olá' });
    });

    it('ignora mensagem vazia', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { result.current.sendMessage('   '); });
        expect(mockSocket.emit).not.toHaveBeenCalledWith('chat:send', expect.anything());
    });
});

// ── 5. loadMore ───────────────────────────────────────────────────────────────

describe('loadMore', () => {
    it('chama fetch com parâmetro before', async () => {
        const old = makeMsg({ id: 'old-1', timestamp: '2024-01-01T00:00:00.000Z' });
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        await act(async () => { resolveHistory([old], true); });

        mockFetch.mockImplementation(() => new Promise(r => { fetchResolve = r; }));
        act(() => { result.current.loadMore(); });

        const url = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
        expect(url).toContain('before=');
    });
});

// ── 6. Unread + resetUnread ───────────────────────────────────────────────────

describe('unread', () => {
    it('resetUnread zera contador', async () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        await act(async () => { resolveHistory([]); });
        act(() => { result.current.resetUnread(); });
        expect(result.current.unread).toBe(0);
    });
});
