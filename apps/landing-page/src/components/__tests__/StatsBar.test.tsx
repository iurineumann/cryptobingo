import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import StatsBar from '../StatsBar';

const mockGetGameStats = vi.fn();

vi.mock('@/lib/api', () => ({
  getGameStats: (...args: unknown[]) => mockGetGameStats(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, string>) => opts ? `${k}:${JSON.stringify(opts)}` : k }),
}));

let triggerIntersection: (() => void) | null = null;
let rAFcallbacks: Array<(ts: number) => void> = [];
let rAFId = 0;

beforeEach(() => {
  triggerIntersection = null;
  rAFcallbacks = [];
  rAFId = 0;
  mockGetGameStats.mockReset();
  mockGetGameStats.mockResolvedValue({
    totals: { total_games: 1500000, total_players: 25000 },
    by_token: [
      { token: 'WAX', total_games: 1000000, total_prizes: 300000, avg_rtp_pct: 85.0, total_players: 20000 },
      { token: 'BINGO', total_games: 500000, total_prizes: 200000, avg_rtp_pct: 86.0, total_players: 5000 },
    ],
    generated_at: '2026-07-15T00:00:00Z',
  });

  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
      triggerIntersection = () => cb([{ isIntersecting: true } as IntersectionObserverEntry]);
    }
    observe() {}
    disconnect() {}
  });

  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rAFcallbacks.push(cb);
    return ++rAFId;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function processAllRAF(): void {
  let simTime = 0;
  const stepMs = 110;
  let safety = 100;
  while (rAFcallbacks.length > 0 && safety-- > 0) {
    const cb = rAFcallbacks.shift()!;
    simTime += stepMs;
    cb(simTime);
  }
}

describe('StatsBar', () => {
  test('renders totals section with testids', () => {
    render(<StatsBar />);
    expect(screen.getByTestId('stat-total-games')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-players')).toBeInTheDocument();
  });

  test('calls getGameStats on mount', () => {
    render(<StatsBar />);
    expect(mockGetGameStats).toHaveBeenCalledTimes(1);
  });

  test('shows loading text when no data', async () => {
    mockGetGameStats.mockRejectedValue(new Error('network error'));
    render(<StatsBar />);
    expect(await screen.findByText('stats.loading')).toBeInTheDocument();
  });

  test('shows placeholder when API fails', async () => {
    mockGetGameStats.mockRejectedValue(new Error('network error'));
    render(<StatsBar />);
    const items = await screen.findAllByText('—');
    expect(items).toHaveLength(2);
  });

  test('shows formatted numbers with K/M suffixes after animation', async () => {
    render(<StatsBar />);

    await vi.waitFor(() => expect(triggerIntersection).not.toBeNull());
    act(() => { triggerIntersection!(); });
    await vi.waitFor(() => expect(rAFcallbacks.length).toBeGreaterThan(0));
    act(() => { processAllRAF(); });

    expect(screen.getByTestId('stat-total-games').textContent).toContain('1.5M');
    expect(screen.getByTestId('stat-total-players').textContent).toContain('25');
  });

  test('does not animate when not intersecting', async () => {
    let triggerNonIntersection: (() => void) | null = null;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        triggerNonIntersection = () => cb([{ isIntersecting: false } as IntersectionObserverEntry]);
      }
      observe() {}
      disconnect() {}
    });

    render(<StatsBar />);
    await vi.waitFor(() => expect(triggerNonIntersection).not.toBeNull());
    act(() => { triggerNonIntersection!(); });
    const animating = rAFcallbacks.length === 0;
    expect(animating).toBe(true);
  });

  test('renders per-token sections with WAX and BINGO visible', async () => {
    render(<StatsBar />);

    await vi.waitFor(() => expect(triggerIntersection).not.toBeNull());
    act(() => { triggerIntersection!(); });
    await vi.waitFor(() => expect(rAFcallbacks.length).toBeGreaterThan(0));
    act(() => { processAllRAF(); });

    expect(screen.getByTestId('stat-token-wax')).toBeInTheDocument();
    expect(screen.getByTestId('stat-token-bingo')).toBeInTheDocument();
    expect(screen.getByTestId('stat-token-rtp-wax')).toBeInTheDocument();
    expect(screen.getByTestId('stat-token-rtp-bingo')).toBeInTheDocument();
  });
});
