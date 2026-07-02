import { useEffect, useState } from 'react';
import { Lightbulb, ThumbsUp, Users, Sparkles } from 'lucide-react';
import { getStats, type Stats } from '@/lib/api';

const statConfig: {
    get: (s: Stats) => number;
    icon: typeof Lightbulb;
    label: string;
}[] = [
    { get: (s) => s.total_ideas, icon: Lightbulb, label: 'Ideas Submitted' },
    { get: (s) => s.total_votes, icon: ThumbsUp, label: 'Votes Cast' },
    { get: (s) => s.total_subscribers, icon: Users, label: 'Subscribers' },
    { get: (s) => s.approved_ideas, icon: Sparkles, label: 'Approved' },
];

export default function StatsBar() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        getStats()
            .then(setStats)
            .catch(() => setError(true));
    }, []);

    if (error) return null;

    return (
        <section className="py-12 bg-brand-700">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {statConfig.map((s, i) => {
                        const Icon = s.icon;
                        const value = stats ? s.get(stats) : null;
                        return (
                            <div
                                key={i}
                                className="flex flex-col items-center text-center"
                            >
                                <Icon className="text-white/70 mb-2" size={24} />
                                <span className="text-2xl font-bold text-white">
                                    {value !== null ? value : '--'}
                                </span>
                                <span className="text-sm text-brand-200">
                                    {s.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
