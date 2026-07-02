import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { TicketCard } from './TicketCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

afterEach(() => cleanup());

const BASE_PROPS = {
  ticketId:  '1',
  matrix:    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  drawnSet:  new Set([1, 2, 3, 4, 5]),
  lastDrawn: null,
  winPattern: null as Set<number> | null,
  prize:     null as string | null,
  density:   'comfortable' as const,
  patterns:  [],
  completedCombinations: undefined,
  pricePaid: undefined,
};

// Grid: B[0..4]=[1,2,3,4,5] I[5..9]=[6,7,8,9,10] N=[11,12,null,13,14] G[14..18]=[15,16,17,18,19] O[19..23]=[20,21,22,23,24]
// Grid row 0: matrix[0]=1, matrix[5]=6, matrix[10]=11, matrix[14]=15, matrix[19]=20
// Value 11 is at grid index 2 (row 0, col 2 = N column)
// Pattern: cells 0 (B0=1) + 2 (N0=11)
const TWO_CELL_PATTERN = {
  name: 'B+N',
  prize: '10',
  weight: 1000,
  cells: [true, false, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
};

describe('TicketCard — golden winner', () => {
  it('aplica classe is-golden-winner quando goldenBallNum em winningCells', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1, 11])}
      winPattern={new Set([0, 2])}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={11}
      effectiveMultiplier={2}
    />);
    const article = screen.getByTestId('gr-ticket-1');
    expect(article.className).toContain('is-golden-winner');
    expect(article.className).toContain('is-winner');
  });

  it('exibe golden badge no header quando golden winner', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1, 11])}
      winPattern={new Set([0, 2])}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={11}
      effectiveMultiplier={2}
    />);
    const badge = screen.getByTestId('gr-ticket-golden-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('×2');
  });

  it('NAO aplica golden winner quando goldenBallNum nao esta em winningCells', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1, 11])}
      winPattern={new Set([0, 2])}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={55}
      effectiveMultiplier={5}
    />);
    const article = screen.getByTestId('gr-ticket-1');
    expect(article.className).not.toContain('is-golden-winner');
    expect(screen.queryByTestId('gr-ticket-golden-badge')).toBeNull();
  });

  it('NAO aplica golden winner quando ticket nao e winner', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1])}
      winPattern={null}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={11}
      effectiveMultiplier={2}
    />);
    const article = screen.getByTestId('gr-ticket-1');
    expect(article.className).not.toContain('is-winner');
    expect(article.className).not.toContain('is-golden-winner');
  });

  it('golden cell glow quando val === goldenBallNum na celula winning', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1, 11])}
      winPattern={new Set([0, 2])}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={11}
      effectiveMultiplier={2}
    />);
    // Value 11 at grid index 2 → tc-cell-2
    const cell = screen.getByTestId('tc-cell-2');
    expect(cell.className).toContain('is-golden-cell');
  });

  it('cell sem golden ball NÃO tem is-golden-cell', () => {
    render(<TicketCard
      {...BASE_PROPS}
      drawnSet={new Set([1, 11])}
      winPattern={new Set([0, 2])}
      patterns={[TWO_CELL_PATTERN]}
      goldenBallNum={11}
      effectiveMultiplier={2}
    />);
    // Value 1 at grid index 0 → not golden ball
    const cell = screen.getByTestId('tc-cell-0');
    expect(cell.className).not.toContain('is-golden-cell');
  });
});
