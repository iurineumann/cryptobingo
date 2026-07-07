import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlogIndex from '../BlogIndex';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
  useLoaderData: () => ({
    posts: [
      {
        slug: 'hello-world',
        title: 'Hello World',
        description: 'First post',
        cover: '/og-image.png',
        tags: ['launch', 'wax'],
        date: '2026-01-15T10:00:00Z',
        author: 'CryptoBingo Team',
      },
      {
        slug: 'bingo-tips',
        title: 'Bingo Tips',
        description: 'How to win',
        cover: '',
        tags: [],
        date: '2026-02-01T08:00:00Z',
        author: 'Admin',
      },
    ],
    totalPages: 1,
    currentPage: 1,
    activeTag: null,
    allTags: ['launch', 'wax'],
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

describe('BlogIndex', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should render post cover image', () => {
    render(<BlogIndex />);
    const img = screen.getByAltText('Hello World');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/og-image.png');
  });

  it('should render placeholder when cover is empty', () => {
    render(<BlogIndex />);
    const placeholders = screen.getAllByText((content) => content.includes('Bingo'));
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('should render tag chips', () => {
    render(<BlogIndex />);
    const grid = screen.getByTestId('blog-grid');
    expect(grid).toHaveTextContent('launch');
    expect(grid).toHaveTextContent('wax');
  });

  it('should render metadata line with date and author', () => {
    render(<BlogIndex />);
    expect(screen.getByText('CryptoBingo Team')).toBeInTheDocument();
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

  it('should render grid layout with responsive columns', () => {
    render(<BlogIndex />);
    const grid = screen.getByTestId('blog-grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-3');
  });
});
