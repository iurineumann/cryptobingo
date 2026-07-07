import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import TutorialPost from '../TutorialPost';

let mockLoaderData: unknown = {
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
};

vi.mock('react-router-dom', () => ({
  useLoaderData: () => mockLoaderData,
  useParams: () => ({ slug: 'test-tutorial', locale: 'en' }),
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

beforeEach(() => {
  mockLoaderData = {
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
  };
});

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

  test('shows coming soon when data is null', () => {
    mockLoaderData = null;
    render(<TutorialPost />);
    expect(screen.getByText(/coming_soon/)).toBeInTheDocument();
  });

  test('shows previous nav link when previous exists', () => {
    mockLoaderData = {
      tutorial: {
        title: 'Tutorial 2',
        description: 'Second',
        body: '<p>Body</p>',
        slug: 'tutorial-2',
        order: 2,
      },
      previous: {
        title: 'Tutorial 1',
        slug: 'tutorial-1',
        description: 'First',
        order: 1,
        body: '',
      },
      next: null,
      total: 2,
      current: 2,
      relatedTutorials: [],
    };
    render(<TutorialPost />);
    expect(screen.getByText(/tutorial\.previous/)).toBeInTheDocument();
  });

  test('shows next nav link when next exists', () => {
    mockLoaderData = {
      tutorial: {
        title: 'Tutorial 1',
        description: 'First',
        body: '<p>Body</p>',
        slug: 'tutorial-1',
        order: 1,
      },
      previous: null,
      next: {
        title: 'Tutorial 2',
        slug: 'tutorial-2',
        description: 'Second',
        order: 2,
        body: '',
      },
      total: 2,
      current: 1,
      relatedTutorials: [],
    };
    render(<TutorialPost />);
    expect(screen.getByText(/tutorial\.next/)).toBeInTheDocument();
  });

  test('renders FAQ section when tutorial has FAQ', () => {
    mockLoaderData = {
      tutorial: {
        title: 'FAQ Tutorial',
        description: 'Has FAQ',
        body: '<p>Body</p>',
        slug: 'faq-tutorial',
        order: 1,
        faq: [{ question: 'Question?', answer: 'Answer' }],
      },
      previous: null,
      next: null,
      total: 1,
      current: 1,
      relatedTutorials: [],
    };
    render(<TutorialPost />);
    expect(screen.getByTestId('faq-section')).toBeInTheDocument();
  });
});
