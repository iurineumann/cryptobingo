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
    disconnect: ReturnType<typeof vi.fn>;
    _trigger:   (event: string, payload?: unknown) => void;
    connected:  boolean;
}

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => {
        const s: MockSocket = {
            on:         vi.fn(),
            emit:       vi.fn(),
            disconnect: vi.fn(),
            connected:  true,
            _trigger(event: string, payload?: unknown) {
                const calls = (this.on as ReturnType<typeof vi.fn>).mock.calls as [string, (p: unknown) => void][];
                for (const [ev, cb] of calls) {
                    if (ev === event) cb(payload);
                }
            },
        };
        mockSocket = s;
        return s;
    }),
}));

import { io } from 'socket.io-client';
const mockIo = io as ReturnType<typeof vi.fn>;

// ── Mock fetch (hang para loading tests) ───────────────────────────────────────

let fetchResolve: (v: unknown) => void;
const mockFetch = vi.fn(() => new Promise(r => { fetchResolve = r; }));

vi.stubGlobal('fetch', mockFetch);

// ─────────────────────────────────────────────────────────────────────────────

const ROOM   = 'room-1';
const WALLET = 'player1.wam';

function makeMsg(override: Partial<{
    id: string; wallet_address: string; message: string; is_sponsor_drop: boolean; timestamp: string;
}> = {}) {
    return {
        id:              'msg-1',
        wallet_address:  WALLET,
        message:         'Olá!',
        is_sponsor_drop: false,
        timestamp:       new Date().toISOString(),
        ...override,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    __resetChatCache();
    // Resolve any hanging fetch from previous test
    fetchResolve?.({ ok: true, json: () => Promise.resolve({ messages: [], hasMore: false }) });
});

// ── 1. Conexão ────────────────────────────────────────────────────────────────

describe('conexão', () => {
    it('conecta ao namespace /chat com auth wallet', () => {
        renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(mockIo).toHaveBeenCalledWith(
            expect.stringContaining('/chat'),
            expect.objectContaining({ auth: { wallet: WALLET } }),
        );
    });

    it('começa com loading=true (primeira montagem)', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(result.current.loading).toBe(true);
    });

    it('emite chat:join após connect', () => {
        renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { roomId: ROOM });
    });

    it('fetch histórico com auth header na primeira montagem', async () => {
        renderHook(() => useChat({ roomId: 'room-fetch-test', walletAddress: WALLET }));
        // fetch was called during render (effect). let it resolve
        await act(async () => {
            fetchResolve?.({ ok: true, json: () => Promise.resolve({ messages: [], hasMore: false }) });
        });
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/rooms/room-fetch-test/chat'),
            expect.objectContaining({
                headers: { Authorization: 'Bearer test-token' },
            }),
        );
    });
});

// ── 2. Recebimento de mensagens ───────────────────────────────────────────────

describe('recebimento de mensagens', () => {
    it('chat:message acrescenta ao array', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('chat:message', makeMsg({ id: 'new-1' })); });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].id).toBe('new-1');
    });

    it('chat:sponsor_drop acrescenta mensagem com is_sponsor_drop=true', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        const drop = makeMsg({ id: 'drop-1', is_sponsor_drop: true });
        act(() => { mockSocket._trigger('chat:sponsor_drop', drop); });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].is_sponsor_drop).toBe(true);
    });
});

// ── 3. Envio ──────────────────────────────────────────────────────────────────

describe('sendMessage', () => {
    it('emite chat:send com roomId e mensagem', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        act(() => { result.current.sendMessage('Boa sorte!'); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', { roomId: ROOM, message: 'Boa sorte!' });
    });

    it('faz trim antes de enviar', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        act(() => { result.current.sendMessage('  Olá  '); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', { roomId: ROOM, message: 'Olá' });
    });
});

// ── 4. Cleanup no unmount ─────────────────────────────────────────────────────

describe('cleanup no unmount', () => {
    it('emite chat:leave e salva cache no unmount', () => {
        const { unmount } = renderHook(() => useChat({ roomId: 'room-unmount', walletAddress: WALLET }));
        const socket = mockSocket;
        act(() => { socket._trigger('connect'); });
        unmount();
        expect(socket.emit).toHaveBeenCalledWith('chat:leave', { roomId: 'room-unmount' });
    });

    it('reconecta ao mudar roomId', () => {
        const { rerender } = renderHook(
            ({ roomId }: { roomId: string }) => useChat({ roomId, walletAddress: WALLET }),
            { initialProps: { roomId: 'sala-1' } },
        );
        const firstSocket = mockSocket;
        rerender({ roomId: 'sala-2' });
        expect(firstSocket.emit).toHaveBeenCalledWith('chat:leave', { roomId: 'sala-1' });
        expect(mockIo).toHaveBeenCalledTimes(2);
    });
});
