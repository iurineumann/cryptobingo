import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActivityFeed from './ActivityFeed';

const mockTrackEvent = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'activity_feed.title': 'Latest Wins',
        'activity_feed.item_prize': '{{prize}} WUF',
        'activity_feed.pending': 'Pending...',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ trackEvent: mockTrackEvent }),
}));

beforeEach(() => {
  mockTrackEvent.mockClear();
});

describe('ActivityFeed', () => {
  it('renders section title', () => {
    render(<ActivityFeed />);
    expect(screen.getByText('Latest Wins')).toBeInTheDocument();
  });

  it('renders activity items from mock data', () => {
    render(<ActivityFeed />);
    const items = screen.getAllByTestId(/^activity-item-/);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('calls trackEvent for win_displayed on mount', () => {
    render(<ActivityFeed />);
    expect(mockTrackEvent).toHaveBeenCalledWith('win_displayed', expect.any(Object));
  });
});
