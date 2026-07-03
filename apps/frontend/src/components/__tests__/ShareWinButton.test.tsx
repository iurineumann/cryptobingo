import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareWinButton } from '../gameroom/ShareWinButton';

vi.mock('~/services/analytics', () => ({
  trackEvent: vi.fn(),
}));

const mockGameUrl = 'https://app.cryptobingo.bet/game/abc123';
const defaultProps = { amount: 45, gameId: 'abc123', gameUrl: mockGameUrl };

describe('ShareWinButton', () => {
  let openSpy: ReturnType<typeof vi.fn>;
  let clipboardSpy: { writeText: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    openSpy = vi.fn();
    vi.stubGlobal('window', { ...window, open: openSpy });
    clipboardSpy = { writeText: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('navigator', { ...navigator, clipboard: clipboardSpy });
  });

  it('renderiza 4 botoes de share', () => {
    render(<ShareWinButton {...defaultProps} />);
    expect(screen.getByTestId('share-win-btn-twitter')).toBeDefined();
    expect(screen.getByTestId('share-win-btn-telegram')).toBeDefined();
    expect(screen.getByTestId('share-win-btn-discord')).toBeDefined();
    expect(screen.getByTestId('share-win-btn-copy')).toBeDefined();
  });

  it('abre twitter intent no clique', async () => {
    render(<ShareWinButton {...defaultProps} />);
    await userEvent.click(screen.getByTestId('share-win-btn-twitter'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('twitter.com/intent/tweet'),
      '_blank',
      expect.any(String),
    );
  });

  it('abre telegram intent no clique', async () => {
    render(<ShareWinButton {...defaultProps} />);
    await userEvent.click(screen.getByTestId('share-win-btn-telegram'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('t.me/share'),
      '_blank',
      expect.any(String),
    );
  });

  it('copia link no botao copy', async () => {
    render(<ShareWinButton {...defaultProps} />);
    await userEvent.click(screen.getByTestId('share-win-btn-copy'));
    expect(clipboardSpy.writeText).toHaveBeenCalledWith(mockGameUrl);
  });

  it('copia texto + url no botao discord', async () => {
    render(<ShareWinButton {...defaultProps} />);
    await userEvent.click(screen.getByTestId('share-win-btn-discord'));
    expect(clipboardSpy.writeText).toHaveBeenCalledWith(
      expect.stringContaining(mockGameUrl),
    );
  });
});
