import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import BlogPost from '../BlogPost';

const mockTrackEvent = vi.fn();
let mockLoaderData: unknown = {
  post: {
    title: 'Test Post',
    description: 'Test description',
    date: '2024-01-01',
    author: 'Author Name',
    cover: '/cover.jpg',
    tags: ['tag1', 'tag2'],
    body: '<p>Hello world</p>',
    slug: 'test-post',
  },
  relatedPosts: [],
};

vi.mock('react-router-dom', () => ({
  useLoaderData: () => mockLoaderData,
  useParams: () => ({ slug: 'test', locale: 'en' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/Seo', () => ({ default: () => null }));
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/components/Footer', () => ({ default: () => null }));

vi.mock('@/components/ContentHeader', () => ({
  ContentHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/components/ContentBody', () => ({
  ContentBody: () => <div role="progressbar" />,
}));

vi.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

beforeEach(() => {
  mockLoaderData = {
    post: {
      title: 'Test Post',
      description: 'Test description',
      date: '2024-01-01',
      author: 'Author Name',
      cover: '/cover.jpg',
      tags: ['tag1', 'tag2'],
      body: '<p>Hello world</p>',
      slug: 'test-post',
    },
    relatedPosts: [],
  };
  mockTrackEvent.mockReset();
});

describe('BlogPost', () => {
  test('renders with ContentHeader and ContentBody', () => {
    render(<BlogPost />);
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('renders back to blog link at bottom', () => {
    render(<BlogPost />);
    const backLink = screen.getByText(/blog\.back/);
    expect(backLink).toBeInTheDocument();
  });

  test('shows not found when data is null', () => {
    mockLoaderData = null;
    render(<BlogPost />);
    expect(screen.getByRole('heading')).toHaveTextContent('Post not found');
  });

  test('renders FAQ section when post has FAQ', () => {
    mockLoaderData = {
      post: {
        title: 'FAQ Post',
        description: 'Has FAQ',
        date: '2024-01-01',
        author: 'Author',
        body: '<p>Body</p>',
        slug: 'faq-post',
        tags: [],
        faq: [{ question: 'Question?', answer: 'Answer' }],
      },
      relatedPosts: [],
    };
    render(<BlogPost />);
    expect(screen.getByText(/Question\?/)).toBeInTheDocument();
  });

  test('fires trackEvent on back link click', () => {
    render(<BlogPost />);
    fireEvent.click(screen.getByText(/blog\.back/));
    expect(mockTrackEvent).toHaveBeenCalledWith('blog_click', {
      post_slug: 'test-post',
    });
  });
});
