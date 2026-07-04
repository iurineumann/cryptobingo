import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletSection from './WalletSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'wallet.title': 'Connect Your Wallet',
        'wallet.desc': 'Connect your WAX wallet to play, win, and withdraw.',
        'wallet.value_secure_title': 'Secure & Verifiable',
        'wallet.value_secure_desc': 'All transactions signed in your wallet.',
        'wallet.value_instant_title': 'Instant Play',
        'wallet.value_instant_desc': 'No deposits, no waiting.',
        'wallet.value_withdraw_title': 'Auto Withdrawals',
        'wallet.value_withdraw_desc': 'Winnings sent directly to your wallet.',
        'wallet.step1': 'Install Anchor or WAX Cloud Wallet',
        'wallet.step2': 'Connect to CryptoBingo',
        'wallet.step3': 'Buy tickets and play',
      };
      return map[key] || key;
    },
  }),
}));

describe('WalletSection', () => {
  it('renders section title', () => {
    render(<WalletSection />);
    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
  });

  it('renders value propositions before steps', () => {
    render(<WalletSection />);
    expect(screen.getByText('Secure & Verifiable')).toBeInTheDocument();
    expect(screen.getByText('Instant Play')).toBeInTheDocument();
    expect(screen.getByText('Auto Withdrawals')).toBeInTheDocument();
  });

  it('renders step items', () => {
    render(<WalletSection />);
    expect(screen.getByText('Install Anchor or WAX Cloud Wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect to CryptoBingo')).toBeInTheDocument();
    expect(screen.getByText('Buy tickets and play')).toBeInTheDocument();
  });

  it('renders value props before how-to steps in DOM order', () => {
    render(<WalletSection />);
    const allText = document.body.textContent || '';
    const secureIdx = allText.indexOf('Secure & Verifiable');
    const stepIdx = allText.indexOf('Install');
    expect(secureIdx).toBeLessThan(stepIdx);
  });
});
