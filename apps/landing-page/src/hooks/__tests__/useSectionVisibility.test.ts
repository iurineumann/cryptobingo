import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSectionVisibility } from '../useSectionVisibility';

describe('useSectionVisibility', () => {
  let observeMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let intersectionCallback: (entries: Partial<IntersectionObserverEntry>[]) => void;

  beforeEach(() => {
    (window as any).dataLayer = [];
    (window as any)._analyticsConsented = true;

    observeMock = vi.fn();
    disconnectMock = vi.fn();

    class MockObserver {
      constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        intersectionCallback = callback;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);
  });

  afterEach(() => {
    delete (window as any).dataLayer;
    delete (window as any)._analyticsConsented;
    vi.unstubAllGlobals();
  });

  it('should observe all section refs', () => {
    const el1 = document.createElement('section');
    const el2 = document.createElement('section');
    const refs = [{ current: el1 }, { current: el2 }];

    renderHook(() => useSectionVisibility(vi.fn(), refs, ['hero', 'features']));

    expect(observeMock).toHaveBeenCalledWith(el1);
    expect(observeMock).toHaveBeenCalledWith(el2);
  });

  it('should fire section_visibility when section enters viewport', () => {
    const el1 = document.createElement('section');
    const refs = [{ current: el1 }];
    const trackEvent = vi.fn();

    renderHook(() => useSectionVisibility(trackEvent, refs, ['hero']));

    intersectionCallback([{ target: el1, isIntersecting: true }]);

    expect(trackEvent).toHaveBeenCalledWith('section_visibility', {
      section: 'hero',
      action: 'view',
    });
  });

  it('should fire each section only once', () => {
    const el1 = document.createElement('section');
    const refs = [{ current: el1 }];
    const trackEvent = vi.fn();

    renderHook(() => useSectionVisibility(trackEvent, refs, ['hero']));

    intersectionCallback([{ target: el1, isIntersecting: true }]);
    intersectionCallback([{ target: el1, isIntersecting: true }]);

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('should fire events for multiple sections', () => {
    const el1 = document.createElement('section');
    const el2 = document.createElement('section');
    const refs = [{ current: el1 }, { current: el2 }];
    const trackEvent = vi.fn();

    renderHook(() => useSectionVisibility(trackEvent, refs, ['hero', 'features']));

    intersectionCallback([{ target: el1, isIntersecting: true }]);
    intersectionCallback([{ target: el2, isIntersecting: true }]);

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenCalledWith('section_visibility', { section: 'hero', action: 'view' });
    expect(trackEvent).toHaveBeenCalledWith('section_visibility', { section: 'features', action: 'view' });
  });

  it('should ignore sections not in the refs list', () => {
    const el1 = document.createElement('section');
    const refs = [{ current: el1 }];
    const trackEvent = vi.fn();

    renderHook(() => useSectionVisibility(trackEvent, refs, ['hero']));

    const unknownEl = document.createElement('div');
    intersectionCallback([{ target: unknownEl, isIntersecting: true }]);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('should disconnect observer on unmount', () => {
    const refs = [{ current: document.createElement('section') }];

    const { unmount } = renderHook(() => useSectionVisibility(vi.fn(), refs, ['hero']));
    unmount();

    expect(disconnectMock).toHaveBeenCalled();
  });

  it('should handle empty refs gracefully', () => {
    const trackEvent = vi.fn();

    expect(() => {
      renderHook(() => useSectionVisibility(trackEvent, [], []));
    }).not.toThrow();
  });
});
