import { useTranslation } from 'react-i18next';

export default function Roadmap() {
  const { t } = useTranslation();

  const items = [
    {
      date: t('roadmap.items.0.date'),
      title: t('roadmap.items.0.title'),
      description: t('roadmap.items.0.description'),
    },
    {
      date: t('roadmap.items.1.date'),
      title: t('roadmap.items.1.title'),
      description: t('roadmap.items.1.description'),
    },
    {
      date: t('roadmap.items.2.date'),
      title: t('roadmap.items.2.title'),
      description: t('roadmap.items.2.description'),
    },
  ];

  return (
    <section className="py-20 bg-surface-950">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-center">
          {t('roadmap.title')}
        </h2>
        <p className="text-secondary mb-16 max-w-xl mx-auto text-center">
          {t('roadmap.description')}
        </p>
        <div className="relative">
          <div className="absolute left-4 md:left-1/2 w-0.5 bg-surface-700 h-full top-0 -translate-x-1/2" />
          {items.map((item, i) => (
            <div
              key={item.title}
              className={`relative pl-12 md:pl-0 mb-12 ${
                i % 2 === 0
                  ? 'md:pr-[50%] md:pl-0'
                  : 'md:pl-[50%]'
              }`}
            >
              <div
                className={`absolute w-3 h-3 rounded-full bg-brand-500 z-10 top-6 ${
                  i % 2 === 0
                    ? 'left-[10px] md:right-full md:mr-[-6px] md:left-auto'
                    : 'left-[10px] md:left-0 md:ml-[-6px]'
                }`}
              />
              <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/50">
                <span className="text-xs text-brand-300 bg-brand-500/10 px-3 py-1 rounded-full">
                  {item.date}
                </span>
                <h3 className="text-lg font-semibold text-white mt-2">
                  {item.title}
                </h3>
                <p className="text-sm text-secondary mt-1">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
