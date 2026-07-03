import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '~/services/analytics';

interface ShareWinButtonProps {
  amount: number;
  gameId: string;
  gameUrl: string;
}

export function ShareWinButton({ amount, gameId, gameUrl }: ShareWinButtonProps) {
  const { t } = useTranslation();
  const shareText = t('share_win.text', { amount: String(amount) });

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
        {t('share_win.twitter_label')}
      </button>
      <button
        data-testid="share-win-btn-telegram"
        onClick={handleTelegram}
        className="cb-btn cb-btn-sm"
      >
        {t('share_win.telegram_label')}
      </button>
      <button
        data-testid="share-win-btn-discord"
        onClick={handleDiscord}
        className="cb-btn cb-btn-sm"
      >
        {t('share_win.discord_label')}
      </button>
      <button
        data-testid="share-win-btn-copy"
        onClick={handleCopy}
        className="cb-btn cb-btn-sm"
      >
        {t('share_win.copy_label')}
      </button>
    </div>
  );
}
