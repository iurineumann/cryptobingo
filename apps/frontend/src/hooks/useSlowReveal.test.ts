// useSlowReveal.test.ts
// Cobre: gameId=null desconecta; gameId='1' conecta e subscreve;
// connect→wsStatus; ball_drawn deduplicação; salto→sync emit;
// outro game_id ignorado; winner_found; game_ended; golden_ball; stage_cleared; unmount desconecta.

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';

// ── Mock socket.io-client ────────────────────────────────────────────────────

type SocketHandler = (...args: any[]) => void;

const socketMocks = vi.hoisted(() => {
  const handlers = new Map<string, SocketHandler>();
  const mockSocket = {
    on:         vi.fn((event: string, fn: SocketHandler) => { handlers.set(event, fn); }),
    emit:       vi.fn(),
    disconnect: vi.fn(),
    off:        vi.fn(),
    handlers,
  };
  const io = vi.fn(() => mockSocket);
  return { io, mockSocket, handlers };
});

vi.mock('socket.io-client', () => ({ io: socketMocks.io }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => 'mock-jwt') }));

import { useSlowReveal } from './useSlowReveal';

function emit(event: string, payload: unknown) {
  const handler = socketMocks.handlers.get(event);
  if (handler) handler(payload);
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  socketMocks.handlers.clear();
});

// ── Testes ───────────────────────────────────────────────────────────────────

describe('useSlowReveal — gameId nulo', () => {
  it('gameId=null → io NÃO chamado, wsStatus=disconnected', () => {
    const { result } = renderHook(() => useSlowReveal(null));
    expect(socketMocks.io).not.toHaveBeenCalled();
    expect(result.current.wsStatus).toBe('disconnected');
  });
});

describe('useSlowReveal — conexão', () => {
  it('gameId="1" → io chamado; emit subscribe com game_id=1', () => {
    renderHook(() => useSlowReveal('1'));
    expect(socketMocks.io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: 'mock-jwt' } }),
    );
    // Simula connect
    act(() => emit('connect', undefined));
    expect(socketMocks.mockSocket.emit).toHaveBeenCalledWith('subscribe', { game_id: 1 });
  });

  it('evento connect → wsStatus="connected"', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    expect(result.current.wsStatus).toBe('connected');
  });

  it('evento disconnect → wsStatus="disconnected"', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('disconnect', 'transport close'));
    expect(result.current.wsStatus).toBe('disconnected');
  });
});

describe('useSlowReveal — ball_drawn', () => {
  it('ball_drawn order=1 → drawnBalls.length=1, lastBall.number correto, isDrawing=true', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('ball_drawn', {
      game_id: 1,
      payload: { order: 1, number: 42, timestamp: '2026-01-01T00:00:00Z' },
    }));
    expect(result.current.drawnBalls).toHaveLength(1);
    expect(result.current.lastBall?.number).toBe(42);
    expect(result.current.isDrawing).toBe(true);
  });

  it('bola duplicada (mesmo order) → deduplicada', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('ball_drawn', { game_id: 1, payload: { order: 1, number: 7, timestamp: '' } }));
    act(() => emit('ball_drawn', { game_id: 1, payload: { order: 1, number: 7, timestamp: '' } }));
    expect(result.current.drawnBalls).toHaveLength(1);
  });

  it('salto de order (3 quando last=1) → emit sync com last_order=1', () => {
    renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('ball_drawn', { game_id: 1, payload: { order: 1, number: 10, timestamp: '' } }));
    act(() => emit('ball_drawn', { game_id: 1, payload: { order: 3, number: 30, timestamp: '' } }));
    expect(socketMocks.mockSocket.emit).toHaveBeenCalledWith('sync', {
      game_id:    1,
      last_order: 1,
    });
  });

  it('evento de outro game_id ignorado', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('ball_drawn', {
      game_id: 99,  // outro jogo
      payload: { order: 1, number: 55, timestamp: '' },
    }));
    expect(result.current.drawnBalls).toHaveLength(0);
  });
});

describe('useSlowReveal — eventos de fim de jogo', () => {
  it('winner_found → winners.length correto, isDrawing=false', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('winner_found', {
      game_id: 1,
      payload: { winning_ball: 42, winners: [
        { account: 'a', ticket_id: '1', win_pattern: 'ROW_0', payouts: ['5.0000 BINGO'] },
        { account: 'b', ticket_id: '2', win_pattern: 'COL_B', payouts: ['3.0000 BINGO'] },
      ]},
    }));
    expect(result.current.winners).toHaveLength(2);
    expect(result.current.isDrawing).toBe(false);
  });

  it('game_ended → isGameEnded=true, drawMode correto', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('game_ended', {
      game_id: 1,
      payload: { draw_mode: 'goldenball', total_winners: 1 },
    }));
    expect(result.current.isGameEnded).toBe(true);
    expect(result.current.drawMode).toBe('goldenball');
  });

  it('golden_multiplier_progress → goldenMultiplierProgress preenchido', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('golden_multiplier_progress', {
      game_id: 1,
      payload: { multiplier: 5, is_final: false },
    }));
    expect(result.current.goldenMultiplierProgress).toEqual({ multiplier: 5, isFinal: false });
  });

  it('golden_multiplier_progress isFinal=true → goldenMultiplierProgress.isFinal true', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('golden_multiplier_progress', {
      game_id: 1,
      payload: { multiplier: 50, is_final: true },
    }));
    expect(result.current.goldenMultiplierProgress?.isFinal).toBe(true);
    expect(result.current.goldenMultiplierProgress?.multiplier).toBe(50);
  });

  it('golden_ball → goldenBall preenchido com ballNum e multiplier', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('golden_ball', {
      game_id: 1,
      payload: { ball_num: 33, multiplier: 5 },
    }));
    expect(result.current.goldenBall).toEqual({ ballNum: 33, multiplier: 5 });
  });

  it('stage_cleared → clearedStages acumula', () => {
    const { result } = renderHook(() => useSlowReveal('1'));
    act(() => emit('connect', undefined));
    act(() => emit('stage_cleared', { game_id: 1, payload: { stage: 1, winners: [] } }));
    act(() => emit('stage_cleared', { game_id: 1, payload: { stage: 2, winners: [] } }));
    expect(result.current.clearedStages).toHaveLength(2);
  });
});

describe('useSlowReveal — unmount', () => {
  it('unmount → socket.disconnect chamado', () => {
    const { unmount } = renderHook(() => useSlowReveal('1'));
    unmount();
    expect(socketMocks.mockSocket.disconnect).toHaveBeenCalled();
  });
});
