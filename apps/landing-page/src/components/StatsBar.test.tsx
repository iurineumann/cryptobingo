import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from './StatsBar';

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
