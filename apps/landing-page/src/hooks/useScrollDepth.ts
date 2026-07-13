import { useEffect, useRef } from 'react';

const MILESTONES = [25, 50, 75, 90, 100] as const;

export function useScrollDepth(
  trackEvent: (name: string, params?: Record<string, unknown>) => void,
  pagePath: string,
  locale?: string,
): void {
  const firedDepths = useRef(new Set<string>());

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollY = window.scrollY;
      const clientHeight = window.innerHeight;

      const scrollableHeight = scrollHeight - clientHeight;
      if (scrollableHeight <= 0) return;

      const depth = (scrollY / scrollableHeight) * 100;

      for (const milestone of MILESTONES) {
        const key = `${milestone}`;
        if (depth >= milestone && !firedDepths.current.has(key)) {
          firedDepths.current.add(key);
          trackEvent('scroll_depth', { depth: `${milestone}%`, path: pagePath, locale });
        }
      }

      if (
        scrollHeight - scrollY - clientHeight < 50
        && !firedDepths.current.has('bottom')
      ) {
        firedDepths.current.add('bottom');
        trackEvent('scroll_depth', { depth: 'bottom', path: pagePath, locale });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trackEvent, pagePath, locale]);
}
