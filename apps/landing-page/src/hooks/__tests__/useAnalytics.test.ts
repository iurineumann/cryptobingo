import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnalytics } from '../useAnalytics';

describe('useAnalytics', () => {
  beforeEach(() => {
    (window as any).dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  afterEach(() => {
    delete (window as any).dataLayer;
    delete (window as any)._analyticsConsented;
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
});
