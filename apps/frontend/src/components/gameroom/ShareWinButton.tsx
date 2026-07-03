import { useCallback } from 'react';
import { trackEvent } from '~/services/analytics';

interface ShareWinButtonProps {
  amount: number;
  gameId: string;
  gameUrl: string;
}

function getShareText(amount: number): string {
  return `Acabei de ganhar R$${amount} no @CryptoBingo! 🎰💰`;
}

export function ShareWinButton({ amount, gameId, gameUrl }: ShareWinButtonProps) {
  const shareText = getShareText(amount);

  const handleTwitter = useCallback(() => {
    trackEvent('share_win_click', { platform: 'twitter', game_id: gameId, prize_amount: amount });
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + '\n' + gameUrl)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [shareText, gameUrl, gameId, amount]);

  const handleTelegram = useCallback(() => {
    trackEvent('share_win_click', { platform: 'telegram', game_id: gameId, prize_amount: amount });
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(shareText)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [shareText, gameUrl, gameId, amount]);

  const handleCopy = useCallback(async () => {
    trackEvent('share_win_click', { platform: 'copy', game_id: gameId, prize_amount: amount });
    try {
      await navigator.clipboard.writeText(gameUrl);
    } catch {
      // fallback silencioso
    }
  }, [gameUrl, gameId, amount]);

  const handleDiscord = useCallback(async () => {
    trackEvent('share_win_click', { platform: 'discord', game_id: gameId, prize_amount: amount });
    try {
      await navigator.clipboard.writeText(shareText + '\n' + gameUrl);
    } catch {
      // fallback silencioso
    }
  }, [shareText, gameUrl, gameId, amount]);

  return (
    <div className="flex gap-2 mt-2" data-testid="share-win-buttons">
      <button
        data-testid="share-win-btn-twitter"
        onClick={handleTwitter}
        className="cb-btn cb-btn-sm"
      >
        X
      </button>
      <button
        data-testid="share-win-btn-telegram"
        onClick={handleTelegram}
        className="cb-btn cb-btn-sm"
      >
        Telegram
      </button>
      <button
        data-testid="share-win-btn-discord"
        onClick={handleDiscord}
        className="cb-btn cb-btn-sm"
      >
        Discord
      </button>
      <button
        data-testid="share-win-btn-copy"
        onClick={handleCopy}
        className="cb-btn cb-btn-sm"
      >
        Copy
      </button>
    </div>
  );
}
