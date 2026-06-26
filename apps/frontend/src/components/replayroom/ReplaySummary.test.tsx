// apps/frontend/src/components/replayroom/ReplaySummary.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import type { AggregateStats, Pattern } from '../../hooks/useReplay';
import ReplaySummary from './ReplaySummary';

const EMPTY_AGGREGATE: AggregateStats = {
  totalPlayers: 0,
  totalTicketsCount: 0,
  globalWinners: [],
  globalPatternWinCount: new Map(),
  globalCombinationWinCount: new Map(),
};

const MOCK_PATTERNS: Pattern[] = [
  { name: 'Linha Superior', cells: [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], prize: '5.0000' },
];

function renderSummary(props: Partial<React.ComponentProps<typeof ReplaySummary>> = {}) {
  return render(
    <ReplaySummary
      show={true}
      isComplete={true}
      totalBalls={10}
      winners={[]}
      winnerMap={new Map()}
      currencySymbol="WAX"
      aggregate={EMPTY_AGGREGATE}
      onRestart={vi.fn()}
      onLeave={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe('ReplaySummary', () => {
  it('renderiza título', () => {
    renderSummary();
    expect(screen.getByText(/replay_summary_title/)).toBeTruthy();
  });

  it('mostra contagem de bolas no subtitle', () => {
    renderSummary();
    expect(screen.getByText(/replay_summary_balls/)).toBeTruthy();
  });

  it('mostra winner info quando há vencedores', () => {
    const winnerMap = new Map<string, any>();
    winnerMap.set('1', { prize: '5.0000', patternName: 'Linha Superior', totalPrize: 5, patternCount: 1 });
    renderSummary({ winnerMap });
    expect(screen.getByText(/5.0000/)).toBeTruthy();
  });

  it('chama onLeave no botão back_to_lobby', () => {
    const onLeave = vi.fn();
    renderSummary({ onLeave });
    fireEvent.click(screen.getByText('replay.back_to_lobby'));
    expect(onLeave).toHaveBeenCalled();
  });

  it('chama onRestart no botão restart', () => {
    const onRestart = vi.fn();
    renderSummary({ onRestart });
    fireEvent.click(screen.getByText('replay.btn_restart'));
    expect(onRestart).toHaveBeenCalled();
  });

  it('não renderiza se show=false', () => {
    const { container } = renderSummary({ show: false });
    expect(container.innerHTML).toBe('');
  });

  it('mostra stats agregadas: total de jogadores e cartelas', () => {
    renderSummary({
      aggregate: {
        ...EMPTY_AGGREGATE,
        totalPlayers: 5,
        totalTicketsCount: 42,
      },
      winnerMap: new Map(),
    });
    expect(screen.getByText(/5/)).toBeTruthy();
    expect(screen.getByText(/42/)).toBeTruthy();
  });
});
