import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAnalytics } from './useAnalytics';

let pathname = '/lobby';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname, search: '' }),
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    window.dataLayer = [];
    window._analyticsConsented = true;
    pathname = '/lobby';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.dataLayer;
    delete window._analyticsConsented;
  });

  it('nao pusha page_view no mount inicial (prevPath === pathname)', () => {
    renderHook(() => useAnalytics());
    const calls = window.dataLayer.filter((e: any) => e?.event === 'page_view');
    expect(calls).toHaveLength(0);
  });

  it('pusha page_view no dataLayer quando pathname muda', () => {
    const { rerender } = renderHook(() => useAnalytics());
    window.dataLayer = [];
    pathname = '/wallet';
    rerender();
    expect(window.dataLayer).toContainEqual({
      event: 'page_view',
      page_path: '/wallet',
      page_title: document.title,
    });
  });

  it('nao pusha page_view duplicado se pathname nao mudou', () => {
    const { rerender } = renderHook(() => useAnalytics());
    window.dataLayer = [];
    rerender();
    const calls = window.dataLayer.filter((e: any) => e?.event === 'page_view');
    expect(calls).toHaveLength(0);
  });

  it('retorna funcao trackEvent', () => {
    const { result } = renderHook(() => useAnalytics());
    expect(typeof result.current.trackEvent).toBe('function');
  });
});
