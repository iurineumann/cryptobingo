// apps/frontend/src/components/replayroom/ReplayPatternsPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import type { Pattern, CombinationRuleInput } from '../ticketUtils';
import ReplayPatternsPanel from './ReplayPatternsPanel';

const MOCK_PATTERNS: Pattern[] = [
  { name: 'Linha Superior', cells: [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], prize: '5.0000' },
  { name: 'Xis', cells: [1,0,0,0,1,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0,1,0,0,0,1], prize: '10.0000' },
];

const MOCK_COMBOS: CombinationRuleInput[] = [
  { name: 'Dupla', clauses: [], weight: 200 },
];

function renderPanel(props: Partial<React.ComponentProps<typeof ReplayPatternsPanel>> = {}) {
  return render(
    <ReplayPatternsPanel
      show={true}
      patterns={MOCK_PATTERNS}
      sortedPatterns={MOCK_PATTERNS}
      combinations={[]}
      winners={[]}
      patternWinCount={new Map()}
      combinationWinCount={new Map()}
      currencySymbol="WAX"
      onClose={vi.fn()}
      patternsRef={{ current: null }}
      {...props}
    />,
  );
}

describe('ReplayPatternsPanel', () => {
  it('renderiza heading', () => {
    renderPanel();
    expect(screen.getByText(/patterns_heading/)).toBeTruthy();
  });

  it('renderiza padrões', () => {
    renderPanel();
    expect(screen.getByText('Linha Superior')).toBeTruthy();
    expect(screen.getByText('Xis')).toBeTruthy();
  });

  it('mostra vazio se patterns vazio', () => {
    renderPanel({ patterns: [], sortedPatterns: [] });
    expect(screen.getByText(/patterns_empty/)).toBeTruthy();
  });

  it('mostra combinações quando existem', () => {
    renderPanel({ combinations: MOCK_COMBOS });
    expect(screen.getByText('Dupla')).toBeTruthy();
  });

  it('não renderiza se show=false', () => {
    const { container } = renderPanel({ show: false });
    expect(container.innerHTML).toBe('');
  });

  it('chama onClose no botão fechar', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    const closeBtn = screen.getByRole('button', { name: /hide_aria/ });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
