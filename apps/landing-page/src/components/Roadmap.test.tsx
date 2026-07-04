import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Roadmap from './Roadmap';

describe('Roadmap', () => {
  it('renders section heading', () => {
    render(<Roadmap />);
    expect(screen.getByText('roadmap.title')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<Roadmap />);
    expect(screen.getByTestId('roadmap-progress')).toBeInTheDocument();
  });

  it('renders all three milestones', () => {
    render(<Roadmap />);
    expect(screen.getByText('roadmap.items.0.title')).toBeInTheDocument();
    expect(screen.getByText('roadmap.items.1.title')).toBeInTheDocument();
    expect(screen.getByText('roadmap.items.2.title')).toBeInTheDocument();
  });

  it('shows progress percentage', () => {
    render(<Roadmap />);
    expect(screen.getByText(/roadmap\.progress_label/)).toBeInTheDocument();
  });
});
