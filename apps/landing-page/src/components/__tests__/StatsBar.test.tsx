import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import StatsBar from '../StatsBar';

const mockGetGameStats = vi.fn();

vi.mock('@/lib/api', () => ({
  getGameStats: (...args: unknown[]) => mockGetGameStats(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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
    total_games: 1500000,
    total_prizes: 500000,
    total_players: 25000,
    avg_rtp_pct: 85.3,
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
  test('renders 4 stat items with testids', () => {
    render(<StatsBar />);
    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`stat-${i}`)).toBeInTheDocument();
    }
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
    expect(items).toHaveLength(4);
  });

  test('shows formatted numbers with K/M suffixes after animation', async () => {
    render(<StatsBar />);

    await vi.waitFor(() => expect(triggerIntersection).not.toBeNull());
    act(() => { triggerIntersection!(); });
    await vi.waitFor(() => expect(rAFcallbacks.length).toBeGreaterThan(0));
    act(() => { processAllRAF(); });

    expect(screen.getByTestId('stat-0').textContent).toContain('1.5M');
    expect(screen.getByTestId('stat-1').textContent).toContain('500');
    expect(screen.getByTestId('stat-2').textContent).toContain('25');
  });

  test('shows RTP with percent suffix', async () => {
    render(<StatsBar />);

    await vi.waitFor(() => expect(triggerIntersection).not.toBeNull());
    act(() => { triggerIntersection!(); });
    await vi.waitFor(() => expect(rAFcallbacks.length).toBeGreaterThan(0));
    act(() => { processAllRAF(); });

    expect(screen.getByTestId('stat-3').textContent).toContain('85');
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
});
