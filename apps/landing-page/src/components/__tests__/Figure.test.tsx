import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Figure, FigureGallery } from '../Figure';

describe('Figure', () => {
  it('renders image with alt text', () => {
    render(<Figure src="/test.png" alt="Diagrama fluxo" />);
    const img = screen.getByTestId('figure-image');
    expect(img).toHaveAttribute('src', '/test.png');
    expect(img).toHaveAttribute('alt', 'Diagrama fluxo');
  });

  it('renders caption when provided', () => {
    render(<Figure src="/test.png" alt="Teste" caption="Figura 1: Fluxo do RNG" />);
    expect(screen.getByTestId('figure-caption')).toHaveTextContent('Figura 1: Fluxo do RNG');
  });

  it('does not render caption when not provided', () => {
    render(<Figure src="/test.png" alt="Teste" />);
    expect(screen.queryByTestId('figure-caption')).not.toBeInTheDocument();
  });

  it('toggles zoom on click when zoomable', () => {
    render(<Figure src="/test.png" alt="Teste" zoomable />);
    const img = screen.getByTestId('figure-image');
    fireEvent.click(img);
    expect(screen.getByTestId('figure-close')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('figure-close'));
    expect(screen.queryByTestId('figure-close')).not.toBeInTheDocument();
  });

  it('does not zoom when zoomable=false', () => {
    render(<Figure src="/test.png" alt="Teste" zoomable={false} />);
    fireEvent.click(screen.getByTestId('figure-image'));
    expect(screen.queryByTestId('figure-close')).not.toBeInTheDocument();
  });

  it('has lazy loading', () => {
    render(<Figure src="/test.png" alt="Teste" />);
    expect(screen.getByTestId('figure-image')).toHaveAttribute('loading', 'lazy');
  });
});

describe('FigureGallery', () => {
  const images = [
    { src: '/img1.png', alt: 'Primeira imagem', caption: 'Passo 1' },
    { src: '/img2.png', alt: 'Segunda imagem' },
  ];

  it('renders all images in grid', () => {
    render(<FigureGallery images={images} />);
    expect(screen.getByTestId('figure-gallery')).toBeInTheDocument();
    expect(screen.getAllByTestId('figure-image')).toHaveLength(2);
  });

  it('renders nothing when empty', () => {
    const { container } = render(<FigureGallery images={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('passes zoomable prop to children', () => {
    render(<FigureGallery images={images} zoomable={false} />);
    fireEvent.click(screen.getAllByTestId('figure-image')[0]);
    expect(screen.queryByTestId('figure-close')).not.toBeInTheDocument();
  });
});
