import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HowItWorks from './HowItWorks';

describe('HowItWorks', () => {
  it('renders section heading', () => {
    render(<HowItWorks />);
    expect(screen.getByText('how_it_works.section_tag')).toBeInTheDocument();
  });

  it('renders three steps', () => {
    render(<HowItWorks />);
    expect(screen.getByText('how_it_works.step1_label')).toBeInTheDocument();
    expect(screen.getByText('how_it_works.step2_label')).toBeInTheDocument();
    expect(screen.getByText('how_it_works.step3_label')).toBeInTheDocument();
  });

  it('renders step containers with testids', () => {
    render(<HowItWorks />);
    expect(screen.getByTestId('how-it-works-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('how-it-works-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('how-it-works-step-2')).toBeInTheDocument();
  });
});
