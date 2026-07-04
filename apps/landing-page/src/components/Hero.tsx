import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
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
  const { locale } = useParams();
  const { trackEvent } = useAnalytics(locale);
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
      <div className="relative max-w-7xl mx-auto px-4 py-20 w-full">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 min-w-0">
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
                onClick={() => trackEvent('cta_click', { cta_location: 'hero' })}
              >
                {h.cta_text}
              </a>
              <a
                href="#features"
                data-testid="hero-learn-more"
                className="inline-flex items-center border border-accent-400/40 text-accent-300 font-semibold px-6 py-3 rounded-xl hover:bg-accent-500/10 hover:border-accent-400 transition-all"
                onClick={() => trackEvent('cta_click', { cta_location: 'hero_learn' })}
              >
                {t('hero.learn_more')}
              </a>
            </div>
          </div>
          <div className="hidden md:block flex-1 max-w-md" data-testid="hero-image">
            <div className="relative group">
              <img
                src="/images/game-screenshot.png"
                alt="CryptoBingo game screenshot"
                className="w-full rounded-2xl border border-surface-700/50 shadow-2xl shadow-brand-500/10"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
              <div className="hidden absolute inset-0 items-center justify-center bg-surface-950/60 rounded-2xl border border-surface-700/50" data-testid="hero-image-fallback">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 flex items-center justify-center mx-auto mb-3 border border-brand-500/20">
                    <Play size={32} className="text-accent-400 ml-1" />
                  </div>
                  <p className="text-sm text-slate-500">Game Preview</p>
                </div>
              </div>
              <button
                data-testid="hero-play-overlay"
                className="absolute inset-0 flex items-center justify-center bg-surface-950/0 hover:bg-surface-950/40 rounded-2xl transition-all duration-300 group"
                onClick={() => trackEvent('cta_click', { cta_location: 'hero_video' })}
              >
                <div className="w-16 h-16 rounded-full bg-accent-500/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg shadow-accent-500/30">
                  <Play size={28} className="text-surface-900 ml-1" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
