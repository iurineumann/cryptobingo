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
  it('renders total games and players labels when no data', () => {
    render(<StatsBar />);
    expect(screen.getByText('stats.games_played')).toBeInTheDocument();
    expect(screen.getByText('stats.active_players')).toBeInTheDocument();
  });

  it('renders loading text when no data', () => {
    render(<StatsBar />);
    expect(screen.getByText('stats.loading')).toBeInTheDocument();
  });

  it('renders totals section testids', () => {
    render(<StatsBar />);
    expect(screen.getByTestId('stat-total-games')).toBeInTheDocument();
    expect(screen.getByTestId('stat-total-players')).toBeInTheDocument();
  });
});
