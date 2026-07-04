import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FaqPage from '../FaqPage';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
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

describe('FaqPage analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
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
});
