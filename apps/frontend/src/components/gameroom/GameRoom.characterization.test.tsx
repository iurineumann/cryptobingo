// apps/frontend/src/components/gameroom/GameRoom.characterization.test.tsx
// Rede de segurança da Fase 0: trava o markup renderizado da GameRoom.
// Mocka useSlowReveal, sessão Wharfkit e a API para isolar a renderização.
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
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
  winners: [] as unknown[],
  isAborted: false,
  abortReason: null as string | null,
  wsStatus: 'connected' as const,
  isGameEnded: false,
  goldenBall: null as unknown,
  clearedStages: [] as unknown[],
  drawMode: 'standard' as const,
};
vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: () => slowRevealState,
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
vi.mock('../ticketUtils', async (orig) => await orig());

// Importação estática garante que vi.mock seja aplicado antes da resolução do módulo.
import GameRoom from '../GameRoom';

// Sessão Wharfkit mínima: games (1 linha funding) + tickets vazios + balances vazios
function makeSession(status = 'funding'): Session {
  const game = {
    game_id: String(Date.now()), status, drawn_balls: [], room_id: '1',
    ticket_price: { quantity: '1.0000 WAX', contract: 'eosio.token' },
    gametype_id: '0', end_time: 0,
  };
  const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
    if (table === 'games') return { rows: [game], more: false };
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
    // findAllByTestId + [0] porque o componente pode renderizar múltiplos heróis
    // em resoluções de layout; o primeiro elemento é o visível.
    const heroes = await screen.findAllByTestId('gr-ball-hero-number');
    expect(heroes[0].textContent).toBe('⭐');
  });

  it('renderiza overlay de fim quando o slow reveal indica jogo encerrado', async () => {
    slowRevealState.isGameEnded = true;
    renderRoom(makeSession('drawn'));
    expect(await screen.findByTestId('gr-ended-overlay')).toBeTruthy();
  });
});
