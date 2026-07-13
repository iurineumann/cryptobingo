import { useEffect, useRef } from 'react';

const THRESHOLDS = [10, 30, 60, 120, 180, 300] as const;

export function usePageTiming(
  trackEvent: (name: string, params?: Record<string, unknown>) => void,
  pagePath: string,
  locale?: string,
): void {
  const firedTimings = useRef(new Set<number>());

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      for (const threshold of THRESHOLDS) {
        if (elapsed >= threshold && !firedTimings.current.has(threshold)) {
          firedTimings.current.add(threshold);
          trackEvent('page_timing', { seconds: threshold, path: pagePath, locale });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trackEvent, pagePath, locale]);
}
