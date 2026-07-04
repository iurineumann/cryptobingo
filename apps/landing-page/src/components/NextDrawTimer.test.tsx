import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NextDrawTimer from './NextDrawTimer';

describe('NextDrawTimer', () => {
  it('renders timer', () => {
    render(<NextDrawTimer />);
    expect(screen.getByTestId('next-draw-timer')).toBeInTheDocument();
  });

  it('renders compact variant', () => {
    render(<NextDrawTimer compact />);
    expect(screen.getByTestId('header-timer')).toBeInTheDocument();
  });
});
