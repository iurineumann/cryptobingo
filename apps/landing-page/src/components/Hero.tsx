import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface HeroProps {
  hero?: {
    title: string;
    subtitle: string;
    cta_text: string;
    cta_link: string;
  };
}

const DRAW_INTERVAL = 5 * 60 * 1000;

function NextDrawTimer() {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const next = Math.ceil(now / DRAW_INTERVAL) * DRAW_INTERVAL;
      setSeconds(Math.max(0, Math.floor((next - now) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 text-brand-300 text-xs px-3 py-1.5" data-testid="next-draw-timer">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
      {t('hero.next_draw', { time: `${min}:${sec.toString().padStart(2, '0')}` })}
    </span>
  );
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
