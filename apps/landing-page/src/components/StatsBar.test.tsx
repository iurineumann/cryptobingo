import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import StatsBar from './StatsBar';

class MockObserver {
  observe = vi.fn((_target: Element, ..._rest: unknown[]) => {
    // Simula intersecao imediata para disparar a animacao (equivalente ao usuario rolar ate a StatsBar).
    const cb = (this as unknown as { callback?: (entries: Array<{ isIntersecting: boolean }>) => void }).callback;
    queueMicrotask(() => cb?.([{ isIntersecting: true }]));
  });
  disconnect = vi.fn();
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    (this as unknown as { callback: (entries: Array<{ isIntersecting: boolean }>) => void }).callback = callback;
  }
}

let rafCallbacks: Array<(ts: number) => void> = [];
let rafId = 0;
let rafCallCount = 0;

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockObserver as unknown as typeof IntersectionObserver);
  rafCallbacks = [];
  rafId = 0;
  rafCallCount = 0;
  mockGetGameStats.mockReset();
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafCallbacks.push(cb);
    rafCallCount++;
    return ++rafId;
  });
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockGetGameStats = vi.fn(() => Promise.resolve(null));
vi.mock('@/lib/api', () => ({
  getGameStats: (...args: unknown[]) => mockGetGameStats(...args),
}));

afterEach(() => {
  rafCallbacks = [];
  rafId = 0;
  rafCallCount = 0;
});

function processAllRAF(): void {
  let simTime = 0;
  const stepMs = 110;
  let safety = 500;
  while (rafCallbacks.length > 0 && safety-- > 0) {
    const cb = rafCallbacks.shift()!;
    simTime += stepMs;
    cb(simTime);
  }
}

describe('StatsBar', () => {
  it('renders total games and players labels when no data', async () => {
    await act(async () => {
      render(<StatsBar />);
    });
    expect(screen.getByText('stats.games_played')).toBeInTheDocument();
    expect(screen.getByText('stats.active_players')).toBeInTheDocument();
  });

  it('renders loading text when no data', async () => {
    await act(async () => {
      render(<StatsBar />);
    });
    expect(screen.getByText('stats.loading')).toBeInTheDocument();
  });

  it('renders totals section testids', async () => {
    await act(async () => {
      render(<StatsBar />);
    });
    expect(screen.getByTestId('stat-total-games')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-players')).toBeInTheDocument();
  });

  it('does NOT enter an infinite render loop when data arrives (regression for animation effect)', async () => {
    mockGetGameStats.mockResolvedValue({
      totals: { total_games: 1500000, total_players: 25000 },
      by_token: [
        { token: 'WAX', total_games: 1000000, total_prizes: 300000, avg_rtp_pct: 85.0, total_players: 20000 },
        { token: 'BINGO', total_games: 500000, total_prizes: 200000, avg_rtp_pct: 86.0, total_players: 5000 },
      ],
      generated_at: '2026-07-15T00:00:00Z',
    });

    await act(async () => {
      render(<StatsBar />);
    });

    // Resolve a promise de getGameStats dentro de act, simulando que os dados chegaram.
    await act(async () => {
      await Promise.resolve();
    });

    // Dispara a animacao (IntersectionObserver mock nao dispara sozinho; forçamos o estado via re-render:
    // o efeito de animacao roda quando hasAnimated=true. Como o observer mockado nao chama o callback,
    // simulamos a intersecao setando o flag indiretamente: re-render com stats ja presente + observar.
    // Em produção o observer dispara; aqui validamos que, COM dados, a animação termina (loop quebrado).
    await act(async () => {
      processAllRAF();
    });

    // Se houvesse loop infinito (targets novo a cada render), requestAnimationFrame seria agendado
    // indefinidamente. Com useMemo, a animação dura ~18 frames (2s / 110ms) e PARA.
    expect(rafCallCount).toBeLessThan(50);
    expect(rafCallCount).toBeGreaterThan(0);
  });
});
