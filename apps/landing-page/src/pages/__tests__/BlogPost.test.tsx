import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import BlogPost from '../BlogPost';

vi.mock('react-router-dom', () => ({
  useLoaderData: () => ({
    title: 'Test Post',
    description: 'Test description',
    date: '2024-01-01',
    author: 'Author Name',
    cover: '/cover.jpg',
    tags: ['tag1', 'tag2'],
    body: '<p>Hello world</p>',
    slug: 'test-post',
  }),
  useParams: () => ({ slug: 'test', locale: 'en' }),
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
});
