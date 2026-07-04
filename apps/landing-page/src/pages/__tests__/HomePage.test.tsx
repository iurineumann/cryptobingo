import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../HomePage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLoaderData: () => ({
      hero: { title: 'Test', cta: 'Play', learnMore: 'Learn' },
    }),
    useParams: () => ({ locale: 'en' }),
  };
});

vi.mock('@/components/Seo', () => ({ default: () => null }));
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/components/Hero', () => ({ default: () => null }));
vi.mock('@/components/TrustBar', () => ({ default: () => null }));
vi.mock('@/components/HowItWorks', () => ({ default: () => null }));
vi.mock('@/components/Features', () => ({ default: () => null }));
vi.mock('@/components/Roadmap', () => ({ default: () => null }));
vi.mock('@/components/StatsBar', () => ({ default: () => null }));
vi.mock('@/components/Newsletter', () => ({ default: () => null }));
vi.mock('@/components/Footer', () => ({ default: () => null }));

describe('HomePage analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render without crashing with analytics hooks', () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(container).toBeDefined();
  });
});
