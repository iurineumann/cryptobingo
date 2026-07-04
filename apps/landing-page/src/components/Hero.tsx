import { useTranslation } from 'react-i18next';
import NextDrawTimer from '@/components/NextDrawTimer';

interface HeroProps {
  hero?: {
    title: string;
    subtitle: string;
    cta_text: string;
    cta_link: string;
  };
}

export default function Hero({ hero }: HeroProps) {
  const { t } = useTranslation();
  const h = hero || {
    title: t('hero.title'),
    subtitle: t('hero.subtitle'),
    cta_text: t('hero.cta_text'),
    cta_link: 'https://test.cryptobingo.bet',
  };

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-accent-500/5 blur-3xl" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 py-20">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-block rounded-full bg-brand-500/10 text-brand-300 text-xs px-3 py-1">
            {t('hero.badge')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 text-accent-300 text-xs font-semibold px-3 py-1">
            RTP 85%
          </span>
          <NextDrawTimer />
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white max-w-4xl">
          {h.title}
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-slate-400 max-w-2xl">
          {h.subtitle}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
          <a
            href={h.cta_link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="hero-cta"
            className="inline-flex items-center bg-accent-400 text-surface-900 font-semibold px-6 py-3 rounded-xl hover:bg-accent-300 transition animate-[pulse-cta_2s_ease-in-out_infinite]"
          >
            {h.cta_text}
          </a>
          <a
            href="#features"
            data-testid="hero-learn-more"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            {t('hero.learn_more')}
          </a>
        </div>
      </div>
    </section>
  );
}
