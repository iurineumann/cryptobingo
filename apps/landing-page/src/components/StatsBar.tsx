import { useEffect, useState } from 'react';
import { Gamepad2, Coins, Users, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGameStats } from '@/lib/api';

interface GameStat {
    icon: typeof Gamepad2;
    labelKey: string;
    value: number | null;
}

function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export default function StatsBar() {
    const { t } = useTranslation();
    const [statsData, setStatsData] = useState<GameStat[] | null>(null);
    const [animCounts, setAnimCounts] = useState<number[]>([0, 0, 0, 0]);

    useEffect(() => {
        getGameStats()
            .then((data) => {
                setStatsData([
                    { icon: Gamepad2, labelKey: 'stats.games_played', value: data.total_games },
                    { icon: Coins, labelKey: 'stats.prizes_paid', value: data.total_prizes },
                    { icon: Users, labelKey: 'stats.active_players', value: data.total_players },
                    { icon: Percent, labelKey: 'stats.rtp', value: Math.round(data.avg_rtp_pct) },
                ]);
            })
            .catch(() => {
                setStatsData(null);
            });
    }, []);

    const displayStats = statsData ?? [
        { icon: Gamepad2, labelKey: 'stats.games_played', value: null },
        { icon: Coins, labelKey: 'stats.prizes_paid', value: null },
        { icon: Users, labelKey: 'stats.active_players', value: null },
        { icon: Percent, labelKey: 'stats.rtp', value: null },
    ];

    useEffect(() => {
        const targets = displayStats.map(s => s.value ?? 0);
        const duration = 1200;
        const steps = 30;
        let step = 0;

        const timer = setInterval(() => {
            step++;
            setAnimCounts(targets.map(t => Math.min(Math.floor((t / steps) * step), t)));
            if (step >= steps) clearInterval(timer);
        }, duration / steps);

        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statsData]);

    const hasData = displayStats[0].value !== null;

    return (
        <section className="py-12 bg-brand-700">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {displayStats.map((s, i) => {
                        const Icon = s.icon;
                        return (
                            <div
                                key={i}
                                data-testid={`stat-${i}`}
                                className="flex flex-col items-center text-center"
                            >
                                <Icon className="text-white/70 mb-2" size={24} />
                                <span className="text-2xl font-bold text-white">
                                    {hasData
                                        ? (s.labelKey === 'stats.rtp'
                                            ? `${animCounts[i]}%`
                                            : formatCompact(animCounts[i]))
                                        : '—'}
                                </span>
                                <span className="text-sm text-brand-200">
                                    {t(s.labelKey)}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {!hasData && (
                    <p className="mt-6 text-center text-sm text-brand-300">
                        {t('stats.loading')}
                    </p>
                )}
            </div>
        </section>
    );
}
