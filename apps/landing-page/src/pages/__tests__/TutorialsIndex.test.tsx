import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorialsIndex from '../TutorialsIndex';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
  useLoaderData: () => ({
    items: [
      { slug: 'getting-started', title: 'Getting Started', description: 'Begin here' },
    ],
  }),
  Link: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: React.MouseEventHandler }) => (
    <a href={to} onClick={onClick}>{children}</a>
  ),
}));

vi.mock('@/components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('@/components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

describe('TutorialsIndex analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should push tutorial_click on tutorial link click', () => {
    render(<TutorialsIndex />);
    fireEvent.click(screen.getByText('Getting Started'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'tutorial_click',
        tutorial_slug: 'getting-started',
      })
    );
  });
});
