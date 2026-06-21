import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLeaderboard, fetchLeaderboardXp, fetchRoomLeaderboard } from '../services/api';
import type { LeaderboardEntry, LeaderboardXpEntry } from '@cryptobingo/shared-types';
import { Medal } from 'lucide-react';

interface Props {
    roomId?: string;
}

type Tab = 'winnings' | 'xp';

const TIER_ORDER = ['Cobre','Bronze','Prata','Ouro','Platina','Esmeralda','Safira','Rubi','Diamante'];

export default function LeaderboardPage({ roomId }: Props) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>('winnings');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [xpEntries, setXpEntries] = useState<LeaderboardXpEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cachedAt, setCachedAt] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (roomId) {
                const data = await fetchRoomLeaderboard(roomId, 20);
                setEntries(data.entries);
                setXpEntries([]);
                setCachedAt(data.cached_at);
            } else if (tab === 'xp') {
                const data = await fetchLeaderboardXp(50);
                setXpEntries(data.entries);
                setEntries([]);
                setCachedAt(data.cached_at);
            } else {
                const data = await fetchLeaderboard({ limit: 50 });
                setEntries(data.entries);
                setXpEntries([]);
                setCachedAt(data.cached_at);
            }
        } catch (err: any) {
            setError(err.message ?? t('common.error'));
        } finally {
            setLoading(false);
        }
    }, [roomId, tab, t]);

    useEffect(() => { load(); }, [load]);

    const isXp = tab === 'xp';
    const data: any[] = isXp ? xpEntries : entries;

    return (
        <div
            data-testid="leaderboard-page"
            style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}
        >
            <h1
                data-testid="leaderboard-title"
                style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--cb-text-primary)' }}
            >
                {roomId ? t('leaderboard.title_room') : t('leaderboard.title_global')}
            </h1>

            {!roomId && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                        className={`cb-btn cb-btn-sm ${tab === 'winnings' ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                        onClick={() => setTab('winnings')}
                        data-testid="leaderboard-tab-winnings"
                    >
                        {t('leaderboard.tab_winnings')}
                    </button>
                    <button
                        className={`cb-btn cb-btn-sm ${tab === 'xp' ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                        onClick={() => setTab('xp')}
                        data-testid="leaderboard-tab-xp"
                    >
                        {t('leaderboard.tab_xp')}
                    </button>
                </div>
            )}

            {cachedAt && (
                <p style={{ fontSize: '0.75rem', color: 'var(--cb-text-secondary)', marginBottom: '1.5rem' }}>
                    {t('leaderboard.updated_at', { time: new Date(cachedAt).toLocaleTimeString() })}
                </p>
            )}

            {loading && (
                <div data-testid="leaderboard-loading" style={{ textAlign: 'center', padding: '3rem' }}>
                    <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
                </div>
            )}

            {error && (
                <div data-testid="leaderboard-error" style={{ color: 'var(--cb-danger)', padding: '1rem' }}>
                    {error}
                    <button
                        data-testid="leaderboard-retry"
                        onClick={load}
                        style={{ marginLeft: '1rem', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    >
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {!loading && !error && data.length === 0 && (
                <p data-testid="leaderboard-empty" style={{ color: 'var(--cb-text-secondary)', textAlign: 'center', padding: '3rem' }}>
                    {t('leaderboard.empty')}
                </p>
            )}

            {!loading && data.length > 0 && (
                <table
                    data-testid="leaderboard-table"
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}
                >
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--cb-border)', color: 'var(--cb-text-secondary)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem', width: '3rem' }}>#</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>{t('leaderboard.col_player')}</th>
                            {isXp ? (
                                <>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t('leaderboard.col_xp')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t('leaderboard.col_tier')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t('leaderboard.col_games')}</th>
                                </>
                            ) : (
                                <>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t('leaderboard.col_total_won')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{t('leaderboard.col_games_won')}</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((entry: any) => {
                            const rank = entry.rank;
                            return (
                                <tr
                                    key={isXp ? `xp-${entry.wallet}` : `${entry.wallet}-${entry.currency}`}
                                    data-testid={`leaderboard-row-${rank}`}
                                    style={{ borderBottom: '1px solid var(--cb-border)' }}
                                >
                                    <td style={{ padding: '0.75rem', fontWeight: rank <= 3 ? 700 : 400, color: rankColor(rank) }}>
                                        {rankIcon(rank)}
                                    </td>
                                    <td style={{ padding: '0.75rem' }}>
                                        <span data-testid={`leaderboard-nickname-${rank}`} style={{ fontWeight: 500 }}>
                                            {entry.nickname ?? truncateWallet(entry.wallet)}
                                        </span>
                                        {entry.nickname && (
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-secondary)' }}>
                                                {truncateWallet(entry.wallet)}
                                            </span>
                                        )}
                                    </td>
                                    {isXp ? (
                                        <>
                                            <td data-testid={`leaderboard-xp-${rank}`} style={{ padding: '0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {entry.xp.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                                <span className={`cb-tier-${tierClass(entry.tier)}`} style={{ fontSize: '0.8rem' }}>
                                                    {entry.tier}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--cb-text-secondary)' }}>
                                                {entry.games_played}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                <span data-testid={`leaderboard-total-${rank}`}>
                                                    {entry.total_won.toLocaleString(undefined, { maximumFractionDigits: 4 })} {entry.currency}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--cb-text-secondary)' }}>
                                                {entry.games_won}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function rankIcon(rank: number): React.ReactNode {
    if (rank === 1) return <Medal className="size-4 shrink-0" style={{ color: 'var(--cb-accent)' }} />;
    if (rank === 2) return <Medal className="size-4 shrink-0" style={{ color: 'var(--cb-text-secondary)' }} />;
    if (rank === 3) return <Medal className="size-4 shrink-0" style={{ color: 'var(--cb-text-tertiary)' }} />;
    return String(rank);
}

function rankColor(rank: number): string {
    if (rank === 1) return 'var(--cb-accent)';
    if (rank === 2) return 'var(--cb-text-secondary)';
    if (rank === 3) return 'var(--cb-text-tertiary)';
    return 'var(--cb-text-primary)';
}

function truncateWallet(wallet: string): string {
    if (wallet.length <= 12) return wallet;
    return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function tierClass(tier: string): string {
    return TIER_ORDER.includes(tier) ? tier.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : 'cobre';
}
