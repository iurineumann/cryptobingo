# GameRoom Fase 1 — Sorteio Cinematográfico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o palco do sorteio (`DrawStage`) cinematográfico: revelação da bola com mais presença, pulso de cor B-I-N-G-O por coluna, trilha de histórico animada, antecipação/suspense entre bolas e som opcional — sem quebrar o Slow Reveal (ADR-007) nem a acessibilidade.

**Architecture:** Toda a mudança é localizada no componente isolado `DrawStage` (criado na Fase 0) + dois hooks novos (`useReducedMotion`, `useDrawSound`) + keyframes/classes novas em `globals.design.css`. O orquestrador `GameRoom.tsx` só passa uma prop nova (`isDrawing`). A animação continua **dirigida por `lastDrawn`/Sequence ID** — o front nunca inventa bolas.

**Tech Stack:** React 18 + TS, Vite, Vitest + @testing-library/react, i18next, Web Audio API (oscilador, sem assets), CSS animations.

## Global Constraints

- Idioma de código/comentários/commits: **PT-BR**. Comentários explicam o *porquê*.
- **Acessibilidade é requisito, não polish.** O bloco global `@media (prefers-reduced-motion: reduce)` em `apps/frontend/src/styles/globals.css:362` já neutraliza TODA animação CSS (`*` → `animation-duration:0.01ms !important`). **Não** adicionar media queries redundantes por animação; confiar no bloco global. O `aria-live="polite"` da bola hero deve ser preservado.
- **Slow Reveal intacto (ADR-007):** animação reage a `lastDrawn` (Sequence ID); nenhuma bola inventada, nenhuma reconciliação alterada. O Slow Reveal **não expõe ETA** da próxima bola → o "countdown tenso" é uma **animação de antecipação/suspense** (não um número regressivo). Decisão documentada na ADR-031.
- **Som default OFF**, persistido em `localStorage` (`gr-sound-enabled`). Áudio só inicia após gesto do usuário (o toggle É o gesto — AudioContext criado lazy no primeiro play habilitado).
- data-testids existentes preservados (`gr-ball-hero`, `gr-ball-hero-number`, `gr-ball-history`); novos: `gr-sound-toggle`.
- Performance alvo: 60fps desktop; animações via `transform`/`opacity` (GPU), nunca `width`/`top`/`left` animados.
- Typecheck: `cd apps/frontend && npx tsc --noEmit` → 0 erros. Testes: `pnpm --filter @cryptobingo/frontend test` → suíte completa verde (era 134; cresce com os testes novos). O teste de caracterização `gameroom/GameRoom.characterization.test.tsx` deve continuar verde (pode precisar passar `isDrawing` se a tipagem exigir — mas é opcional via default).
- Commits PT-BR `tipo(escopo): ...` terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Git flow: branch `feature/gameroom-fase1-sorteio` de `develop`. PR `Closes #<N>` para `develop`. ADR-031. Revisor `frontend-reviewer`. Skills `impeccable` + `frontend-feature`. Pré-PR `/sonar-analyze`.

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `apps/frontend/src/hooks/useReducedMotion.ts` | **Criar** — hook matchMedia reativo p/ `(prefers-reduced-motion: reduce)`. |
| `apps/frontend/src/hooks/useReducedMotion.test.ts` | **Criar** — testes. |
| `apps/frontend/src/components/gameroom/useDrawSound.ts` | **Criar** — som opcional do sorteio (WebAudio), toggle persistido. |
| `apps/frontend/src/components/gameroom/useDrawSound.test.ts` | **Criar** — testes. |
| `apps/frontend/src/components/gameroom/DrawStage.tsx` | **Modificar** — pulso de coluna, revelação, trilha animada, suspense, botão de som. |
| `apps/frontend/src/components/gameroom/DrawStage.test.tsx` | **Criar** — render/DOM assertions. |
| `apps/frontend/src/styles/globals.design.css` | **Modificar** — keyframes/classes novas (perto das existentes `gr-drop`/`cb-halo-pulse`). |
| `apps/frontend/src/components/GameRoom.tsx` | **Modificar** — passar `isDrawing={isDrawing}` ao `<DrawStage>`. |
| `apps/frontend/src/locales/{pt,en,zh}.json` | **Modificar** — chaves `game_room.sound_*`. |
| `docs/adr/ADR-031-ux-palco-sorteio.md` | **Criar**. |

> ⚠️ **Pré-requisito:** `develop` atualizado (Fase 0 já mergeada via PR #74). Criar branch: `git checkout develop && git pull && git checkout -b feature/gameroom-fase1-sorteio`.

---

### Task 1: Hook `useReducedMotion`

**Files:**
- Create: `apps/frontend/src/hooks/useReducedMotion.ts`
- Test: `apps/frontend/src/hooks/useReducedMotion.test.ts`

**Interfaces:**
- Produces: `export function useReducedMotion(): boolean` — `true` quando o usuário pede menos movimento. Reativo a mudanças da media query.

- [ ] **Step 1: Escrever o teste (falha)**

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- useReducedMotion`
Expected: FAIL ("useReducedMotion is not a function" / módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// apps/frontend/src/hooks/useReducedMotion.ts
// Detecta a preferência de "menos movimento" do SO/navegador, de forma reativa.
// Usado por efeitos dirigidos por JS (ex.: som, suspense) — a maioria das
// animações é CSS e já é neutralizada pelo bloco global em globals.css.
import { useState, useEffect } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @cryptobingo/frontend test -- useReducedMotion`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useReducedMotion.ts apps/frontend/src/hooks/useReducedMotion.test.ts
git commit -m "feat(frontend): hook useReducedMotion para efeitos dirigidos por JS

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Hook `useDrawSound`

Som opcional do sorteio via Web Audio (oscilador — sem assets). Toggle persistido, default OFF.

**Files:**
- Create: `apps/frontend/src/components/gameroom/useDrawSound.ts`
- Test: `apps/frontend/src/components/gameroom/useDrawSound.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DrawSound {
  enabled: boolean;
  toggle: () => void;
  /** Toca um tom curto de "chamada" da bola. No-op se desabilitado. */
  playBallCall: (col: string) => void;
}
export function useDrawSound(): DrawSound;
```

- Chave de persistência: `localStorage['gr-sound-enabled']` (`'1'`/`'0'`), default `'0'` (off).
- `playBallCall` só faz som quando `enabled`; cria/resume o `AudioContext` lazy. Frequência por coluna B/I/N/G/O dá variação (mapeada por `getCol` → índice). Erros de áudio são engolidos (não quebram o jogo).

- [ ] **Step 1: Escrever o teste (falha)**

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- useDrawSound`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @cryptobingo/frontend test -- useDrawSound`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gameroom/useDrawSound.ts apps/frontend/src/components/gameroom/useDrawSound.test.ts
git commit -m "feat(frontend): hook useDrawSound (som opcional do sorteio, default off)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: CSS cinematográfico + pulso de coluna na revelação

Adiciona keyframes/classes e faz a bola hero pulsar com a cor da coluna a cada nova bola.

**Files:**
- Modify: `apps/frontend/src/styles/globals.design.css` (adicionar perto da linha 206, onde está `.gr-drop`)
- Modify: `apps/frontend/src/components/gameroom/DrawStage.tsx`
- Test: `apps/frontend/src/components/gameroom/DrawStage.test.tsx` (criar)

**Interfaces:**
- `DrawStage` ganha um atributo `data-col={col}` no `<section className="gr-stage">` e dispara a classe `gr-col-pulse` (re-trigger com o mesmo padrão `remove→reflow→add` do `gr-drop`) quando `lastDrawn` muda.

- [ ] **Step 1: Adicionar CSS (keyframes + classes)**

Em `globals.design.css`, logo após a linha `.gr-stage[data-stage-style="minimal"] .gr-drop { ... }` (linha ~207), inserir:

```css
/* ============================================================
   FASE 1 — SORTEIO CINEMATOGRÁFICO
   (reduced-motion já é neutralizado pelo bloco global em globals.css)
   ============================================================ */

/* Revelação com mais presença: giro + queda + acomodação. Substitui o drop
   simples no estilo spotlight, mantendo gr-drop nos outros estilos. */
.gr-stage[data-stage-style="spotlight"] .gr-drop { animation: cb-ball-reveal 720ms cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes cb-ball-reveal {
  0%   { transform: translateY(-40%) scale(0.6) rotate(-18deg); opacity: 0; }
  55%  { transform: translateY(4%)  scale(1.06) rotate(4deg);  opacity: 1; }
  75%  { transform: translateY(0)   scale(0.98) rotate(-2deg); }
  100% { transform: translateY(0)   scale(1)    rotate(0); }
}

/* Pulso de cor B-I-N-G-O: o halo/spot "respira" na cor da coluna ao revelar. */
.gr-col-pulse .gr-ball-halo { animation: cb-col-pulse 720ms ease-out; }
@keyframes cb-col-pulse {
  0%   { opacity: .35; transform: translate(-50%, -50%) scale(0.85); }
  40%  { opacity: .95; transform: translate(-50%, -50%) scale(1.18); }
  100% { opacity: .5;  transform: translate(-50%, -50%) scale(1); }
}

/* Entrada da mini-bola mais recente na trilha. */
.gr-mini-ball.latest { animation: cb-mini-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes cb-mini-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.28); opacity: 1; }
  100% { transform: scale(1.18); }
}

/* Suspense entre bolas: enquanto está sorteando, o palco "respira".
   Sem ETA do Slow Reveal → antecipação, não contagem numérica. */
.gr-stage.is-suspense .gr-ball-halo { animation: cb-stage-suspense 1.1s ease-in-out infinite; }
@keyframes cb-stage-suspense {
  0%, 100% { opacity: .4; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: .7; transform: translate(-50%, -50%) scale(1.08); }
}

/* Botão de som no header do palco. */
.gr-sound-toggle { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 1px solid var(--cb-border-default); background: var(--cb-bg-elevated); color: var(--cb-text-secondary); cursor: pointer; font-size: 0.8rem; line-height: 1; transition: color 160ms, border-color 160ms; }
.gr-sound-toggle:hover { color: var(--cb-text-primary); border-color: var(--cb-border-focus); }
.gr-sound-toggle[data-on="true"] { color: var(--cb-brand); border-color: color-mix(in srgb, var(--cb-brand) 50%, transparent); }
```

- [ ] **Step 2: Escrever o teste do pulso de coluna (falha)**

```tsx
// apps/frontend/src/components/gameroom/DrawStage.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import DrawStage from './DrawStage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

afterEach(() => cleanup());

function renderStage(over: Partial<Parameters<typeof DrawStage>[0]> = {}) {
  const stageRef = createRef<HTMLElement>();
  return render(
    <DrawStage
      wsStatus="connected" drawnNumbers={[7]} effectiveBalls={[{ order: 1, number: 7, timestamp: '' }]}
      lastDrawn={7} col="B" color="#ef4444" maxBalls={75} isDrawing={false} stageRef={stageRef}
      {...over}
    />,
  );
}

describe('DrawStage — sorteio cinematográfico', () => {
  it('marca a coluna da bola no palco via data-col', () => {
    renderStage({ col: 'B' });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.getAttribute('data-col')).toBe('B');
  });

  it('ativa estado de suspense quando isDrawing', () => {
    renderStage({ isDrawing: true });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.className).toContain('is-suspense');
  });

  it('NÃO entra em suspense quando não está sorteando', () => {
    renderStage({ isDrawing: false });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.className).not.toContain('is-suspense');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/DrawStage`
Expected: FAIL (`data-col`/`is-suspense` ainda não existem; prop `isDrawing` inexistente).

- [ ] **Step 4: Implementar em `DrawStage.tsx`**

(a) Adicionar `isDrawing: boolean;` ao `DrawStageProps` e ao destructure.
(b) Adicionar ref + efeito do pulso de coluna, ao lado do efeito de drop existente:

```tsx
  // Pulso de cor da coluna a cada nova bola (mesmo padrão de re-trigger do gr-drop).
  const spotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spotRef.current || lastDrawn === prevBall.current) return;
    // prevBall já é atualizado pelo efeito de drop; aqui só re-disparamos a classe.
    const el = spotRef.current;
    el.classList.remove('gr-col-pulse');
    void el.offsetWidth;
    el.classList.add('gr-col-pulse');
  }, [lastDrawn]);
```

> ⚠️ Ordem dos efeitos: o efeito de drop (existente) atualiza `prevBall.current`. Como ambos dependem de `lastDrawn` e o de drop vem **antes**, ele zera o guard antes deste rodar. Para evitar que o segundo efeito veja `lastDrawn === prevBall.current` (já atualizado), **remova o guard duplicado**: una os dois efeitos num só que dispara `gr-drop` no `heroRef` E `gr-col-pulse` no `spotRef`, atualizando `prevBall.current` uma única vez no fim. Implementação unificada:

```tsx
  useEffect(() => {
    if (lastDrawn === prevBall.current) return;
    prevBall.current = lastDrawn;
    const hero = heroRef.current;
    if (hero) { hero.classList.remove('gr-drop'); void hero.offsetWidth; hero.classList.add('gr-drop'); }
    const spot = spotRef.current;
    if (spot) { spot.classList.remove('gr-col-pulse'); void spot.offsetWidth; spot.classList.add('gr-col-pulse'); }
  }, [lastDrawn]);
```

(c) No `<section className="gr-stage">`, adicionar `data-col={col}` e a classe condicional de suspense:

```tsx
    <section
      ref={stageRef}
      className={`gr-stage${isDrawing ? ' is-suspense' : ''}`}
      data-stage-style="spotlight"
      data-col={col}
      aria-label="Sorteio em tempo real"
    >
```

(d) `gr-col-pulse` precisa estar num ancestral do `.gr-ball-halo`. Pôr a classe no `.gr-stage-spot` → adicionar `ref={spotRef}` nele:

```tsx
        <div ref={spotRef} className="gr-stage-spot" style={{ '--ball-color': color } as React.CSSProperties}>
```

- [ ] **Step 5: Atualizar o orquestrador para passar `isDrawing`**

Em `GameRoom.tsx`, no `<DrawStage .../>`, adicionar `isDrawing={isDrawing}` (já vem desestruturado do hook).

- [ ] **Step 6: Rodar e ver passar (DrawStage + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "gameroom/DrawStage|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; DrawStage 3/3 PASS; caracterização continua PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/styles/globals.design.css apps/frontend/src/components/gameroom/DrawStage.tsx apps/frontend/src/components/gameroom/DrawStage.test.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "feat(frontend): revelação cinematográfica + pulso de coluna + suspense no DrawStage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Botão de som + tocar na nova bola + i18n

Liga `useDrawSound` ao `DrawStage`: botão no header e som disparado quando `lastDrawn` muda (respeitando default off).

**Files:**
- Modify: `apps/frontend/src/components/gameroom/DrawStage.tsx`
- Modify: `apps/frontend/src/components/gameroom/DrawStage.test.tsx`
- Modify: `apps/frontend/src/locales/pt.json`, `en.json`, `zh.json`

**Interfaces:**
- Consome: `useDrawSound` (Task 2). O botão tem `data-testid="gr-sound-toggle"` e `data-on={enabled}`.

- [ ] **Step 1: Adicionar chaves i18n nos 3 locales**

No namespace `game_room` de cada arquivo (`pt.json`/`en.json`/`zh.json`), adicionar:

```jsonc
// pt.json
"sound_on": "Som ligado",
"sound_off": "Som desligado",
"sound_toggle_aria": "Alternar som do sorteio"
```
```jsonc
// en.json
"sound_on": "Sound on",
"sound_off": "Sound off",
"sound_toggle_aria": "Toggle draw sound"
```
```jsonc
// zh.json
"sound_on": "声音开启",
"sound_off": "声音关闭",
"sound_toggle_aria": "切换开奖声音"
```

- [ ] **Step 2: Escrever teste do toggle de som (falha)**

Adicionar a `DrawStage.test.tsx`. Mockar `useDrawSound` para isolar o DrawStage:

```tsx
const toggle = vi.fn();
const playBallCall = vi.fn();
let soundEnabled = false;
vi.mock('./useDrawSound', () => ({
  useDrawSound: () => ({ enabled: soundEnabled, toggle, playBallCall }),
}));
```

```tsx
  it('renderiza o botão de som refletindo o estado', () => {
    soundEnabled = false;
    renderStage();
    const btn = screen.getByTestId('gr-sound-toggle');
    expect(btn.getAttribute('data-on')).toBe('false');
  });

  it('clicar no botão chama toggle', () => {
    renderStage();
    screen.getByTestId('gr-sound-toggle').click();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('toca a chamada da bola quando lastDrawn muda', () => {
    const { rerender } = renderStage({ lastDrawn: null, drawnNumbers: [] });
    playBallCall.mockClear();
    rerender(
      // novo lastDrawn dispara o efeito
      // (use o mesmo conjunto de props com lastDrawn=7, col='B')
      <DrawStage wsStatus="connected" drawnNumbers={[7]} effectiveBalls={[{ order: 1, number: 7, timestamp: '' }]}
        lastDrawn={7} col="B" color="#ef4444" maxBalls={75} isDrawing={false} stageRef={createRef<HTMLElement>()} />,
    );
    expect(playBallCall).toHaveBeenCalledWith('B');
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/DrawStage`
Expected: FAIL (sem botão `gr-sound-toggle`; `playBallCall` não é chamado).

- [ ] **Step 4: Implementar em `DrawStage.tsx`**

(a) Importar e usar o hook: `import { useDrawSound } from './useDrawSound';` e `const sound = useDrawSound();`.
(b) No efeito unificado de nova bola (Task 3 Step 4b), após disparar as animações, tocar o som — mas só quando há bola: ` if (lastDrawn != null) sound.playBallCall(col);` (adicionar `sound`/`col` às deps; `playBallCall` é estável por `useCallback`).
(c) No `<div className="gr-stage-header">`, adicionar o botão à direita (ao lado do contador):

```tsx
        <button
          type="button"
          className="gr-sound-toggle"
          data-testid="gr-sound-toggle"
          data-on={sound.enabled}
          onClick={sound.toggle}
          aria-pressed={sound.enabled}
          aria-label={t('game_room.sound_toggle_aria')}
          title={sound.enabled ? t('game_room.sound_on') : t('game_room.sound_off')}
        >
          {sound.enabled ? '🔊' : '🔇'}
        </button>
```

- [ ] **Step 5: Rodar e ver passar (DrawStage + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "gameroom/DrawStage|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; DrawStage PASS (todos); caracterização PASS (o novo botão não altera os testids existentes).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/gameroom/DrawStage.tsx apps/frontend/src/components/gameroom/DrawStage.test.tsx apps/frontend/src/locales/pt.json apps/frontend/src/locales/en.json apps/frontend/src/locales/zh.json
git commit -m "feat(frontend): botão de som no palco + tocar chamada da bola (i18n pt/en/zh)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: ADR-031 + verificação visual + PR

**Files:**
- Create: `docs/adr/ADR-031-ux-palco-sorteio.md`

- [ ] **Step 1: Escrever ADR-031**

Conteúdo: contexto (palco estático pós-Fase 0), decisão (revelação `cb-ball-reveal`, pulso de coluna `cb-col-pulse`, trilha `cb-mini-pop`, suspense `cb-stage-suspense`, som opcional default off via `useDrawSound`). **Decisões não-óbvias a registrar:** (1) Slow Reveal não expõe ETA → suspense é antecipação, não contagem numérica; (2) reduced-motion é coberto pelo bloco global `*` em `globals.css:362` — animações novas são automaticamente neutralizadas, por isso não há media query por animação; (3) som usa oscilador Web Audio (sem assets) e só inicia após o gesto do toggle; default off por respeito ao usuário. Consequências e alternativas (assets de áudio vs oscilador; countdown numérico exigiria ETA do worker — fora de escopo). Referenciar ADR-007 e o spec.

- [ ] **Step 2: Verificação visual manual**

Run: `pnpm --filter @cryptobingo/frontend dev`, abrir uma sala em `drawing`. Conferir: bola entra com giro/queda; halo pulsa na cor da coluna (B vermelho, I laranja, N verde, G/O); mini-bola nova "pipoca" na trilha; palco "respira" enquanto sorteia; botão de som alterna 🔇/🔊 e toca tom ao habilitar. Conferir com `prefers-reduced-motion` ativo (DevTools → Rendering → Emulate CSS prefers-reduced-motion) que as animações somem e a UI continua usável.

- [ ] **Step 3: `/sonar-analyze`**

Rodar em `useReducedMotion.ts`, `useDrawSound.ts`, `DrawStage.tsx`. Corrigir BLOCKER/CRITICAL/MAJOR.

- [ ] **Step 4: Commit ADR + abrir PR**

```bash
git add docs/adr/ADR-031-ux-palco-sorteio.md
git commit -m "docs(adr): ADR-031 UX do palco de sorteio (Fase 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin feature/gameroom-fase1-sorteio
```

Abrir PR para `develop` com `Closes #<N>`, checklist (typecheck/testes verdes, nota visual + reduced-motion, Sonar). Revisor `frontend-reviewer`.

---

## Self-Review

**1. Cobertura do spec (Fase 1):** sorteio cinematográfico (`cb-ball-reveal`, T3) ✔; pulso B-I-N-G-O por coluna (`cb-col-pulse` + `data-col`, T3) ✔; trilha de histórico animada (`cb-mini-pop`, T3) ✔; countdown tenso → suspense/antecipação (`cb-stage-suspense` + `is-suspense`, T3; ETA inexistente documentado na ADR) ✔; som opcional toggle persistido default off (T2 + T4) ✔; `prefers-reduced-motion` (bloco global + `useReducedMotion` p/ JS, T1) ✔; reconciliação Slow Reveal intacta (animação só reage a `lastDrawn`, nenhuma bola inventada) ✔.

**2. Placeholders:** `<N>` (issue) preenchido na criação. Código completo nos hooks e CSS; edits do DrawStage com os trechos exatos. Sem TODO/TBD.

**3. Consistência de tipos:** `DrawSound` (T2) consumido em T4; `useReducedMotion(): boolean` (T1); `DrawStageProps` ganha `isDrawing: boolean` (T3) e o orquestrador passa `isDrawing` (T3 Step 5) — alinhado. `gr-col-pulse` aplicado no `.gr-stage-spot` (ancestral do `.gr-ball-halo`, alvo do keyframe) — consistente entre CSS (T3 Step1) e JSX (T3 Step4d).

**Observação para o executor:** o efeito de nova bola foi **unificado** (drop + pulso + som) num único `useEffect` para um só guard `prevBall` — não criar dois efeitos concorrentes em `lastDrawn`. Pulo visual é polish: priorize 60fps (só `transform`/`opacity`) e a neutralização por reduced-motion.
