import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorialsIndex, { loader } from '../TutorialsIndex';

vi.mock('../../../lib/content', () => ({
  loadTutorials: (locale: string) => [
    { slug: 'getting-started', title: 'Getting Started', description: 'Begin here' },
  ],
}));

const mockLoaderData = vi.hoisted(() => ({
  items: [
    { slug: 'getting-started', title: 'Getting Started', description: 'Begin here' },
  ],
}));

const mockParams = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useLoaderData: () => mockLoaderData,
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

describe('TutorialsIndex', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should render tutorial list', () => {
    render(<TutorialsIndex />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
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

  it('should show coming_soon when no items', () => {
    mockLoaderData.items = [];
    render(<TutorialsIndex />);
    expect(screen.getByText('tutorials.coming_soon')).toBeInTheDocument();
  });

  it('should handle missing locale', () => {
    mockParams.locale = '';
    mockLoaderData.items = [{ slug: 'test', title: 'Test', description: 'Desc' }];
    render(<TutorialsIndex />);
    expect(screen.getByText('seo.tutorials_title')).toBeInTheDocument();
  });
});

describe('TutorialsIndex loader', () => {
  it('should use provided locale', async () => {
    const result = await loader({ params: { locale: 'en' } });
    expect(result.items).toHaveLength(1);
  });

  it('should use default locale when none provided', async () => {
    const result = await loader({ params: {} });
    expect(result.items).toHaveLength(1);
  });
});
