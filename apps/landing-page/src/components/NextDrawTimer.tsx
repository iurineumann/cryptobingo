import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const DRAW_INTERVAL = 5 * 60 * 1000;

export default function NextDrawTimer({ compact }: { readonly compact?: boolean }) {
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

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400" data-testid="header-timer">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden="true" />
        {t('hero.next_draw', { time: `${min}:${sec.toString().padStart(2, '0')}` })}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 text-brand-300 text-xs px-3 py-1.5" data-testid="next-draw-timer">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
      {t('hero.next_draw', { time: `${min}:${sec.toString().padStart(2, '0')}` })}
    </span>
  );
}
