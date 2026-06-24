// apps/frontend/src/components/gameroom/MatchStats.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import MatchStats from './MatchStats';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
afterEach(() => cleanup());

describe('MatchStats', () => {
  it('mostra pote, bolas e bônus quando há dados', () => {
    render(<MatchStats totalWagered="100.0000 WAX" sponsorPool={[{ quantity: '50.0000 WAX' }]} drawnCount={12} maxBalls={75} />);
    expect(screen.getByTestId('gr-match-stats')).toBeTruthy();
    expect(screen.getByTestId('gr-pot').textContent).toContain('100.0000 WAX');
    expect(screen.getByText('12/75')).toBeTruthy();
    expect(screen.getByText(/50.0000 WAX/)).toBeTruthy();
  });

  it('omite o bônus quando sponsorPool vazio', () => {
    render(<MatchStats totalWagered="10.0000 WAX" sponsorPool={[]} drawnCount={0} maxBalls={75} />);
    expect(screen.queryByText('game_room.pot_bonus')).toBeNull();
  });

  it('renderiza null quando não há nada a mostrar', () => {
    const { container } = render(<MatchStats totalWagered="" sponsorPool={[]} drawnCount={0} maxBalls={75} />);
    expect(container.querySelector('[data-testid="gr-match-stats"]')).toBeNull();
  });
});
