import { trackEvent as track } from '../services/analytics';

export function useAnalytics(locale?: string) {
  const trackEvent = (name: string, params?: Record<string, unknown>) => {
    track(name, { ...params, locale: locale || 'en' });
  };
  return { trackEvent };
}
