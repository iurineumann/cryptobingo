import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingProgress } from '../useReadingProgress';

describe('useReadingProgress', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 0 progress initially with no content', () => {
    const { result } = renderHook(() => useReadingProgress(''));
    expect(result.current.progress).toBe(0);
    expect(result.current.readTime).toBe(0);
  });

  it('estimates read time from word count', () => {
    const words = Array(1000).fill('word').join(' ');
    const { result } = renderHook(() => useReadingProgress(words));
    expect(result.current.readTime).toBe(5); // 1000 words / 200 wpm
  });

  it('progress is based on document scroll position', () => {
    const words = Array(2000).fill('word').join(' ');
    const { result } = renderHook(() => useReadingProgress(words));

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.progress).toBeCloseTo(50, 0);
  });
});
