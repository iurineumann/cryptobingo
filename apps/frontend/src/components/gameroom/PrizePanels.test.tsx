// Testes de premiações do jogador vs sala — PrizePanels (Task 3 Fase 3)
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import PrizePanels from './PrizePanels';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode }) => <button>{p.children}</button> }));
afterEach(() => cleanup());

const baseProps = {
  hasBanners: true, goldenBall: null, clearedStages: [],
  isEffectiveGameEnded: true, isStaticFinalState: false,
  playerWinEntries: [{ name: 'Linha', total: 1.5, currency: 'WAX', isCombination: false, precision: 4 }],
  localWinners: [
    { ticket_id: '1', win_pattern: 'Linha', payouts: ['1.5000 WAX'] },
    { ticket_id: '2', win_pattern: 'Linha', payouts: ['2.0000 WAX'] },
  ],
  playerTickets: [{ id: '1', matrix: [] }],
  nextGame: null, nextGameTimer: '', game: null, room: null, now: Date.now(),
  onLeave: vi.fn(),
};

describe('PrizePanels — prêmios jogador vs sala', () => {
  it('mostra premiações da sala (total + nº vencedores)', () => {
    render(<PrizePanels {...baseProps} />);
    const room = screen.getByTestId('gr-room-prizes');
    // sala pagou 3.5000 WAX a 2 vencedores
    expect(room.textContent).toContain('3.5000');
    expect(room.textContent).toContain('2');
  });

  it('não mostra premiações da sala quando não há vencedores', () => {
    render(<PrizePanels {...baseProps} playerWinEntries={[]} localWinners={[]} />);
    expect(screen.queryByTestId('gr-room-prizes')).toBeNull();
  });

  it('formata premios multi-currency corretamente no share text', () => {
    render(<PrizePanels {...baseProps} playerWinEntries={[
      { name: 'ROW_0', total: 10.0, currency: 'WAX', isCombination: false, precision: 4 },
      { name: 'Combo 3x', total: 5.0, currency: 'BINGO', isCombination: true, precision: 4 },
    ]} />);
    // O breakdown total deve mostrar "10.0000 WAX + 5.0000 BINGO"
    const total = screen.getByTestId('gr-prize-breakdown');
    expect(total.textContent).toContain('10.0000 WAX');
    expect(total.textContent).toContain('5.0000 BINGO');
  });
});
