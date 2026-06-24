// Regressão crítica: o hook deve carregar SOMENTE as cartelas do jogador logado.
// Antes do fix, fetchAllTickets (scope=gameId) trazia cartelas de TODOS os jogadores
// e setPlayerTickets não filtrava por owner → cartelas misturadas entre contas.
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import { useGameRoomState } from './useGameRoomState';

vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: () => ({
    drawnBalls: [], lastBall: null, isDrawing: false, winners: [],
    isAborted: false, abortReason: null, wsStatus: 'connected',
    isGameEnded: false, goldenBall: null, clearedStages: [], drawMode: 'standard',
  }),
}));

vi.mock('../../services/api', () => ({
  fetchGamePatterns: vi.fn().mockResolvedValue([]),
  fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [] }),
  fetchRoom: vi.fn().mockResolvedValue({ room_id: '1', metadata: { name: 'Sala' }, current_game_id: '0' }),
}));

const M = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34, 46,47,48,49,50, 61,62,63,64,65];

// Tabela tickets do escopo gameId: 2 cartelas do player1, 1 do player2.
function makeSession(actor = 'player1'): Session {
  const game = {
    game_id: '100', status: 'funding', drawn_balls: [], room_id: '0',
    ticket_price: { quantity: '1.0000 WAX', contract: 'eosio.token' }, gametype_id: '0', end_time: 0,
  };
  const tickets = [
    { ticket_id: '1', owner: 'player1', matrix: M, price: { quantity: '5.0000 WAX', contract: 'eosio.token' } },
    { ticket_id: '2', owner: 'player2', matrix: M, price: { quantity: '5.0000 WAX', contract: 'eosio.token' } },
    { ticket_id: '3', owner: 'player1', matrix: M, price: { quantity: '5.0000 WAX', contract: 'eosio.token' } },
  ];
  const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
    if (table === 'games') return { rows: [game], more: false };
    if (table === 'tickets') return { rows: tickets, more: false };
    return { rows: [], more: false };
  });
  return { actor, client: { v1: { chain: { get_table_rows } } } } as unknown as Session;
}

describe('useGameRoomState — isolamento de cartelas por jogador', () => {
  beforeEach(() => vi.clearAllMocks());

  it('carrega apenas as cartelas do jogador logado (não as de outros)', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '100', roomId: undefined, session: makeSession('player1') }));
    await waitFor(() => expect(result.current.playerTickets.length).toBeGreaterThan(0));
    const ids = result.current.playerTickets.map(t => t.id).sort();
    expect(ids).toEqual(['1', '3']);            // só player1
    expect(ids).not.toContain('2');             // cartela do player2 NÃO aparece
  });

  it('outro jogador vê apenas as próprias cartelas', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '100', roomId: undefined, session: makeSession('player2') }));
    await waitFor(() => expect(result.current.playerTickets.length).toBeGreaterThan(0));
    expect(result.current.playerTickets.map(t => t.id)).toEqual(['2']);
  });
});
