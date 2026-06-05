// TicketCard.test.tsx — componente de cartela 5×5
// Cobre: células, FREE SPACE, marcação, just-hit, padrão vencedor, is-close, pricePaid

import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TicketCard } from './TicketCard';
import type { Pattern } from './ticketUtils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => {
    if (opts) return `${k}:${JSON.stringify(opts)}`;
    return k;
  }}),
}));

// Matriz canônica de 24 números (sem FREE SPACE — o componente insere null na posição [2][2])
// B:1-5  I:16-20  N:31-34  G:46-50  O:61-65
const TEST_MATRIX = [
  1, 2, 3, 4, 5,
  16, 17, 18, 19, 20,
  31, 32, 33, 34,
  46, 47, 48, 49, 50,
  61, 62, 63, 64, 65,
];

const NO_PATTERNS: Pattern[] = [];

function renderCard(overrides: Partial<Parameters<typeof TicketCard>[0]> = {}) {
  return render(
    <TicketCard
      ticketId="42"
      matrix={TEST_MATRIX}
      drawnSet={new Set()}
      lastDrawn={null}
      winPattern={null}
      prize={null}
      density="comfortable"
      patterns={NO_PATTERNS}
      {...overrides}
    />,
  );
}

describe('TicketCard — estrutura básica', () => {
  it('renderiza 25 células (24 números + FREE SPACE)', () => {
    renderCard();
    // gridcell role = células individuais
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(25);
  });

  it('FREE SPACE exibe ⭐ na posição [2][2] (índice 12)', () => {
    renderCard();
    const cells = screen.getAllByRole('gridcell');
    expect(cells[12].textContent).toBe('⭐');
    expect(cells[12]).toHaveClass('is-free');
  });

  it('cabeçalhos B/I/N/G/O presentes', () => {
    renderCard();
    ['B', 'I', 'N', 'G', 'O'].forEach(col => {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument();
    });
  });

  it('aria-label do artigo contém o ticketId', () => {
    renderCard({ ticketId: '99' });
    const article = screen.getByRole('article');
    expect(article.getAttribute('aria-label')).toContain('99');
  });
});

describe('TicketCard — marcação de células', () => {
  it('número sorteado recebe is-marked e aria-selected=true', () => {
    renderCard({ drawnSet: new Set([1]) });
    const cells = screen.getAllByRole('gridcell');
    // célula 0 = B[0] = 1
    expect(cells[0]).toHaveClass('is-marked');
    expect(cells[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('número não sorteado NÃO recebe is-marked', () => {
    renderCard({ drawnSet: new Set([99]) }); // 99 não está na matrix
    const cells = screen.getAllByRole('gridcell');
    const numberCells = cells.filter((_, i) => i !== 12); // exclui FREE SPACE
    numberCells.forEach(c => expect(c).not.toHaveClass('is-marked'));
  });

  it('lastDrawn corresponde → is-just-hit', () => {
    renderCard({ drawnSet: new Set([16]), lastDrawn: 16 });
    const cells = screen.getAllByRole('gridcell');
    // I[0] = 16 → posição coluna 1, linha 0 → índice 1 no grid row-major
    const justHitCell = cells.find(c => c.textContent === '16');
    expect(justHitCell).toHaveClass('is-just-hit');
  });

  it('FREE SPACE aparece como marcado mesmo sem drawnSet', () => {
    renderCard();
    const cells = screen.getAllByRole('gridcell');
    expect(cells[12]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('TicketCard — estados de vitória e proximidade', () => {
  it('winPattern satisfeito → artigo com is-winner', () => {
    // ROW_0: células 0,1,2,3,4
    const winPatternSet = new Set([0, 1, 2, 3, 4]);
    renderCard({ winPattern: winPatternSet, drawnSet: new Set([1, 2, 3, 4, 5]) });
    expect(screen.getByRole('article')).toHaveClass('is-winner');
  });

  it('sem vitória + markedCount >= 18 → is-close', () => {
    // Marca 17 números (+ FREE SPACE implícita = 18)
    const drawn = new Set(TEST_MATRIX.slice(0, 17));
    renderCard({ drawnSet: drawn });
    expect(screen.getByRole('article')).toHaveClass('is-close');
  });

  it('poucas células marcadas → is-dimmed (não é winner nem is-close)', () => {
    renderCard({ drawnSet: new Set([1]) }); // 1 marcada + FREE = 2
    const article = screen.getByRole('article');
    expect(article).toHaveClass('is-dimmed');
    expect(article).not.toHaveClass('is-winner');
    expect(article).not.toHaveClass('is-close');
  });
});

describe('TicketCard — prize e pricePaid', () => {
  it('prize exibido no rodapé quando fornecido', () => {
    renderCard({ prize: '5.0000 BINGO' });
    expect(screen.getByText('5.0000 BINGO')).toBeInTheDocument();
  });

  it('prize com is-winner recebe classe is-paid', () => {
    const winPatternSet = new Set([0, 1, 2, 3, 4]);
    const { container } = renderCard({
      prize: '5.0000 BINGO',
      winPattern: winPatternSet,
      drawnSet: new Set([1, 2, 3, 4, 5]),
    });
    expect(container.querySelector('.prize.is-paid')).toBeInTheDocument();
  });

  it('pricePaid exibido quando fornecido', () => {
    renderCard({ pricePaid: '2.5000 BINGO' });
    expect(screen.getByText('2.5000 BINGO')).toBeInTheDocument();
    expect(document.querySelector('.ticket-price-paid')).toBeInTheDocument();
  });

  it('pricePaid ausente → .ticket-price-paid não renderizado', () => {
    renderCard();
    expect(document.querySelector('.ticket-price-paid')).toBeNull();
  });

  it('pricePaid e prize coexistem no rodapé', () => {
    renderCard({ pricePaid: '1.0000 BINGO', prize: '3.0000 BINGO' });
    expect(screen.getByText('1.0000 BINGO')).toBeInTheDocument();
    expect(screen.getByText('3.0000 BINGO')).toBeInTheDocument();
  });
});

describe('TicketCard — padrões completados', () => {
  it('padrão completado exibe badge com nome do padrão', () => {
    const row0: Pattern = {
      name: 'ROW_0',
      cells: [true, true, true, true, true,
              false, false, false, false, false,
              false, false, false, false, false,
              false, false, false, false, false,
              false, false, false, false, false],
      prize: '5.0000',
    };
    // Marcar B[0]=1, I[0]=16, N[0]=31, G[0]=46, O[0]=61
    renderCard({
      patterns: [row0],
      drawnSet: new Set([1, 16, 31, 46, 61]),
    });
    expect(screen.getByText('ROW_0')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('is-winner');
  });
});
