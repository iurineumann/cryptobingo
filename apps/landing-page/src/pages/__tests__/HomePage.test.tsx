import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { loader } from '../HomePage';

vi.mock('../../../lib/content', () => ({
  loadSettings: (locale: string) => ({ hero: { title: locale === 'pt' ? 'Teste' : 'Test' } }),
}));

const mockParams = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLoaderData: () => ({
      hero: { title: 'Test', cta: 'Play', learnMore: 'Learn' },
    }),
    useParams: () => mockParams,
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
vi.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => ({ trackEvent: vi.fn() }) }));

import HomePage from '../HomePage';

describe('HomePage', () => {
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

  it('should handle missing locale in params', () => {
    mockParams.locale = '';
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(container).toBeDefined();
  });
});

describe('HomePage loader', () => {
  it('should use default locale when none provided', async () => {
    const result = await loader({ params: {} });
    expect(result.hero.title).toBe('Test');
  });

  it('should use provided locale', async () => {
    const result = await loader({ params: { locale: 'pt' } });
    expect(result.hero.title).toBe('Teste');
  });
});
