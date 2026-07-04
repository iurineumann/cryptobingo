import { useTranslation } from 'react-i18next';

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
    title: 'Provably Fair BINGO on the Blockchain',
    subtitle: 'CryptoBingo brings the classic game of BINGO to Web3. Every draw is verifiable, every prize is real, and every game is fair.',
    cta_text: 'Play Now',
    cta_link: 'https://test.cryptobingo.bet',
  };

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-accent-500/5 blur-3xl" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 py-20">
        <span className="inline-block rounded-full bg-brand-500/10 text-brand-300 text-xs px-3 py-1 mb-4">
          {t('hero.badge')}
        </span>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white max-w-4xl">
          {h.title}
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-slate-400 max-w-2xl">
          {h.subtitle}
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href={h.cta_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center bg-accent-400 text-surface-900 font-semibold px-6 py-3 rounded-xl hover:bg-accent-300 transition shadow-glow-accent"
          >
            {h.cta_text}
          </a>
          <a
            href="#features"
            className="inline-flex items-center border border-surface-500 text-white px-6 py-3 rounded-xl hover:bg-surface-800 transition"
          >
            {t('hero.learn_more')}
          </a>
        </div>
      </div>
    </section>
  );
}
