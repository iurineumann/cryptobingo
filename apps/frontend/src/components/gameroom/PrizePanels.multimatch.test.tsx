// Regressão crítica (game 1783976459268): jogo MULTI_MATCH arquivado que
// PAGOU (32 BINGO, 4 prêmios p/ cworldcntrct na chain + Mongo + API)
// NÃO deve cair no banner "No winners this round".
//
// O hook useGameRoomState agora reconstrói localWinners de apiPrizes
// (fallback de prizeStatuses hidratado). Este teste prova que, uma vez
// que localWinners traz os vencedores, o PrizePanels NÃO mostra "No winners".
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PrizePanels from './PrizePanels';

const baseProps: any = {
  gameId: '1783976459268',
  hasBanners: true,
  goldenBall: null,
  goldenMultiplierProgress: null,
  clearedStages: [],
  isEffectiveGameEnded: true,
  isStaticFinalState: true,
  playerWinEntries: [],
  playerTickets: [{ id: '1' }, { id: '2' }],
  nextGame: null,
  nextGameTimer: '',
  game: null,
  room: null,
  now: Date.now(),
  onLeave: vi.fn(),
  localWinners: [] as any,
  t: (k: string) => k,
};

describe('PrizePanels — MULTI_MATCH arquivado pago NÃO é "No winners"', () => {
  it('mostra contagem de vencedores quando localWinners tem estágios', () => {
    const localWinners = [
      { ticket_id: '18276324948214237704', win_pattern: 'stage_1', payouts: ['2.0000 BINGO'] },
      { ticket_id: '2055628893508463704', win_pattern: 'stage_3', payouts: ['6.0000 BINGO'] },
      { ticket_id: '17707809192907540620', win_pattern: 'stage_4', payouts: ['8.0000 BINGO'] },
      { ticket_id: '1218429636885625935', win_pattern: 'stage_5', payouts: ['16.0000 BINGO'] },
    ];
    render(<PrizePanels {...baseProps} localWinners={localWinners} />);
    // NÃO deve aparecer "No winners this round"
    expect(screen.queryByText('game_room.game_ended_no_winners')).toBeNull();
    // Deve aparecer o texto de vencedores (game_room.game_ended_winners)
    expect(screen.getByText('game_room.game_ended_winners')).toBeTruthy();
  });

  it('mostra "No winners" apenas quando localWinners está vazio', () => {
    render(<PrizePanels {...baseProps} localWinners={[]} />);
    expect(screen.getByText('game_room.game_ended_no_winners')).toBeTruthy();
  });
});
