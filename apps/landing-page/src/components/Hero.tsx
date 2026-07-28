import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import NextDrawTimer from '@/components/NextDrawTimer';

const DEMO_SEQ = [42, 17, 64, 8, 33, 71, 51, 22];

const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)', I: 'var(--color-bingo-i)', N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)', O: 'var(--color-bingo-o)',
};

function getCol(n: number) {
  if (n <= 15) return 'B'; if (n <= 30) return 'I'; if (n <= 45) return 'N';
  if (n <= 60) return 'G'; return 'O';
}

function HeroBall() {
  const [idx, setIdx] = useState(0);
  const ballRef       = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => setIdx(x => (x + 1) % DEMO_SEQ.length), 2200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!ballRef.current) return;
    const el = ballRef.current;
    el.classList.remove('gr-drop'); void el.offsetWidth; el.classList.add('gr-drop');
  }, [idx]);
  const n = DEMO_SEQ[idx], col = getCol(n), color = BINGO_COLORS[col];
  return (
    <div className="landing-hero-ball-wrap" style={{ '--ball-color': color } as React.CSSProperties}>
      <div className="gr-ball-halo" />
      <div ref={ballRef} className="gr-ball-hero gr-drop">
        <div className="ball-surface" />
        <span className="ball-letter">{col}</span>
        <span className="ball-number">{n}</span>
      </div>
    </div>
  );
}

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
  const [showHeroBall, setShowHeroBall] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const h = hero || {
    title: t('hero.title'),
    subtitle: t('hero.subtitle'),
    cta_text: t('hero.cta_text'),
    cta_link: 'https://test.cryptobingo.bet',
  };

  // Mostra HeroBall apos 3s (video pode nunca carregar em conexoes lentas)
  useEffect(() => {
    const timer = setTimeout(() => setShowHeroBall(true), 3000);
    return () => clearTimeout(timer);
  }, []);

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
              {!videoError && (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full rounded-2xl border border-surface-700/50 shadow-2xl shadow-brand-500/10"
                  onError={() => setVideoError(true)}
                  onCanPlay={() => setShowHeroBall(false)}
                >
                  <source src="/images/hero-loop.webm" type="video/webm" />
                  <source src="/images/hero-loop.mp4" type="video/mp4" />
                </video>
              )}
              {(videoError || showHeroBall) && <HeroBall />}
              {!showHeroBall && !videoError && (
                <div className="hidden absolute inset-0 items-center justify-center bg-surface-950/60 rounded-2xl border border-surface-700/50" data-testid="hero-image-fallback">
                  <div className="text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 flex items-center justify-center mx-auto mb-3 border border-brand-500/20">
                      <Play size={32} className="text-accent-400 ml-1" />
                    </div>
                    <p className="text-sm text-slate-500">Game Preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
