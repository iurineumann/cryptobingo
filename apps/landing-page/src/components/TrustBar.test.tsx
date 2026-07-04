import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrustBar from './TrustBar';

describe('TrustBar', () => {
  it('renders trust items', () => {
    render(<TrustBar />);
    expect(screen.getByText('trust_bar.built_on_wax')).toBeInTheDocument();
    expect(screen.getByText('trust_bar.audited')).toBeInTheDocument();
    expect(screen.getByText('trust_bar.provably_fair')).toBeInTheDocument();
    expect(screen.getByText('trust_bar.players_count')).toBeInTheDocument();
  });

  it('renders contract link', () => {
    render(<TrustBar />);
    const link = screen.getByText('trust_bar.view_contract');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href');
  });

  it('renders trust items with testids', () => {
    render(<TrustBar />);
    expect(screen.getByTestId('trust-trust_bar.built_on_wax')).toBeInTheDocument();
    expect(screen.getByTestId('trust-trust_bar.audited')).toBeInTheDocument();
    expect(screen.getByTestId('trust-trust_bar.provably_fair')).toBeInTheDocument();
    expect(screen.getByTestId('trust-trust_bar.players_count')).toBeInTheDocument();
    expect(screen.getByTestId('trust-contract-link')).toBeInTheDocument();
  });
});
