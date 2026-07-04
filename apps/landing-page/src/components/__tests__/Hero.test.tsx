import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Hero from '../Hero';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router', () => ({
  useParams: () => ({ locale: 'en' }),
}));

describe('Hero', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should push cta_click when hero-cta clicked', () => {
    render(<Hero />);
    fireEvent.click(screen.getByTestId('hero-cta'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'cta_click', cta_location: 'hero' })
    );
  });

  it('should push cta_click when hero-learn-more clicked', () => {
    render(<Hero />);
    fireEvent.click(screen.getByTestId('hero-learn-more'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'cta_click', cta_location: 'hero_learn' })
    );
  });
});
