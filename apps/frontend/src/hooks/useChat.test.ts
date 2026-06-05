import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChat } from './useChat';

// ── Mock socket.io-client ─────────────────────────────────────────────────────

interface MockSocket {
    on:         ReturnType<typeof vi.fn>;
    emit:       ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    _trigger:   (event: string, payload?: unknown) => void;
}

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => {
        mockSocket = {
            on:         vi.fn(),
            emit:       vi.fn(),
            disconnect: vi.fn(),
            _trigger(event: string, payload?: unknown) {
                const calls = (this.on as ReturnType<typeof vi.fn>).mock.calls as [string, (p: unknown) => void][];
                for (const [ev, cb] of calls) {
                    if (ev === event) cb(payload);
                }
            },
        };
        return mockSocket;
    }),
}));

import { io } from 'socket.io-client';
const mockIo = io as ReturnType<typeof vi.fn>;

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

    it('começa com loading=true', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        expect(result.current.loading).toBe(true);
    });

    it('emite chat:join após connect e seta loading=false', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { roomId: ROOM });
        expect(result.current.loading).toBe(false);
    });
});

// ── 2. Recebimento de mensagens ───────────────────────────────────────────────

describe('recebimento de mensagens', () => {
    it('chat:messages substitui o array de mensagens', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        const history = [makeMsg({ id: 'h1' }), makeMsg({ id: 'h2' })];
        act(() => { mockSocket._trigger('chat:messages', history); });
        expect(result.current.messages).toEqual(history);
    });

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

    it('múltiplos chat:message acumulam na ordem correta', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => {
            mockSocket._trigger('chat:message', makeMsg({ id: 'a' }));
            mockSocket._trigger('chat:message', makeMsg({ id: 'b' }));
            mockSocket._trigger('chat:message', makeMsg({ id: 'c' }));
        });
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
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

    it('não emite para string com apenas espaços', () => {
        const { result } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        act(() => { mockSocket._trigger('connect'); });
        act(() => { result.current.sendMessage('   '); });
        const sendCalls = mockSocket.emit.mock.calls.filter(([ev]) => ev === 'chat:send');
        expect(sendCalls).toHaveLength(0);
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
    it('emite chat:leave e desconecta ao desmontar', () => {
        const { unmount } = renderHook(() => useChat({ roomId: ROOM, walletAddress: WALLET }));
        unmount();
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { roomId: ROOM });
        expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('reconecta ao mudar roomId (cleanup da sala anterior)', () => {
        const { rerender } = renderHook(
            ({ roomId }: { roomId: string }) => useChat({ roomId, walletAddress: WALLET }),
            { initialProps: { roomId: 'sala-1' } },
        );
        const firstSocket = mockSocket;
        rerender({ roomId: 'sala-2' });
        expect(firstSocket.emit).toHaveBeenCalledWith('chat:leave', { roomId: 'sala-1' });
        expect(firstSocket.disconnect).toHaveBeenCalled();
        expect(mockIo).toHaveBeenCalledTimes(2);
    });
});
