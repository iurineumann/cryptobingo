// apps/frontend/src/components/gameroom/GameRoom.characterization.test.tsx
// Rede de segurança da Fase 0: trava o comportamento renderizado da GameRoom.
// Mocka useSlowReveal, sessão Wharfkit e a API para isolar a renderização.
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import type { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';

// Polyfill: ResizeObserver não existe no jsdom — GameRoom usa para sincronizar
// altura do painel de padrões com o palco.
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// Desmonta o DOM entre testes. O vitest.setup.ts já faz afterEach(cleanup) global,
// mas registramos explicitamente aqui para garantir isolamento determinístico mesmo
// se a ordem dos hooks variar entre execução isolada e suíte completa — a causa raiz
// do DOM acumulado que antes exigia findAllByTestId no hero.
afterEach(() => cleanup());

// i18n: devolve a própria chave (espelha o padrão de TicketCard.test.tsx)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

// useSlowReveal controlável por teste
const slowRevealState = {
  drawnBalls: [] as Array<{ order: number; number: number; timestamp: string }>,
  lastBall: null as null | { order: number; number: number; timestamp: string },
  isDrawing: false,
  winners: [] as Array<{ ticket_id: string; win_pattern: string; payouts: string[] }>,
  isAborted: false,
  abortReason: null as string | null,
  wsStatus: 'connected' as const,
  isGameEnded: false,
  goldenBall: null as unknown,
  clearedStages: [] as unknown[],
  drawMode: 'standard' as const,
  prizeStatuses: {} as Record<string, unknown>,
};
vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: () => slowRevealState,
}));

// useRoomSocial: mock para evitar conexão socket nos testes
vi.mock('../../hooks/useRoomSocial', () => ({
  useRoomSocial: () => ({ onlineCount: 0, reactions: [], sendReaction: vi.fn() }),
}));

// API: espalha os exports reais e substitui apenas as funções assíncronas usadas.
// Isso garante que helpers síncronos (getAuthToken, clearAuthToken, etc.) continuem
// disponíveis para hooks filhos como useChat e ChatFloating.
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [] }),
    fetchRoom: vi.fn().mockResolvedValue({ room_id: '1', metadata: { name: 'Sala Teste' }, current_game_id: '0' }),
  };
});
// ticketUtils é mockado como pass-through (importOriginal) porque GameRoom o consome
// para derivar vitórias/proximidade. Mantemos a implementação real — o mock existe
// apenas para fixar o registro do módulo no grafo do vitest e evitar resolução tardia
// que, na suíte completa, deixaria o componente sem as funções e renderizaria vazio.
vi.mock('../ticketUtils', async (orig) => await orig());

// Importação estática garante que vi.mock seja aplicado antes da resolução do módulo.
import GameRoom from '../GameRoom';

// Matriz canônica de 24 números (sem FREE SPACE). B:1-5 I:16-20 N:31-34 G:46-50 O:61-65
const TEST_MATRIX = [
  1, 2, 3, 4, 5,
  16, 17, 18, 19, 20,
  31, 32, 33, 34,
  46, 47, 48, 49, 50,
  61, 62, 63, 64, 65,
];

// Sessão Wharfkit mínima. `withTicket` injeta uma cartela do jogador na tabela tickets.
function makeSession(status = 'funding', opts: { withTicket?: boolean; drawnBalls?: number[] } = {}): Session {
  const game = {
    game_id: String(Date.now()), status,
    drawn_balls: opts.drawnBalls ?? [], room_id: '1',
    ticket_price: { quantity: '1.0000 WAX', contract: 'eosio.token' },
    gametype_id: '0', end_time: 0,
  };
  const tickets = opts.withTicket
    ? [{ ticket_id: '1', owner: 'player1', matrix: TEST_MATRIX, price: { quantity: '5.0000 WAX', contract: 'eosio.token' } }]
    : [];
  const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
    if (table === 'games') return { rows: [game], more: false };
    if (table === 'tickets') return { rows: tickets, more: false };
    return { rows: [], more: false };
  });
  return {
    actor: 'player1',
    client: { v1: { chain: { get_table_rows } } },
  } as unknown as Session;
}

const profile = { wallet_address: 'player1' } as MongoUserProfile;

function renderRoom(session: Session) {
  return render(
    <GameRoom gameId="100" roomId="1" session={session} profile={profile} onLeave={vi.fn()} />,
  );
}

describe('GameRoom — caracterização Fase 0', () => {
  beforeEach(() => {
    slowRevealState.drawnBalls = [];
    slowRevealState.lastBall = null;
    slowRevealState.isGameEnded = false;
    slowRevealState.winners = [];
    slowRevealState.prizeStatuses = {};
  });

  it('renderiza header, palco e seção de cartelas no estado funding', async () => {
    renderRoom(makeSession('funding'));
    expect(await screen.findByTestId('gr-room-header')).toBeTruthy();
    expect(await screen.findByTestId('gr-ball-hero')).toBeTruthy();
    expect(await screen.findByTestId('gr-ball-history')).toBeTruthy();
    expect(await screen.findByTestId('gr-my-tickets')).toBeTruthy();
  });

  it('mostra estrela ⭐ no hero quando nenhuma bola foi sorteada', async () => {
    renderRoom(makeSession('funding'));
    expect((await screen.findByTestId('gr-ball-hero-number')).textContent).toBe('⭐');
  });

  describe('overlay de fim de jogo (gr-ended-overlay) — isola os dois caminhos', () => {
    it('caminho WS: status funding + slowReveal.isGameEnded=true', async () => {
      slowRevealState.isGameEnded = true;
      renderRoom(makeSession('funding'));
      expect(await screen.findByTestId('gr-ended-overlay')).toBeTruthy();
    });

    it('caminho blockchain: status drawn, isGameEnded=false, drawnBalls vazio (isStaticFinalState)', async () => {
      slowRevealState.isGameEnded = false;
      renderRoom(makeSession('drawn'));
      expect(await screen.findByTestId('gr-ended-overlay')).toBeTruthy();
    });
  });

  it('renderiza breakdown de prêmio quando o jogador vence (overlay + gr-prize-breakdown)', async () => {
    // Cenário real de vitória: o WS enviou um vencedor cujo ticket_id pertence ao jogador.
    // localWinners = winners (caminho WS, pois winners.length > 0) → playerWinEntries.length > 0
    // → o bloco gr-prize-breakdown renderiza. Sem combinações, a vitória cai em patternMap.
    slowRevealState.isGameEnded = true;
    slowRevealState.winners = [
      { ticket_id: '1', win_pattern: 'Linha Horizontal', payouts: ['5.0000 WAX'] },
    ];
    renderRoom(makeSession('drawn', { withTicket: true }));

    expect(await screen.findByTestId('gr-ended-overlay')).toBeTruthy();
    const breakdown = await screen.findByTestId('gr-prize-breakdown');
    expect(breakdown).toBeTruthy();
    // A linha do breakdown deve refletir o padrão e o prêmio vencidos.
    expect(breakdown.textContent).toContain('Linha Horizontal');
    expect(breakdown.textContent).toContain('5.0000');
  });
});
