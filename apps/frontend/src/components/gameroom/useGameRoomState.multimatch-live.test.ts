// Regressão crítica (game 1783983389827 + 1783976459268):
// jogador ENTROU NO INÍCIO e ficou até o fim (WS conectado durante toda a
// partida). Nesse cenário o reveal ao vivo popula drawnBalls (>0) e
// wsReceivedBalls=true → isStaticFinalState=false. O fix #278 só cobria o
// caso arquivado (isStaticFinalState=true); no cenário ao vivo a guarda
// `if (winners.length > 0 || !isStaticFinalState) return winners;` retornava
// [] ANTES de alcançar o branch MULTI_MATCH → banner "No winners" + cartelas
// NÃO promovidas à seção "Premiadas".
//
// Este teste simula EXATAMENTE esse cenário: drawnBalls não-vazio,
// wsReceivedBalls=true, winners (WS) VAZIO, mas prizeStatuses/clearedStages
// populados pelo WS stage_cleared/prize_confirmed → localWinners DEVE ter 4 estágios.
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import { useGameRoomState } from './useGameRoomState';

// Dados reais do game 1783976459268 (Mongo prizetxes)
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

// WinnerPayload[] vindo do WS stage_cleared (chega ANTES do prize_confirmed)
const CLEARED_STAGES = vi.hoisted(() => ([
  { stage: 1, winningBall: 12, winners: [{ ticket_id: '18276324948214237704', win_pattern: 'stage_1' } as any] },
  { stage: 3, winningBall: 40, winners: [{ ticket_id: '2055628893508463704', win_pattern: 'stage_3' } as any] },
  { stage: 4, winningBall: 55, winners: [{ ticket_id: '17707809192907540620', win_pattern: 'stage_4' } as any] },
  { stage: 5, winningBall: 70, winners: [{ ticket_id: '1218429636885625935', win_pattern: 'stage_5' } as any] },
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
  game_id: '1783976459268', status: 'drawing', drawn_balls: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25], room_id: '14',
  ticket_price: { quantity: '1.0000 BINGO', contract: 'bingogametkn' },
  gametype_id: '4', end_time: 0,
} as any;

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

function createSlowRevealLive(overrides: Record<string, unknown> = {}) {
  return {
    drawnBalls: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
    lastBall: { order: 25, number: 25, timestamp: 1 },
    isDrawing: false,
    winners: [],                 // WS winner_found NÃO popoca p/ MULTI_MATCH (vem em stage_cleared)
    isAborted: false, abortReason: null,
    wsStatus: 'connected',
    isGameEnded: true,           // reveal completo
    goldenBall: null,
    clearedStages: CLEARED_STAGES,
    drawMode: 'multimatch',
    prizeStatuses: STAGE_PRIZE_STATUSES,
    hydratePrizeStatuses: vi.fn(),
    wsEverConnected: true,
    wsReceivedBalls: true,       // <- distingue reveal ao vivo de jogo já encerrado
    goldenMultiplierProgress: null,
    ...overrides,
  };
}

describe('useGameRoomState — MULTI_MATCH cenário AO VIVO (entrou no início)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlowReveal.mockReturnValue(createSlowRevealLive());
    mockFetchGamePrizeTransactions.mockResolvedValue({ items: PRIZES, total: 4, gameId: '1783976459268' });
    mockFetchGamePatterns.mockResolvedValue([]);
  });

  // BUG 1783983389827: reveal ao vivo, winners WS vazio, prizeStatuses populado
  // → localWinners DEVE reconstruir 4 estágios (banner some + cartelas promovidas)
  it('reveal ao vivo: drawnBalls>0 + prizeStatuses WS → 4 estágios em localWinners', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    const patterns = result.current.localWinners.map(w => w.win_pattern).sort();
    expect(patterns).toEqual(['stage_1', 'stage_3', 'stage_4', 'stage_5']);
  });

  // BUG 1783983389827: cartelas vencedoras DEVEM ser promovidas à seção "Premiadas"
  // (winnerMap derivado de localWinners não pode ficar vazio no cenário ao vivo)
  it('reveal ao vivo: cartelas vencedoras promovidas (winnerMap não vazio)', async () => {
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    // winnerMap deve conter os 4 ticketIds vencedores
    const winnerKeys = Array.from((result.current as any).winnerMap?.keys?.() ?? []);
    expect(winnerKeys.length).toBe(4);
    for (const p of PRIZES) {
      expect(winnerKeys).toContain(p.ticketId);
    }
  });

  // Fallback clearedStages: prizeStatuses ainda vazio (prize_confirmed não chegou),
  // mas stage_cleared já enviou os vencedores → cartela promovida imediatamente
  it('reveal ao vivo: clearedStages sem prizeStatuses → cartela promovida via stage_cleared', async () => {
    mockSlowReveal.mockReturnValue(createSlowRevealLive({
      prizeStatuses: {},  // prize_confirmed ainda não chegou
    }));
    mockFetchGamePrizeTransactions.mockResolvedValue({ items: [], total: 0, gameId: '1783976459268' });
    const { result } = renderHook(() => useGameRoomState({ gameId: '1783976459268', roomId: '14', session }));
    await waitFor(() => expect(result.current.localWinners.length).toBe(4), { timeout: 5000 });
    const patterns = result.current.localWinners.map(w => w.win_pattern).sort();
    expect(patterns).toEqual(['stage_1', 'stage_3', 'stage_4', 'stage_5']);
  });
});
