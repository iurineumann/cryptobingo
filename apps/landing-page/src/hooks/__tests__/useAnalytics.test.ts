import { renderHook } from '@testing-library/react';
import { useAnalytics } from '../useAnalytics';

beforeEach(() => {
  (window as any).dataLayer = [];
  (window as any)._analyticsConsented = true;
});

it('should return trackEvent function', () => {
  const { result } = renderHook(() => useAnalytics());
  expect(typeof result.current.trackEvent).toBe('function');
});

it('should enrich evento with locale', () => {
  const { result } = renderHook(() => useAnalytics('en'));
  result.current.trackEvent('cta_click', { cta_location: 'hero' });
  expect(window.dataLayer[0]).toMatchObject({
    event: 'cta_click',
    cta_location: 'hero',
    locale: 'en',
  });
});
