// apps/frontend/src/components/gameroom/useDrawSound.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useDrawSound } from './useDrawSound';

// Stub mínimo de AudioContext que registra chamadas
class FakeOsc {
  frequency = { value: 0 };
  type = ''; connect = vi.fn(); start = vi.fn(); stop = vi.fn();
  onended: (() => void) | null = null;
}
class FakeGain { gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; connect = vi.fn(); }
let oscs: FakeOsc[] = [];
class FakeAudioCtx {
  currentTime = 0; state = 'running'; destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator() { const o = new FakeOsc(); oscs.push(o); return o; }
  createGain() { return new FakeGain(); }
}

describe('useDrawSound', () => {
  beforeEach(() => {
    oscs = [];
    localStorage.clear();
    vi.stubGlobal('AudioContext', FakeAudioCtx);
  });

  it('default é desabilitado (off)', () => {
    const { result } = renderHook(() => useDrawSound());
    expect(result.current.enabled).toBe(false);
  });

  it('playBallCall é no-op quando desabilitado', () => {
    const { result } = renderHook(() => useDrawSound());
    act(() => result.current.playBallCall('B'));
    expect(oscs.length).toBe(0);
  });

  it('toggle habilita, persiste em localStorage e toca som', () => {
    const { result } = renderHook(() => useDrawSound());
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem('gr-sound-enabled')).toBe('1');
    act(() => result.current.playBallCall('B'));
    expect(oscs.length).toBe(1);
  });

  it('lê o estado persistido na montagem', () => {
    localStorage.setItem('gr-sound-enabled', '1');
    const { result } = renderHook(() => useDrawSound());
    expect(result.current.enabled).toBe(true);
  });
});
