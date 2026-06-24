// apps/frontend/src/components/gameroom/useDrawSound.ts
// Som opcional do sorteio. Default OFF, persistido. Usa Web Audio (oscilador)
// para não precisar de assets. O AudioContext é criado lazy no primeiro play
// habilitado — o clique no toggle é o gesto do usuário que libera o áudio.
import { useState, useRef, useCallback } from 'react';

const STORAGE_KEY = 'gr-sound-enabled';

// Frequência (Hz) por coluna — dá identidade sonora ao B/I/N/G/O.
const COL_FREQ: Record<string, number> = { B: 523, I: 587, N: 659, G: 698, O: 784 };

export interface DrawSound {
  enabled: boolean;
  toggle: () => void;
  /** Toca um tom curto de "chamada" da bola. No-op se desabilitado. */
  playBallCall: (col: string) => void;
}

export function useDrawSound(): DrawSound {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const playBallCall = useCallback((col: string) => {
    if (!enabled) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = COL_FREQ[col] ?? 659;
      // envelope curto (~180ms) para um "toque" seco, sem cauda incômoda
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch { /* áudio indisponível não pode quebrar o jogo */ }
  }, [enabled]);

  return { enabled, toggle, playBallCall };
}
