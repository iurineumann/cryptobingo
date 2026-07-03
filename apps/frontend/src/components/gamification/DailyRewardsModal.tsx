import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDailyRewards } from '../../hooks/useDailyRewards';
import type { DailyRewardStatus } from '../../services/api';

interface DailyRewardsModalProps {
    readonly open: boolean;
    readonly onClose: () => void;
}

export function DailyRewardsModal({ open, onClose }: DailyRewardsModalProps) {
    const { t } = useTranslation();
    const { status, loading, claiming, error, claim } = useDailyRewards();
    const [claimedToast, setClaimedToast] = React.useState<string | null>(null);

    if (!open) return null;

    const handleClaim = useCallback(async () => {
        const result = await claim();
        if (result) {
            setClaimedToast(`Dia ${result.day + 1}: +${result.reward.xp} XP`);
            setTimeout(() => setClaimedToast(null), 3000);
        }
    }, [claim]);

    const handleOverlayKeyDown = useCallback(
        (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
        [onClose],
    );

    const renderSkeleton = () => (
        <div className="daily-rewards-grid">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={`daily-skel-${String(i)}`} className="cb-skeleton" style={{ height: 100 }} data-testid={`daily-rewards-skeleton-${i}`} />
            ))}
        </div>
    );

    const renderDayCard = (reward: DailyRewardStatus['rewards'][number], day: number) => {
        const isClaimed = status!.claimedDays.includes(day);
        const isCurrent = day === status!.currentDay;
        const isLocked = day > status!.currentDay;
        const canClaim = isCurrent && !isClaimed;
        const cardClass = [
            'daily-rewards-day',
            isClaimed ? 'claimed' : '',
            isCurrent ? 'current' : '',
            isLocked ? 'locked' : '',
        ].filter(Boolean).join(' ');

        return (
            <div key={`reward-${day}-${reward.xp}`} className={cardClass} data-testid={`daily-rewards-day-${day}`}>
                <div className="daily-rewards-day-num">{t('daily_rewards.day', { day: day + 1 })}</div>
                <div className="daily-rewards-reward">
                    <span className="daily-rewards-xp">+{reward.xp} XP</span>
                    {reward.badge && <span className="daily-rewards-badge">{t('daily_rewards.week_warrior')}</span>}
                    {reward.ticket && <span className="daily-rewards-ticket">{t('daily_rewards.reward_ticket')}</span>}
                </div>
                <div className="daily-rewards-status">
                    {isClaimed && <span className="daily-rewards-check">&#10003;</span>}
                    {canClaim && (
                        <button
                            className="cb-btn cb-btn-sm"
                            onClick={handleClaim}
                            disabled={claiming}
                            data-testid={`daily-rewards-claim-${day}`}
                        >
                            {claiming ? '...' : t('daily_rewards.claim')}
                        </button>
                    )}
                    {isLocked && <span className="daily-rewards-lock">&#128274;</span>}
                </div>
            </div>
        );
    };

    const renderGrid = () => (
        <div className="daily-rewards-grid" data-testid="daily-rewards-grid">
            {status!.rewards.map((reward, day) => renderDayCard(reward, day))}
        </div>
    );

    const renderBody = () => {
        if (loading) return renderSkeleton();
        if (status) return renderGrid();
        return <div className="cb-empty" data-testid="daily-rewards-empty">{t('common.loading')}</div>;
    };

    return (
        <div
            className="cb-modal-overlay"
            data-testid="daily-rewards-modal"
            role="presentation" // NOSONAR — overlay backdrop, não img
            onClick={onClose}
            onKeyDown={handleOverlayKeyDown}
        >
            <div
                className="cb-modal"
                role="dialog" // NOSONAR — <dialog> nativo incompatível com CSS do modal
                aria-modal="true"
                aria-label={t('daily_rewards.title')}
                onClick={e => e.stopPropagation()}
                onKeyDown={handleOverlayKeyDown}
            >
                <button className="cb-modal-close" onClick={onClose} data-testid="daily-rewards-close" aria-label={t('common.close')}>&times;</button>
                <h2 className="cb-modal-title">{t('daily_rewards.title')}</h2>
                <p className="cb-modal-subtitle">{t('daily_rewards.subtitle')}</p>

                {error && <div className="cb-error-banner" data-testid="daily-rewards-error">{error}</div>}
                {claimedToast && <div className="cb-success-banner" data-testid="daily-rewards-toast">{claimedToast}</div>}

                {renderBody()}
            </div>
        </div>
    );
}
