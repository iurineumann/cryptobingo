import { useTranslation } from 'react-i18next';

type MilestoneStatus = 'completed' | 'in-progress' | 'planned';

function statusBar(status: MilestoneStatus): { label: string; width: string; color: string } {
  if (status === 'completed') return { label: '100%', width: 'w-full', color: 'bg-brand-500' };
  if (status === 'in-progress') return { label: '60%', width: 'w-3/5', color: 'bg-accent-400' };
  return { label: '0%', width: 'w-0', color: 'bg-surface-600' };
}

export default function Roadmap() {
  const { t } = useTranslation();

  const items: Array<{
    date: string;
    title: string;
    description: string;
    status: MilestoneStatus;
  }> = [
    {
      date: t('roadmap.items.0.date'),
      title: t('roadmap.items.0.title'),
      description: t('roadmap.items.0.description'),
      status: 'completed',
    },
    {
      date: t('roadmap.items.1.date'),
      title: t('roadmap.items.1.title'),
      description: t('roadmap.items.1.description'),
      status: 'in-progress',
    },
    {
      date: t('roadmap.items.2.date'),
      title: t('roadmap.items.2.title'),
      description: t('roadmap.items.2.description'),
      status: 'planned',
    },
  ];

  const completedCount = items.filter(i => i.status === 'completed').length;
  const pct = Math.round((completedCount / items.length) * 100);

  return (
    <section className="py-20 bg-surface-950" aria-labelledby="roadmap-title">
      <div className="max-w-4xl mx-auto px-4">
        <h2 id="roadmap-title" className="text-3xl sm:text-4xl font-bold text-white mb-4 text-center">
          {t('roadmap.title')}
        </h2>
        <p className="text-secondary mb-8 max-w-xl mx-auto text-center">
          {t('roadmap.description')}
        </p>

        <div className="max-w-md mx-auto mb-16" data-testid="roadmap-progress">
          <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
            <span>{t('roadmap.progress_label', { pct })}</span>
            <span>{completedCount}/{items.length} {t('roadmap.milestones')}</span>
          </div>
          <div className="w-full bg-surface-800 rounded-full h-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-500 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-4 md:left-1/2 w-0.5 bg-surface-700 h-full top-0 -translate-x-1/2" />
          {items.map((item, i) => {
            const bar = statusBar(item.status);
            return (
              <div
                key={item.title}
                className={`relative pl-12 md:pl-0 mb-12 ${
                  i % 2 === 0
                    ? 'md:pr-[50%] md:pl-0'
                    : 'md:pl-[50%]'
                }`}
              >
                <div
                  className={`absolute w-3 h-3 rounded-full z-10 top-6 ${
                    item.status === 'completed' ? 'bg-brand-500' :
                    item.status === 'in-progress' ? 'bg-accent-400' : 'bg-surface-600'
                  } ${
                    i % 2 === 0
                      ? 'left-[10px] md:right-full md:mr-[-6px] md:left-auto'
                      : 'left-[10px] md:left-0 md:ml-[-6px]'
                  }`}
                />
                <div className={`rounded-xl p-6 border ${
                  item.status === 'completed' ? 'bg-brand-500/5 border-brand-500/20' :
                  item.status === 'in-progress' ? 'bg-accent-500/5 border-accent-500/20' :
                  'bg-surface-800 border-surface-700/50'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-3 py-1 rounded-full ${
                      item.status === 'completed' ? 'text-brand-300 bg-brand-500/10' :
                      item.status === 'in-progress' ? 'text-accent-300 bg-accent-500/10' :
                      'text-slate-400 bg-surface-700/50'
                    }`}>
                      {item.date}
                    </span>
                    <span className="text-xs text-slate-500">{bar.label}</span>
                  </div>
                  <div className="w-full bg-surface-800 rounded-full h-1.5 mb-3">
                    <div className={`h-1.5 rounded-full ${bar.color}`} style={{ width: bar.label }} />
                  </div>
                  <h3 className={`text-lg font-semibold mt-2 ${
                    item.status === 'completed' ? 'text-white' :
                    item.status === 'in-progress' ? 'text-white' : 'text-slate-400'
                  }`}>
                    {item.title}
                  </h3>
                  <p className={`text-sm mt-1 ${
                    item.status === 'completed' ? 'text-slate-300' :
                    item.status === 'in-progress' ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
