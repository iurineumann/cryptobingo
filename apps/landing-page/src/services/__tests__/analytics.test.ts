import { describe, it, expect, beforeEach } from 'vitest';
import { trackEvent } from '../analytics';

beforeEach(() => {
  delete (window as any).dataLayer;
  delete (window as any)._analyticsConsented;
});

describe('trackEvent', () => {
  it('should push event to dataLayer when consentimento granted', () => {
    window.dataLayer = [];
    window._analyticsConsented = true;
    trackEvent('cta_click', { cta_location: 'hero', locale: 'pt' });
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'cta_click',
      cta_location: 'hero',
      locale: 'pt',
    });
  });

  it('should not push when consentimento not granted', () => {
    window.dataLayer = [];
    window._analyticsConsented = false;
    trackEvent('cta_click', { cta_location: 'hero' });
    expect(window.dataLayer).toHaveLength(0);
  });

  it('should not push when dataLayer undefined', () => {
    trackEvent('cta_click', { cta_location: 'hero' });
    expect(() => trackEvent('cta_click', {})).not.toThrow();
  });

  it('should not throw when params is empty', () => {
    window.dataLayer = [];
    window._analyticsConsented = true;
    expect(() => trackEvent('test_event')).not.toThrow();
  });
});
