import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import TutorialPost from '../TutorialPost';

vi.mock('react-router-dom', () => ({
  useLoaderData: () => ({
    tutorial: {
      title: 'Test Tutorial',
      description: 'Test description',
      body: '<p>Hello world</p>',
      slug: 'test-tutorial',
      order: 1,
    },
    previous: null,
    next: null,
    total: 1,
    current: 1,
    relatedTutorials: [],
  }),
  useParams: () => ({ slug: 'test-tutorial', locale: 'en' }),
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

describe('TutorialPost', () => {
  test('renders with ContentHeader and ContentBody', () => {
    render(<TutorialPost />);
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('shows step progress', () => {
    render(<TutorialPost />);
    expect(screen.getByText(/tutorial\.step/)).toBeInTheDocument();
  });

  test('renders back to tutorials link', () => {
    render(<TutorialPost />);
    const backLink = screen.getByText(/tutorials\.back/);
    expect(backLink).toBeInTheDocument();
  });
});
