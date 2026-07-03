import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackEvent, setAdblockDetected } from '../analytics';

describe('trackEvent', () => {
  beforeEach(() => {
    setAdblockDetected(false);
    vi.stubGlobal('window', { ...window, gtag: vi.fn() });
  });

  it('chama gtag com nome e params', () => {
    trackEvent('test_event', { key: 'value' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'test_event', { key: 'value' });
  });

  it('nao quebra se gtag nao existe', () => {
    vi.stubGlobal('window', { ...window, gtag: undefined });
    expect(() => trackEvent('test_event')).not.toThrow();
  });

  it('usa proxy fallback quando adblock detectado', async () => {
    setAdblockDetected(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    trackEvent('test_event', { key: 'value' });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test_event', params: { key: 'value' } }),
      keepalive: true,
    });
  });

  it('usa gtag quando adblock NAO detectado', () => {
    setAdblockDetected(false);
    const gtag = vi.fn();
    vi.stubGlobal('window', { ...window, gtag });

    trackEvent('normal_event');

    expect(gtag).toHaveBeenCalled();
  });
});
