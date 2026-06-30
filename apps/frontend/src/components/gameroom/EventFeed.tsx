import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { getEffectiveExplorerUrl } from '../../utils/explorerStore';

export interface EventFeedWinner {
    account:      string;
    pattern_name: string;
    tx_id?:       string;
}

interface Props {
    readonly loading:  boolean;
    readonly winners:  EventFeedWinner[];
    readonly error:    string | null;
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
                    {w.tx_id ? (
                        <a
                            href={`${explorerUrl}/transaction/${w.tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gr-event-feed-link"
                            data-testid={`gr-event-feed-tx-${idx}`}
                        >
                            {w.account} • {w.pattern_name}
                            <ExternalLink className="size-3 shrink-0" style={{ display: 'inline', marginLeft: '0.2rem', verticalAlign: 'middle' }} />
                        </a>
                    ) : (
                        <>
                            <span className="cb-spinner" style={{ width: '0.6rem', height: '0.6rem', display: 'inline-block', marginRight: '0.3rem', verticalAlign: 'middle', borderWidth: '1.5px' }} />
                            {w.account} • {w.pattern_name}
                        </>
                    )}
                </span>
            ))}
        </div>
    );
}
