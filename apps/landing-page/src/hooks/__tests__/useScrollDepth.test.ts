import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollDepth } from '../useScrollDepth';

describe('useScrollDepth', () => {
  beforeEach(() => {
    (window as any).dataLayer = [];
    (window as any)._analyticsConsented = true;
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  afterEach(() => {
    delete (window as any).dataLayer;
    delete (window as any)._analyticsConsented;
    vi.restoreAllMocks();
  });

  it('should not fire event on mount', () => {
    const trackEvent = vi.fn();
    renderHook(() => useScrollDepth(trackEvent, '/test'));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('should fire 25% milestone when scrolled past 25%', () => {
    const trackEvent = vi.fn();
    renderHook(() => useScrollDepth(trackEvent, '/test'));

    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    expect(trackEvent).toHaveBeenCalledWith('scroll_depth', {
      depth: '25%',
      path: '/test',
    });
  });

  it('should not fire same milestone twice', () => {
    const trackEvent = vi.fn();
    renderHook(() => useScrollDepth(trackEvent, '/test'));

    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('should fire multiple milestones as scrolled further', () => {
    const trackEvent = vi.fn();
    renderHook(() => useScrollDepth(trackEvent, '/test'));

    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    Object.defineProperty(window, 'scrollY', { value: 800, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenCalledWith('scroll_depth', { depth: '25%', path: '/test' });
    expect(trackEvent).toHaveBeenCalledWith('scroll_depth', { depth: '50%', path: '/test' });
  });

  it('should fire bottom event when near bottom', () => {
    const trackEvent = vi.fn();
    renderHook(() => useScrollDepth(trackEvent, '/test'));

    Object.defineProperty(window, 'scrollY', { value: 1380, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    expect(trackEvent).toHaveBeenCalledWith('scroll_depth', {
      depth: 'bottom',
      path: '/test',
    });
  });

  it('should clean up event listener on unmount', () => {
    const trackEvent = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScrollDepth(trackEvent, '/test'));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
