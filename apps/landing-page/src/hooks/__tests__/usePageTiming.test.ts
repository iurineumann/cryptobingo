import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTiming } from '../usePageTiming';

describe('usePageTiming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as any).dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).dataLayer;
    delete (window as any)._analyticsConsented;
  });

  it('should fire 10s event after 10 seconds', () => {
    const trackEvent = vi.fn();
    renderHook(() => usePageTiming(trackEvent, '/test'));

    vi.advanceTimersByTime(10000);

    expect(trackEvent).toHaveBeenCalledWith('page_timing', {
      seconds: 10,
      path: '/test',
    });
  });

  it('should fire 30s event after 30 seconds', () => {
    const trackEvent = vi.fn();
    renderHook(() => usePageTiming(trackEvent, '/test'));

    vi.advanceTimersByTime(30000);

    expect(trackEvent).toHaveBeenCalledWith('page_timing', {
      seconds: 30,
      path: '/test',
    });
  });

  it('should fire multiple timing events in order', () => {
    const trackEvent = vi.fn();
    renderHook(() => usePageTiming(trackEvent, '/test'));

    vi.advanceTimersByTime(120000);

    expect(trackEvent).toHaveBeenCalledTimes(4);
    expect(trackEvent.mock.calls[0]).toEqual(['page_timing', { seconds: 10, path: '/test' }]);
    expect(trackEvent.mock.calls[1]).toEqual(['page_timing', { seconds: 30, path: '/test' }]);
    expect(trackEvent.mock.calls[2]).toEqual(['page_timing', { seconds: 60, path: '/test' }]);
    expect(trackEvent.mock.calls[3]).toEqual(['page_timing', { seconds: 120, path: '/test' }]);
  });

  it('should deduplicate - fire each threshold only once', () => {
    const trackEvent = vi.fn();
    renderHook(() => usePageTiming(trackEvent, '/test'));

    vi.advanceTimersByTime(60000);
    expect(trackEvent).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(10000);
    expect(trackEvent).toHaveBeenCalledTimes(3);
  });

  it('should fire 180s and 300s thresholds', () => {
    const trackEvent = vi.fn();
    renderHook(() => usePageTiming(trackEvent, '/test'));

    vi.advanceTimersByTime(300000);

    expect(trackEvent).toHaveBeenCalledTimes(6);
    expect(trackEvent).toHaveBeenCalledWith('page_timing', { seconds: 180, path: '/test' });
    expect(trackEvent).toHaveBeenCalledWith('page_timing', { seconds: 300, path: '/test' });
  });

  it('should clean up interval on unmount', () => {
    const trackEvent = vi.fn();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => usePageTiming(trackEvent, '/test'));
    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});
