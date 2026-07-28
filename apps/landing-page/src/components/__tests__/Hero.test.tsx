import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Hero from '../Hero';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockParams = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('react-router', () => ({
  useParams: () => mockParams,
}));

vi.mock('@/components/NextDrawTimer', () => ({
  default: () => null,
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

  it('should render custom hero when hero prop provided', () => {
    render(<Hero hero={{ title: 'Custom Title', subtitle: 'Custom Sub', cta_text: 'Play', cta_link: '/test' }} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Play')).toBeInTheDocument();
  });

  it('should show HeroBall fallback on video error', () => {
    render(<Hero />);
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video?.querySelector('source[src="/images/hero-loop.webm"]')).toBeTruthy();
    expect(video?.querySelector('source[src="/images/hero-loop.mp4"]')).toBeTruthy();
    fireEvent.error(video!);
    expect(screen.getByTestId('hero-image')).toBeInTheDocument();
  });

  it('should handle missing locale', () => {
    mockParams.locale = '';
    render(<Hero />);
    expect(screen.getByTestId('hero-cta')).toBeInTheDocument();
  });
});
