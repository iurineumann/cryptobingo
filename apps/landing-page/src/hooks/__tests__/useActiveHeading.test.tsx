import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveHeading } from '../useActiveHeading';

describe('useActiveHeading', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="section1">Section 1</div>
      <div id="section2">Section 2</div>
      <div id="section3">Section 3</div>
    `;

    const s1 = document.getElementById('section1')!;
    const s2 = document.getElementById('section2')!;
    const s3 = document.getElementById('section3')!;

    vi.spyOn(s1, 'offsetTop', 'get').mockReturnValue(0);
    vi.spyOn(s2, 'offsetTop', 'get').mockReturnValue(900);
    vi.spyOn(s3, 'offsetTop', 'get').mockReturnValue(1800);
  });

  test('returns null initially when no heading is in view', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    expect(result.current).toBeNull();
  });

  test('returns first heading when scrolled past it', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('section1');
  });

  test('returns second heading when scrolled past first two', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 1000;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('section2');
  });

  test('returns null when scrolled above all headings', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBeNull();
  });
});
