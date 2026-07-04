import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from './StatsBar';

beforeAll(() => {
  class MockObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', MockObserver as unknown as typeof IntersectionObserver);
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('StatsBar', () => {
  it('renders stat items', () => {
    render(<StatsBar />);
    expect(screen.getByText('stats.games_played')).toBeInTheDocument();
    expect(screen.getByText('stats.prizes_paid')).toBeInTheDocument();
    expect(screen.getByText('stats.active_players')).toBeInTheDocument();
    expect(screen.getByText('stats.rtp')).toBeInTheDocument();
  });

  it('renders stat values with testids', () => {
    render(<StatsBar />);
    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`stat-${i}`)).toBeInTheDocument();
    }
  });
});
