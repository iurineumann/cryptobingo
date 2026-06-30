import { useTranslation } from 'react-i18next';
import { getEffectiveExplorerUrl } from '../../utils/explorerStore';

export interface EventFeedWinner {
    account:      string;
    pattern_name: string;
    status:       'preparing' | 'confirming' | 'confirmed';
    tx_id?:       string;
    amount?:      string;
    currency?:    string;
}

interface Props {
    readonly loading:  boolean;
    readonly winners:  EventFeedWinner[];
    readonly error:    string | null;
    readonly gameId?:  string;
}

/** Traduz nome de estágio raw (stage_N) para i18n. Fallback p/ nome original. */
function fmtPatternName(t: ReturnType<typeof useTranslation>['t'], name: string): string {
  const m = name.match(/^stage_(\d+)$/);
  if (m) return t('game_room.stage_label', { stage: parseInt(m[1], 10) });
  return name;
}

export default function EventFeed({ loading, winners, error }: Props) {
    const { t } = useTranslation();

    if (loading) {
        return (
            <div className="gr-event-feed" data-testid="gr-event-feed-loading">
                {Array.from({ length: 3 }).map((_, i) => (
                    <span key={i} className="ev cb-shimmer" style={{ display: 'block', height: '1rem', marginBottom: '0.25rem' }} />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="gr-event-feed" data-testid="gr-event-feed-error">
                <span className="ev" style={{ color: 'var(--cb-danger)' }}>{error}</span>
            </div>
        );
    }

    if (winners.length === 0) {
        return (
            <div className="gr-event-feed" data-testid="gr-event-feed-empty">
                <span className="ev">{t('game_room.social_feed_empty') ?? 'Ninguém ganhou ainda'}</span>
            </div>
        );
    }

    const explorerUrl = getEffectiveExplorerUrl();

    return (
        <div className="gr-event-feed" data-testid="gr-event-feed" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {winners.map((w, idx) => (
                <span key={`${w.account}-${w.pattern_name}-${idx}`} className="ev" data-testid={`gr-event-feed-item-${idx}`}>
                    <span>{w.account} • {fmtPatternName(t, w.pattern_name)}</span>
                    {w.status === 'preparing' && (
                        <><span className="cb-spinner" style={{ width: '0.6rem', height: '0.6rem', display: 'inline-block', marginLeft: '0.3rem', verticalAlign: 'middle', borderWidth: '1.5px' }} /> {t('game_room.prize_preparing')}</>
                    )}
                    {w.status === 'confirming' && (
                        <><span className="cb-spinner" style={{ width: '0.6rem', height: '0.6rem', display: 'inline-block', marginLeft: '0.3rem', verticalAlign: 'middle', borderWidth: '1.5px' }} /> {t('game_room.prize_confirming')}</>
                    )}
                    {w.status === 'confirmed' && w.tx_id && (
                        <>
                            {w.amount} {w.currency ?? ''}
                            <a
                                href={`${explorerUrl}/transaction/${w.tx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="gr-event-feed-link"
                                data-testid={`gr-event-feed-tx-${idx}`}
                            >
                                🔗
                            </a>
                        </>
                    )}
                </span>
            ))}
        </div>
    );
}
