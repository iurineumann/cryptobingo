import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Footer from '../Footer';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
}));

describe('Footer analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should push external_link_click on external link click', () => {
    render(<Footer />);
    const testnetLink = screen.getByText('nav.testnet');
    fireEvent.click(testnetLink);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'external_link_click',
        link_text: 'nav.testnet',
        link_url: 'https://test.cryptobingo.bet',
      })
    );
  });

  it('should push external_link_click on community external links', () => {
    render(<Footer />);
    const githubLink = screen.getByText('nav.github');
    fireEvent.click(githubLink);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'external_link_click',
        link_text: 'nav.github',
      })
    );
  });
});
