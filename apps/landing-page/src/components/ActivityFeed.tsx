import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Clock } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';

interface ActivityItem {
  id: string;
  player: string;
  prize: number;
  timestamp: Date;
}

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: '1', player: '0xPlayer...', prize: 250, timestamp: new Date(Date.now() - 30_000) },
  { id: '2', player: 'BingoFan42', prize: 100, timestamp: new Date(Date.now() - 120_000) },
  { id: '3', player: 'CryptoWin', prize: 500, timestamp: new Date(Date.now() - 300_000) },
  { id: '4', player: 'LuckyStar', prize: 75, timestamp: new Date(Date.now() - 600_000) },
  { id: '5', player: 'ChainPlayer', prize: 320, timestamp: new Date(Date.now() - 900_000) },
];

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

interface ActivityFeedProps {
  items?: ActivityItem[];
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  const { t } = useTranslation();
  const { trackEvent } = useAnalytics();

  const activity = items ?? MOCK_ACTIVITY;

  useEffect(() => {
    trackEvent('win_displayed', { item_count: activity.length });
  }, []);

  return (
    <section className="py-16 bg-surface-900/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-2 mb-8">
          <Trophy size={20} className="text-accent-400" />
          <h2 className="text-xl font-bold text-white">{t('activity_feed.title')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activity.map((item, idx) => (
            <div
              key={item.id}
              data-testid={`activity-item-${idx}`}
              className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-4 py-3 border border-surface-700/30"
            >
              <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0">
                <Trophy size={16} className="text-brand-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{item.player}</p>
                <p className="text-xs text-brand-300">{t('activity_feed.item_prize', { prize: item.prize.toLocaleString() })}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <Clock size={12} />
                {timeAgo(item.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
