// apps/frontend/src/components/ReplayRoom.characterization.test.tsx
// Rede de segurança R0: trava data-testid e textos do ReplayRoom pós-refatoração.
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import type { ReplayState } from '../hooks/useReplay';
import type { Pattern } from './ticketUtils';

// Polyfill ResizeObserver (mesmo padrão GameRoom)
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => cleanup());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

// Estado controlável do hook
const replayState: ReplayState = {
  game: null,
  tickets: [],
  aggregate: {
    totalPlayers: 0,
    totalTicketsCount: 0,
    globalWinners: [],
    globalPatternWinCount: new Map(),
    globalCombinationWinCount: new Map(),
  },
  fullDrawnBalls: [],
  revealedBalls: [],
  revealedCount: 0,
  totalBalls: 0,
  isPlaying: false,
  isComplete: false,
  isLoading: true,
  speed: 1,
  patterns: [],
  combinations: [],
  patternWinCount: new Map(),
  combinationWinCount: new Map(),
  winners: [],
  goldenBall: null,
  gameEnded: false,
  setSpeed: vi.fn(),
  togglePlay: vi.fn(),
  skipToEnd: vi.fn(),
  restart: vi.fn(),
};

vi.mock('../hooks/useReplay', () => ({
  useReplay: () => replayState,
}));

import ReplayRoom from './ReplayRoom';

const SESSION_MOCK = { actor: 'player1', client: {} } as any;

function renderReplay() {
  return render(<ReplayRoom gameId="100" session={SESSION_MOCK} onLeave={vi.fn()} />);
}

describe('ReplayRoom — caracterização R0', () => {
  beforeEach(() => {
    replayState.isLoading = true;
    replayState.game = null;
    replayState.tickets = [];
    replayState.revealedBalls = [];
    replayState.totalBalls = 0;
    replayState.isComplete = false;
    replayState.isPlaying = false;
    replayState.winners = [];
    replayState.goldenBall = null;
    replayState.gameEnded = false;
    replayState.patterns = [];
    replayState.combinations = [];
    replayState.patternWinCount = new Map();
    replayState.combinationWinCount = new Map();
  });

  it('renderiza loading enquanto isLoading=true', async () => {
    renderReplay();
    expect(screen.getByTestId('replay-loading')).toBeTruthy();
  });

  it('renderiza not-found quando game é null e isLoading=false', async () => {
    replayState.isLoading = false;
    renderReplay();
    expect(screen.getByTestId('replay-not-found')).toBeTruthy();
  });

  it('renderiza replay-page com todos os elementos centrais quando carregado', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.tickets = [];
    replayState.revealedBalls = [];
    replayState.totalBalls = 3;
    renderReplay();

    expect(screen.getByTestId('replay-page')).toBeTruthy();
    expect(screen.getByTestId('replay-back-btn')).toBeTruthy();
    // DrawStage usa testids gr-* (reusado da GameRoom)
    expect(screen.getByTestId('gr-ball-hero')).toBeTruthy();
    expect(screen.getByTestId('gr-ball-hero-number')).toBeTruthy();
    expect(screen.getByTestId('gr-ball-history')).toBeTruthy();
    expect(screen.getByTestId('replay-play-btn')).toBeTruthy();
    expect(screen.getByTestId('replay-end-btn')).toBeTruthy();
  });

  it('exibe estrela ⭐ no hero quando nenhuma bola foi sorteada', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    renderReplay();

    // DrawStage mostra ⭐ quando lastDrawn é null
    expect(screen.getByTestId('gr-ball-hero-number').textContent).toBe('⭐');
  });

  it('existe seek track quando totalBalls > 0', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    renderReplay();

    expect(screen.getByTestId('replay-seek')).toBeTruthy();
  });

  it('renderiza restart btn quando não está completo', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.revealedBalls = [1];
    replayState.totalBalls = 3;
    renderReplay();

    expect(screen.getByTestId('replay-restart-btn')).toBeTruthy();
  });

  it('renderiza speed buttons', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    renderReplay();

    expect(screen.getByTestId('replay-speed-0.5')).toBeTruthy();
    expect(screen.getByTestId('replay-speed-1')).toBeTruthy();
    expect(screen.getByTestId('replay-speed-2')).toBeTruthy();
    expect(screen.getByTestId('replay-speed-4')).toBeTruthy();
    expect(screen.getByTestId('replay-speed-8')).toBeTruthy();
  });

  it('exibe golden banner quando goldenBall presente', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    replayState.goldenBall = { ballNum: 7, multiplier: 3 };
    renderReplay();

    expect(screen.getByTestId('replay-golden-banner')).toBeTruthy();
  });

  it('exibe ended banner quando gameEnded', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    replayState.gameEnded = true;
    renderReplay();

    expect(screen.getByTestId('replay-ended-banner')).toBeTruthy();
  });

  it('exibe summary quando isComplete e gameEnded', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 3;
    replayState.revealedBalls = [1, 2, 3];
    replayState.isComplete = true;
    replayState.gameEnded = true;
    renderReplay();

    expect(screen.getByTestId('replay-summary')).toBeTruthy();
  });

  it('aceita playerAccount opcional sem erros', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 1;
    render(<ReplayRoom gameId="100" session={SESSION_MOCK} playerAccount="vencedor123" onLeave={vi.fn()} />);
    expect(screen.getByTestId('replay-page')).toBeTruthy();
  });

  it('aceita session=null sem erros', async () => {
    replayState.isLoading = false;
    replayState.game = {
      game_id: '100', status: 'drawn', drawn_balls: [1, 2, 3],
      end_time: 0, total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
      sponsor_pool: [],
    } as any;
    replayState.totalBalls = 1;
    render(<ReplayRoom gameId="100" session={null} onLeave={vi.fn()} />);
    expect(screen.getByTestId('replay-page')).toBeTruthy();
  });
});
