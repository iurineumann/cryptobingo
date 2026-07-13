import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hero from './Hero';

describe('Hero', () => {
  it('renders default title and subtitle', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-cta')).toBeInTheDocument();
    expect(screen.getByTestId('hero-learn-more')).toBeInTheDocument();
  });

  it('renders custom content when hero prop provided', () => {
    const hero = {
      title: 'Custom Title',
      subtitle: 'Custom subtitle',
      cta_text: 'Play',
      cta_link: 'https://example.com',
    };
    render(<Hero hero={hero} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom subtitle')).toBeInTheDocument();
    expect(screen.getByText('Play')).toBeInTheDocument();
  });

  it('shows RTP badge', () => {
    render(<Hero />);
    expect(screen.getByText('RTP 85%')).toBeInTheDocument();
  });

  it('shows next draw timer', () => {
    render(<Hero />);
    expect(screen.getByTestId('next-draw-timer')).toBeInTheDocument();
  });

  it('CTA links open in new tab', () => {
    const hero = { title: 'T', subtitle: 'S', cta_text: 'Play', cta_link: 'https://test.cryptobingo.bet' };
    render(<Hero hero={hero} />);
    const cta = screen.getByTestId('hero-cta');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders game screenshot image section', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-image')).toBeInTheDocument();
  });

  it('renders play overlay button', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-play-overlay')).toBeInTheDocument();
  });
});
