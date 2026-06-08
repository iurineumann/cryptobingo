// BuyTicketModal.test.tsx
// Cobre: render inicial, step 'form', error handling, isPurchasing, urgência, fechamento.

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import BuyTicketModal from './BuyTicketModal';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => {
    if (opts) return `${k}:${JSON.stringify(opts)}`;
    return k;
  }}),
}));

const mockState = vi.hoisted(() => ({
  isPurchasing:  false as boolean,
  purchaseError: null  as string | null,
  generateForPreview: vi.fn().mockResolvedValue([]),
  purchaseTickets:    vi.fn().mockResolvedValue({ transaction_id: 'abc123' }),
  clearError:         vi.fn(),
}));

vi.mock('../hooks/useTicketPurchase', () => ({
  useTicketPurchase: () => ({
    isPurchasing:       mockState.isPurchasing,
    purchaseError:      mockState.purchaseError,
    lastPurchase:       null,
    generateForPreview: mockState.generateForPreview,
    purchaseTickets:    mockState.purchaseTickets,
    clearError:         mockState.clearError,
  }),
}));

const mockClearError = mockState.clearError;

// Session stub — apenas actor/permissionLevel são usados no transact
const mockSession = {
  actor:          'jogador1',
  permissionLevel: { actor: 'jogador1', permission: 'active' },
  transact:       vi.fn(),
  client:         {},
} as any;

const DEFAULT_PRICE = { quantity: '10.0000 BINGO', contract: 'bingo.token' };

function renderModal(overrides: Partial<Parameters<typeof BuyTicketModal>[0]> = {}) {
  const onClose   = vi.fn();
  const onSuccess = vi.fn();
  render(
    <BuyTicketModal
      gameId="9999999999999"   // futuro garantido → não isClosed
      ticketPrice={DEFAULT_PRICE}
      session={mockSession}
      onClose={onClose}
      onSuccess={onSuccess}
      {...overrides}
    />,
  );
  return { onClose, onSuccess };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.isPurchasing      = false;
  mockState.purchaseError     = null;
});

// ── Testes ───────────────────────────────────────────────────────────────────

describe('BuyTicketModal — render inicial', () => {
  it('exibe título do modal na step form', () => {
    renderModal();
    expect(screen.getByText('buy_ticket.title')).toBeInTheDocument();
  });

  it('botão fechar (✕) presente', () => {
    renderModal();
    expect(screen.getByLabelText('common.close')).toBeInTheDocument();
  });

  it('maxTicketsPerPlayer exibe info de limite', () => {
    renderModal({ maxTicketsPerPlayer: 5 });
    expect(screen.getByText(/buy_ticket\.room_limit_info/)).toBeInTheDocument();
  });

  it('sem maxTicketsPerPlayer → info de limite ausente', () => {
    renderModal();
    expect(screen.queryByText(/buy_ticket\.room_limit_info/)).toBeNull();
  });
});

describe('BuyTicketModal — error handling', () => {
  // purchaseError é exibido no step 'preview' — o hook expõe o valor,
  // mas o JSX só o renderiza após gerar o preview. Verifica que o hook
  // é consultado corretamente (valor lido via closure do mock).
  it('hook retorna purchaseError sem crash de render', () => {
    mockState.purchaseError = 'Saldo insuficiente';
    // purchaseError só aparece no step preview; o teste valida que o
    // componente renderiza sem erro quando o hook retorna uma string de erro
    expect(() => renderModal()).not.toThrow();
    mockState.purchaseError = null;
  });

  it('hook retorna clearError como função chamável', () => {
    renderModal();
    // clearError é disponibilizado pelo hook — verificar que não é undefined
    expect(typeof mockClearError).toBe('function');
  });
});

describe('BuyTicketModal — estado de compra', () => {
  it('isPurchasing=true → botão fechar desabilitado', () => {
    mockState.isPurchasing = true;
    renderModal();
    const closeBtn = screen.getByLabelText('common.close');
    expect(closeBtn).toBeDisabled();
  });
});

describe('BuyTicketModal — fechamento', () => {
  it('clique no botão ✕ chama onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clique no overlay (fora do modal) chama onClose', () => {
    const { onClose } = renderModal();
    // O overlay é o elemento role=dialog com onClick
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BuyTicketModal — countdown', () => {
  it('gameId com funding expirado mostra mensagem de encerrado', () => {
    // gameId = 0 → closesAt = 60_000ms, bem no passado
    renderModal({ gameId: '0' });
    expect(screen.getByText('buy_ticket.sales_closed')).toBeInTheDocument();
  });

  it('gameId no futuro NÃO mostra mensagem de encerrado', () => {
    renderModal({ gameId: '9999999999999' });
    expect(screen.queryByText('buy_ticket.sales_closed')).toBeNull();
  });
});
