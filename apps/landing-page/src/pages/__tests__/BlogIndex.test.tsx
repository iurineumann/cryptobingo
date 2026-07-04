import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlogIndex from '../BlogIndex';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
  useLoaderData: () => ({
    posts: [
      { slug: 'hello-world', title: 'Hello World', description: 'First post' },
      { slug: 'bingo-tips', title: 'Bingo Tips', description: 'How to win' },
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

describe('BlogIndex analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should push blog_click on post link click', () => {
    render(<BlogIndex />);
    fireEvent.click(screen.getByText('Hello World'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'blog_click',
        post_slug: 'hello-world',
        post_title: 'Hello World',
      })
    );
  });
});
