// Regressão crítica (game 1783983389827): cenário AO VIVO MULTI_MATCH.
// O usuario entrou no início, WS conectado, reveal popula drawnBalls>0.
// PR #278 só cobriu o caso ARQUIVADO (drawnBalls=[]). No ao vivo,
// a guarda `!isStaticFinalState` retornava [] cedo e o branch MULTI_MATCH
// (que le prizeStatuses/clearedStages) nunca rodava → banner "No winners"
// + cartelas vencedoras NÃO promovidas à secao "Premiadas".
//
// Este teste prova que, com drawnBalls>0 (ao vivo) mas prizeStatuses/
// clearedStages populados via WS, localWinners MULTI_MATCH reconstrói os
// 4 estágios (stage_1/3/4/5 = 2/6/8/16 BINGO).
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import { useGameRoomState } from './useGameRoomState';

const PRIZES = vi.hoisted(() => ([
  { ticketId: '18276324948214237704', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '2.0000', currency: 'BINGO', winLabel: 'stage_1', transactionId: 'tx1' },
  { ticketId: '2055628893508463704', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '6.0000', currency: 'BINGO', winLabel: 'stage_3', transactionId: 'tx2' },
  { ticketId: '17707809192907540620', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '8.0000', currency: 'BINGO', winLabel: 'stage_4', transactionId: 'tx3' },
  { ticketId: '1218429636885625935', gameId: '1783976459268', winType: 'stage', account: 'cworldcntrct', amount: '16.0000', currency: 'BINGO', winLabel: 'stage_5', transactionId: 'tx4' },
]));

const STAGE_PRIZE_STATUSES = vi.hoisted(() => ({
  '18276324948214237704:stage_1': { status: 'confirmed', tx_id: 'tx1', amount: '2.0000', currency: 'BINGO' },
  '2055628893508463704:stage_3': { status: 'confirmed', tx_id: 'tx2', amount: '6.0000', currency: 'BINGO' },
  '17707809192907540620:stage_4': { status: 'confirmed', tx_id: 'tx3', amount: '8.0000', currency: 'BINGO' },
  '1218429636885625935:stage_5': { status: 'confirmed', tx_id: 'tx4', amount: '16.0000', currency: 'BINGO' },
}));

// clearedStages (WS stage_cleared) — chega ANTES do prize_confirmed
const CLEARED_STAGES = vi.hoisted(() => ([
  { stage: 1, winners: [{ ticket_id: '18276324948214237704', win_pattern: 'stage_1' }], winningBall: 8 },
  { stage: 3, winners: [{ ticket_id: '2055628893508463704', win_pattern: 'stage_3' }], winningBall: 35 },
  { stage: 4, winners: [{ ticket_id: '17707809192907540620', win_pattern: 'stage_4' }], winningBall: 25 },
  { stage: 5, winners: [{ ticket_id: '1218429636885625935', win_pattern: 'stage_5' }], winningBall: 16 },
]));

const mockSlowReveal = vi.hoisted(() => vi.fn());
const mockFetchGamePrizeTransactions = vi.hoisted(() => vi.fn());
const mockFetchGamePatterns = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: mockSlowReveal,
}));

vi.mock('../../services/api', () => ({
  fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [], stages: [] }),
  fetchRoom: vi.fn().mockResolvedValue({
    room_id: '14', gametype_id: '4',
    metadata: { name: 'New MultiMacth 5' },
    current_game_id: '1783976459268',
  }),
  fetchGamePrizeTransactions: mockFetchGamePrizeTransactions,
}));

vi.mock('../ticketUtils', async (orig) => {
  const actual = await orig<typeof import('../ticketUtils')>();
  return { ...actual, fetchGamePatterns: mockFetchGamePatterns };
});

const M = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34,35, 46,47,48,49,50, 61,62,63,64,65];

const game = {
  game_id: '1783976459268', status: 'archived', drawn_balls: [], room_id: '14',
  ticket_price: { quantity: '1.0000 BINGO', contract: 'bingogametkn' },
  gametype_id: '4', end_time: 0,
};

const tickets = PRIZES.map((p) => ({
  ticket_id: p.ticketId, owner: 'cworldcntrct', matrix: M,
  price: { quantity: '1.0000 BINGO', contract: 'bingogametkn' },
}));

const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
  if (table === 'games') return { rows: [game], more: false };
  if (table === 'tickets') return { rows: tickets, more: false };
  if (table === 'gametypes') return {
    rows: [{ gametype_id: '4', name: 'MultiMatch 5 combinations', draw_mode: 'multimatch', max_balls: 0, stages: [], combinations: [] }],
    more: false,
  };
  return { rows: [], more: false };
});

const session: Session = {
  actor: 'cworldcntrct',
  client: { v1: { chain: { get_table_rows } } },
} as unknown as Session;

// Cenário AO VIVO: drawnBalls>0 (reveal populado), wsReceivedBalls=true,
// winners WS vazio (MULTI_MATCH emite estagios em stage_cleared, não winner_found),
// mas prizeStatuses (prize_confirmed) E clearedStages (stage_cleared) populados.
function createLiveReveal(overrides: Record<string, unknown> = {}) {
  return {
    drawnBalls: [{ order: 1, number: 8, timestamp: '' }, { order: 2, number: 14, timestamp: '' }],
    lastBall: { order: 2, number: 14, timestamp: '' },
    isDrawing: false, winners: [], isAborted: false, abortReason: null,
    wsStatus: 'connected', isGameEnded: true, goldenBall: null, clearedStages: CLEARED_STAGES,
    drawMode: 'multimatch', prizeStatuses: STAGE_PRIZE_STATUSES,
    hydratePrizeStatuses: vi.fn(), wsEverConnected: true, wsReceivedBalls: true,
    goldenMultiplierProgress: null,
    ...overrides,
  };
}

describe('useGameRoomState — MULTI_MATCH AO VIVO (drawnBalls>0, WS conectado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlowReveal.mockReturnValue(createLiveReveal());
    mockFetchGamePrizeTransactions.mockResolvedValue({ items: PRIZES, total: 4, gameId: '1783976459268' });
    mockFetchGamePatterns.mockResolvedValue([]);
  });

  // O bug #278 deixava passar porque o teste usava drawnBalls=[].
  // Aqui drawnBalls>0 → isStaticFinalState=false → PR #278 antigo retornava [].
  it('reconstrói 4 estágios de prizeStatuses mesmo com drawnBalls>0 (ao vivo)', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    const patterns = result.current.localWinners.map(w => w.win_pattern).sort();
    expect(patterns).toEqual(['stage_1', 'stage_3', 'stage_4', 'stage_5']);
  });

  // Fallback clearedStages: prizeStatuses vazio, mas stage_cleared já chegou.
  it('fallback clearedStages promove cartela antes do prize_confirmed', async () => {
    mockSlowReveal.mockReturnValue(createLiveReveal({ prizeStatuses: {} }));
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    const patterns = result.current.localWinners.map(w => w.win_pattern).sort();
    expect(patterns).toEqual(['stage_1', 'stage_3', 'stage_4', 'stage_5']);
  });
});
