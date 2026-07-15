import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGameStats, type GameStats } from '@/lib/api';

function formatCompact(n: number | undefined): string {
    if (n === undefined) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export default function StatsBar() {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const [stats, setStats] = useState<GameStats | null>(null);
    const [animCounts, setAnimCounts] = useState<number[]>([]);
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        getGameStats()
            .then(setStats)
            .catch(() => setStats(null));
    }, []);

    const targets = stats
        ? [
              stats.totals.total_games,
              stats.totals.total_players,
              ...stats.by_token.flatMap((t) => [t.total_prizes, Math.round(t.avg_rtp_pct)]),
          ]
        : [];

    useEffect(() => {
        if (!ref.current || hasAnimated) return;

        const node = ref.current;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setHasAnimated(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.3 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [stats, hasAnimated]);

    useEffect(() => {
        if (!hasAnimated || targets.length === 0) return;

        const duration = 2000;
        let start: number | null = null;

        function step(ts: number) {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);

            setAnimCounts(targets.map((t) => Math.floor(t * progress)));

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                setAnimCounts(targets);
            }
        }

        requestAnimationFrame(step);
    }, [hasAnimated, targets]);

    const hasData = stats !== null;

    return (
        <section ref={ref} className="py-12 bg-brand-700">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid grid-cols-2 gap-8 mb-8">
                    <div
                        data-testid="stat-total-games"
                        className="flex flex-col items-center text-center"
                    >
                        <Gamepad2 className="text-white/70 mb-2" size={24} />
                        <span className="text-2xl font-bold text-white">
                            {hasData ? formatCompact(animCounts[0]) : '—'}
                        </span>
                        <span className="text-sm text-brand-200">
                            {t('stats.games_played')}
                        </span>
                    </div>
                    <div
                        data-testid="stat-total-players"
                        className="flex flex-col items-center text-center"
                    >
                        <Users className="text-white/70 mb-2" size={24} />
                        <span className="text-2xl font-bold text-white">
                            {hasData ? formatCompact(animCounts[1]) : '—'}
                        </span>
                        <span className="text-sm text-brand-200">
                            {t('stats.active_players')}
                        </span>
                    </div>
                </div>

                {hasData && stats.by_token.length > 0 && (
                    <div className="border-t border-brand-600 pt-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            {stats.by_token.map((tokenStat, i) => {
                                const baseIdx = 2 + i * 2;
                                return (
                                    <div
                                        key={tokenStat.token}
                                        data-testid={`stat-token-${tokenStat.token.toLowerCase()}`}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">
                                            {tokenStat.token}
                                        </span>
                                        <span className="text-xl font-bold text-white">
                                            {formatCompact(animCounts[baseIdx] ?? 0)}
                                        </span>
                                        <span className="text-xs text-brand-200">
                                            {t('stats.token_prizes', { token: tokenStat.token })}
                                        </span>
                                    </div>
                                );
                            })}
                            {stats.by_token.map((tokenStat, i) => {
                                const baseIdx = 2 + i * 2;
                                return (
                                    <div
                                        key={`${tokenStat.token}-rtp`}
                                        data-testid={`stat-token-rtp-${tokenStat.token.toLowerCase()}`}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">
                                            {tokenStat.token}
                                        </span>
                                        <span className="text-xl font-bold text-white">
                                            {`${animCounts[baseIdx + 1] ?? 0}%`}
                                        </span>
                                        <span className="text-xs text-brand-200">
                                            {t('stats.token_rtp', { token: tokenStat.token })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!hasData && (
                    <p className="text-center text-sm text-brand-300">
                        {t('stats.loading')}
                    </p>
                )}
            </div>
        </section>
    );
}
