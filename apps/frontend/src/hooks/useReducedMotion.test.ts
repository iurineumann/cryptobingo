// apps/frontend/src/hooks/useReducedMotion.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

// Mock matchMedia controlável
function mockMatchMedia(initial: boolean) {
  let listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.push(cb); },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners = listeners.filter(l => l !== cb); },
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return { mql, emit: (matches: boolean) => { (mql as { matches: boolean }).matches = matches; listeners.forEach(l => l({ matches })); } };
}

describe('useReducedMotion', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('retorna false quando a media query não casa', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('retorna true quando a media query casa', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reage a mudança da preferência', () => {
    const { emit } = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => emit(true));
    expect(result.current).toBe(true);
  });
});
