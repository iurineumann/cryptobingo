import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FaqPage, { loader } from '../FaqPage';

vi.mock('../../../lib/content', () => ({
  loadFAQItems: (locale: string) => [
    { slug: 'what-is-cryptobingo', question: 'What is CryptoBingo?', answer: 'A bingo platform.' },
    { slug: 'how-to-play', question: 'How to play?', answer: 'Buy a ticket.' },
  ].filter(() => locale === 'pt' ? false : true),
}));

const mockParams = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useLoaderData: () => ({
    items: [
      { slug: 'what-is-cryptobingo', question: 'What is CryptoBingo?', answer: 'A bingo platform.' },
      { slug: 'how-to-play', question: 'How to play?', answer: 'Buy a ticket.' },
    ],
  }),
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

describe('FaqPage render', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should render FAQ items', () => {
    render(<FaqPage />);
    expect(screen.getByText('What is CryptoBingo?')).toBeInTheDocument();
    expect(screen.getByText('How to play?')).toBeInTheDocument();
  });

  it('should push faq_toggle open when details opened', () => {
    render(<FaqPage />);
    const details = screen.getByText('What is CryptoBingo?').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle', { bubbles: true }));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'faq_toggle',
        question_slug: 'what-is-cryptobingo',
        action: 'open',
      })
    );
  });

  it('should handle missing locale', () => {
    mockParams.locale = '';
    render(<FaqPage />);
    expect(screen.getByText('What is CryptoBingo?')).toBeInTheDocument();
  });
});

describe('FaqPage loader', () => {
  it('should use provided locale', async () => {
    const result = await loader({ params: { locale: 'en' } });
    expect(result.items).toHaveLength(2);
  });

  it('should use default locale when none provided', async () => {
    const result = await loader({ params: {} });
    expect(result.items).toHaveLength(2);
  });
});
