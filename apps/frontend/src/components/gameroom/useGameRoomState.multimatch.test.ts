// Regressão crítica (game 1783976459268): o hook useGameRoomState
// DEVE reconstrur localWinners de apiPrizes (fallback de prizeStatuses
// hidratado) para jogos MULTI_MATCH arquivados — caso contrário o
// banner "No winners this round" aparece mesmo com o jogo já pago.
//
// Evidência real: chain total_paid=320000 (32 BINGO), Mongo prizetxes
// tem 4 docs p/ cworldcntrct, API /games/1783976459268/prizes retorna
// 4 prêmios. O frontend mostrava "No winners" porque localWinners
// MULTI_MATCH dependia 100% de prizeStatuses hidratado.
import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import { useGameRoomState } from './useGameRoomState';

const PRIZES = vi.hoisted(() => ([
  { ticketId: '18276324948214237704', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '2.0000', currency: 'BINGO', winLabel: 'stage_1', transactionId: 'tx1' },
  { ticketId: '2055628893508463704', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '6.0000', currency: 'BINGO', winLabel: 'stage_3', transactionId: 'tx2' },
  { ticketId: '17707809192907540620', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '8.0000', currency: 'BINGO', winLabel: 'stage_4', transactionId: 'tx3' },
  { ticketId: '1218429636885625935', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '16.0000', currency: 'BINGO', winLabel: 'stage_5', transactionId: 'tx4' },
]));

vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: () => ({
    drawnBalls: [], lastBall: null, isDrawing: false, winners: [],
    isAborted: false, abortReason: null, wsStatus: 'connected',
    isGameEnded: false, goldenBall: null, clearedStages: [], drawMode: 'multimatch',
    prizeStatuses: {},
    hydratePrizeStatuses: vi.fn(),
  }),
}));

vi.mock('../../services/api', () => ({
  fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [], stages: [] }),
  fetchRoom: vi.fn().mockResolvedValue({ room_id: '14', gametype_id: '4', metadata: { name: 'New MultiMacth 5' }, current_game_id: '1783976459268' }),
  fetchGamePrizeTransactions: vi.fn().mockResolvedValue({ items: PRIZES, total: 4, gameId: '1783976459268' }),
}));

vi.mock('../ticketUtils', async (orig) => {
  const actual = await orig<typeof import('../ticketUtils')>();
  return { ...actual, fetchGamePatterns: vi.fn().mockResolvedValue([]) };
});

const M = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34,35, 46,47,48,49,50, 61,62,63,64,65];

const game = {
  game_id: '1783976459268', status: 'archived', drawn_balls: [], room_id: '14',
  ticket_price: { quantity: '1.0000 BINGO', contract: 'bingogametkn' }, gametype_id: '4', end_time: 0,
};
const tickets = PRIZES.map((p) => ({
  ticket_id: p.ticketId, owner: 'cworldcntrct', matrix: M,
  price: { quantity: '1.0000 BINGO', contract: 'bingogametkn' },
}));
const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
  if (table === 'games') return { rows: [game], more: false };
  if (table === 'tickets') return { rows: tickets, more: false };
  if (table === 'gametypes') return { rows: [{ gametype_id: '4', name: 'MultiMatch 5 combinations', draw_mode: 'multimatch', max_balls: 0, stages: [], combinations: [] }], more: false };
  return { rows: [], more: false };
});
// session ESTÁVEL (criado 1x fora da factory) para evitar loop de setState.
const session: Session = { actor: 'cworldcntrct', client: { v1: { chain: { get_table_rows } } } } as unknown as Session;

describe('useGameRoomState — MULTI_MATCH arquivado reconstrói vencedores de apiPrizes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('localWinners tem 4 estágios (NÃO "No winners")', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    const patterns = result.current.localWinners.map(w => w.win_pattern).sort();
    expect(patterns).toEqual(['stage_1', 'stage_3', 'stage_4', 'stage_5']);
    // apiPrizes também populado (fallback fonte de verdade)
    expect(result.current.apiPrizes.length).toBe(4);
  });
});
