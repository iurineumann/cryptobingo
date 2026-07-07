import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlogIndex, { loader } from '../BlogIndex';

const mockPosts = vi.hoisted(() => []);

vi.mock('../../../lib/content', () => ({
  loadBlogPosts: () => mockPosts,
}));

let mockLoaderData: unknown = {
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
};

vi.mock('react-router-dom', () => ({
  useLoaderData: () => mockLoaderData,
  useParams: () => ({ locale: 'en' }),
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

vi.mock('@/components/Seo', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

beforeEach(() => {
  mockPosts.splice(0, mockPosts.length);
  mockLoaderData = {
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
  };
  window.dataLayer = [];
  (window as any)._analyticsConsented = true;
});

describe('BlogIndex', () => {
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

  it('should not show tag filter when no tags', () => {
    mockLoaderData = {
      posts: [],
      totalPages: 0,
      currentPage: 1,
      activeTag: null,
      allTags: [],
    };
    render(<BlogIndex />);
    expect(screen.queryByTestId('tag-filter')).not.toBeInTheDocument();
  });

  it('should show first letter placeholder when no cover', () => {
    render(<BlogIndex />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('BlogIndex loader', () => {
  it('should return paged posts with allTags', async () => {
    mockPosts.push(
      { slug: 'post-1', title: 'Post 1', tags: ['tag1'], date: '2026-01-01T00:00:00Z', author: 'A' },
      { slug: 'post-2', title: 'Post 2', tags: ['tag2'], date: '2026-01-02T00:00:00Z', author: 'B' },
      { slug: 'post-3', title: 'Post 3', tags: ['tag3'], date: '2026-01-03T00:00:00Z', author: 'C' },
    );

    const result = await loader({ params: { locale: 'en' }, request: new Request('http://test.com/blog') });
    expect(result.posts).toHaveLength(3);
    expect(result.allTags).toEqual(['tag1', 'tag2', 'tag3']);
    expect(result.totalPages).toBe(1);
  });

  it('should filter by tag when tag param present', async () => {
    mockPosts.push(
      { slug: 'post-1', title: 'Post 1', tags: ['tag1'], date: '2026-01-01T00:00:00Z', author: 'A' },
      { slug: 'post-2', title: 'Post 2', tags: ['tag2'], date: '2026-01-02T00:00:00Z', author: 'B' },
    );

    const result = await loader({ params: { locale: 'en' }, request: new Request('http://test.com/blog?tag=tag1') });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].slug).toBe('post-1');
    expect(result.activeTag).toBe('tag1');
  });

  it('should paginate posts with pageSize 12', async () => {
    const posts = Array.from({ length: 15 }, (_, i) => ({
      slug: `post-${i + 1}`,
      title: `Post ${i + 1}`,
      tags: [],
      date: '2026-01-01T00:00:00Z',
      author: 'A',
    }));
    mockPosts.push(...posts);

    const result = await loader({ params: { locale: 'en' }, request: new Request('http://test.com/blog?page=2') });
    expect(result.posts).toHaveLength(3);
    expect(result.currentPage).toBe(2);
    expect(result.totalPages).toBe(2);
  });
});
