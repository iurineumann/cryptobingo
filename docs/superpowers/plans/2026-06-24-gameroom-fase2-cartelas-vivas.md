# GameRoom Fase 2 — Cartelas Vivas + Near-Miss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a cartela (`TicketCard`) viva: detectar quando um padrão está a **uma célula** de fechar (near-miss → "Falta 1!"), destacar a(s) célula(s) que fecham, e mostrar a proximidade do padrão mais próximo — reforçando a tensão sem mudar a lógica de payout.

**Architecture:** Toda a detecção fica numa função pura em `ticketUtils.ts` (`computeTicketNearMiss`), testável isoladamente; o `TicketCard` consome-a e renderiza alerta + destaque de célula + barra de progresso. Novas classes/keyframes em `globals.design.css`. Nenhuma mudança em payouts (ADR-005/010/016) nem no fluxo de dados.

**Tech Stack:** React 18 + TS, Vite, Vitest + @testing-library/react, i18next, CSS animations.

## Global Constraints

- Idioma de código/comentários/commits: **PT-BR**. Comentários explicam o *porquê*.
- **Near-miss é cosmético, não muda payout.** Nenhuma alteração em `completedPatterns`/`winPattern`/`prize` nem na seleção max_weight. O alerta só aparece quando a cartela **não** é vencedora (`!isWinner`).
- FREE SPACE = índice 12 do grid 5×5, sempre marcado (invariante de domínio).
- Acessibilidade: o alerta "Falta 1!" precisa de texto i18n (não só cor); reduced-motion já é neutralizado pelo bloco global em `globals.css` (não adicionar media query por animação). Animar só `transform`/`opacity`/`box-shadow` (60fps).
- data-testids existentes preservados (`gr-ticket-${id}`, `tc-cell-${idx}`); novos: `tc-near-miss` (alerta), `tc-progress` (barra).
- i18n em **3 locales** (`pt`/`en`/`zh`), namespace `game_room`.
- Typecheck: `cd apps/frontend && npx tsc --noEmit` → 0 erros. Testes: `pnpm --filter @cryptobingo/frontend test` → suíte completa verde (era 147; cresce). `TicketCard.test.tsx` e `gameroom/GameRoom.characterization.test.tsx` continuam verdes.
- Commits PT-BR `tipo(escopo): ...` terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Git flow: branch `feature/gameroom-fase2-cartelas-vivas` de `develop`. PR `Closes #<N>` para `develop`. Revisor `frontend-reviewer`. Skills `impeccable` + `frontend-feature`. Pré-PR `/sonar-analyze`. **Sem ADR** (reusa arquitetura existente; nenhuma decisão estrutural nova).

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `apps/frontend/src/components/ticketUtils.ts` | **Modificar** — adicionar `computeTicketNearMiss` (+ interface `TicketNearMiss`). |
| `apps/frontend/src/components/ticketUtils.nearmiss.test.ts` | **Criar** — testes da função pura. |
| `apps/frontend/src/components/TicketCard.tsx` | **Modificar** — consumir near-miss: alerta, destaque de célula, barra de progresso. |
| `apps/frontend/src/components/TicketCard.test.tsx` | **Modificar** — testes de near-miss + progresso. |
| `apps/frontend/src/styles/globals.design.css` | **Modificar** — keyframe/classes (perto de `.gr-bingo-cell.is-just-hit`, linha ~124). |
| `apps/frontend/src/locales/{pt,en,zh}.json` | **Modificar** — `game_room.near_miss` + aria. |

> ⚠️ **Pré-requisito:** `develop` atualizado (Fase 1 mergeada via PR #76). Criar branch: `git checkout develop && git pull && git checkout -b feature/gameroom-fase2-cartelas-vivas`.

---

### Task 1: `computeTicketNearMiss` (função pura)

Detecta padrões a uma célula de fechar, numa cartela.

**Files:**
- Modify: `apps/frontend/src/components/ticketUtils.ts`
- Test: `apps/frontend/src/components/ticketUtils.nearmiss.test.ts` (criar)

**Interfaces:**
- Produces:

```ts
export interface TicketNearMiss {
  /** Células (índice 0–24) que, se sorteadas, fecham ao menos um padrão. */
  nearMissCells: Set<number>;
  /** Quantos padrões estão a exatamente 1 célula de fechar. */
  patternsOneAway: number;
  /** Maior completude (0–1) entre padrões ainda NÃO completos. */
  closestPct: number;
}
export function computeTicketNearMiss(
  matrix: number[],
  drawnSet: Set<number>,
  patterns: Pattern[],
): TicketNearMiss;
```

- Reusa `ticketFlat(matrix)` (já existe no arquivo) para achatar a matriz em 25 posições (FREE SPACE = `null` na posição 12). Célula marcada = `flat[i] === null || drawnSet.has(flat[i])`.
- Para cada padrão: conta células requeridas (`cells[i]` truthy) não-marcadas. Se já completo (0 faltando), ignora (não é near-miss nem entra no closest). Se faltam exatamente 1 → incrementa `patternsOneAway` e adiciona o índice faltante a `nearMissCells`. `closestPct` = maior `marcadas/requeridas` entre padrões não-completos.

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// apps/frontend/src/components/ticketUtils.nearmiss.test.ts
import { describe, it, expect } from 'vitest';
import { computeTicketNearMiss, type Pattern } from './ticketUtils';

// Matriz canônica (24 números; FREE SPACE inserido em [2][2] pelo flat)
// B:1-5 I:16-20 N:31-34 G:46-50 O:61-65 → flat por linhas:
// linha0: B1,I16,N31,G46,O61  (índices 0..4)
const MATRIX = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34, 46,47,48,49,50, 61,62,63,64,65];

// Padrão "linha 0": índices 0,1,2,3,4 (col B,I,N,G,O da 1ª linha).
const LINHA0: Pattern = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] };

describe('computeTicketNearMiss', () => {
  it('marca near-miss quando falta exatamente 1 célula', () => {
    // linha0 = B1,I16,N31,G46,O61. Sorteia todas menos O61 (índice 4).
    const drawn = new Set([1, 16, 31, 46]); // N31 também marcado; falta O61
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(1);
    expect(r.nearMissCells.has(4)).toBe(true);
    expect(r.nearMissCells.size).toBe(1);
  });

  it('não marca near-miss quando faltam 2+ células', () => {
    const drawn = new Set([1, 16]); // faltam N31(2), G46(3), O61(4) → mas N31 é número real aqui
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(0);
    expect(r.nearMissCells.size).toBe(0);
    expect(r.closestPct).toBeCloseTo(2 / 5, 5); // 2 de 5 marcadas
  });

  it('padrão já completo não conta como near-miss nem entra em closestPct', () => {
    const drawn = new Set([1, 16, 31, 46, 61]); // linha0 completa
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(0);
    expect(r.closestPct).toBe(0); // nenhum padrão não-completo
  });

  it('FREE SPACE conta como marcado', () => {
    // Padrão que inclui o centro (índice 12). Faltando só o centro? centro é free → marcado.
    const comCentro: Pattern = { name: 'cruz-mini', prize: '3', cells: (() => { const c = Array(25).fill(false); c[12] = true; c[7] = true; return c; })() };
    const drawn = new Set<number>([]); // nada sorteado
    const r = computeTicketNearMiss(MATRIX, drawn, [comCentro]);
    // requer índices 7 (N-coluna linha1 = valor 32) e 12 (free, marcado). Falta só o 7 → near-miss.
    expect(r.patternsOneAway).toBe(1);
    expect(r.nearMissCells.has(7)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- ticketUtils.nearmiss`
Expected: FAIL (`computeTicketNearMiss` inexistente).

- [ ] **Step 3: Implementar em `ticketUtils.ts`**

Adicionar perto de `computePatternUserProximity` (usa o mesmo `ticketFlat`):

```ts
export interface TicketNearMiss {
  nearMissCells: Set<number>;
  patternsOneAway: number;
  closestPct: number;
}

/**
 * Detecta, numa cartela, padrões a UMA célula de fechar (near-miss).
 * Cosmético — não altera payout. FREE SPACE (flat[i] === null) conta como marcado.
 */
export function computeTicketNearMiss(
  matrix: number[],
  drawnSet: Set<number>,
  patterns: Pattern[],
): TicketNearMiss {
  const flat = ticketFlat(matrix);
  const nearMissCells = new Set<number>();
  let patternsOneAway = 0;
  let closestPct = 0;

  for (const p of patterns) {
    const reqIdx: number[] = [];
    for (let i = 0; i < p.cells.length; i++) if (p.cells[i]) reqIdx.push(i);
    if (reqIdx.length === 0) continue;

    const missing = reqIdx.filter(i => !(flat[i] === null || drawnSet.has(flat[i] as number)));
    if (missing.length === 0) continue; // já completo — ignora

    const pct = (reqIdx.length - missing.length) / reqIdx.length;
    if (pct > closestPct) closestPct = pct;

    if (missing.length === 1) {
      patternsOneAway++;
      nearMissCells.add(missing[0]);
    }
  }
  return { nearMissCells, patternsOneAway, closestPct };
}
```

> Se `ticketFlat` não estiver exportado/visível no escopo do módulo, ele já é usado por `computePatternUserProximity` no mesmo arquivo — reutilize a mesma referência (não duplicar a lógica de achatar a matriz).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @cryptobingo/frontend test -- ticketUtils.nearmiss`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/ticketUtils.ts apps/frontend/src/components/ticketUtils.nearmiss.test.ts
git commit -m "feat(frontend): computeTicketNearMiss — detecção de near-miss por cartela

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Alerta "Falta 1!" + destaque da célula que fecha

**Files:**
- Modify: `apps/frontend/src/components/TicketCard.tsx`
- Modify: `apps/frontend/src/components/TicketCard.test.tsx`
- Modify: `apps/frontend/src/styles/globals.design.css`
- Modify: `apps/frontend/src/locales/{pt,en,zh}.json`

**Interfaces:**
- `TicketCard` calcula `nearMiss = computeTicketNearMiss(matrix, drawnSet, patterns)` (memoizado). Quando `!isWinner && nearMiss.patternsOneAway > 0`: classe `is-near-miss` no `<article>`, badge `data-testid="tc-near-miss"`, e classe `is-near-miss-cell` nas células de `nearMiss.nearMissCells`.

- [ ] **Step 1: i18n (3 locales)**

No namespace `game_room`:
```jsonc
// pt.json
"near_miss": "Falta 1!",
"near_miss_aria": "Cartela {{id}}: falta uma bola para fechar"
```
```jsonc
// en.json
"near_miss": "1 to go!",
"near_miss_aria": "Ticket {{id}}: one ball away from a win"
```
```jsonc
// zh.json
"near_miss": "差1个!",
"near_miss_aria": "卡片 {{id}}：再差一个号码即可中奖"
```

- [ ] **Step 2: CSS (perto da linha ~124, após `.gr-bingo-cell.is-just-hit`)**

```css
/* FASE 2 — cartelas vivas / near-miss (reduced-motion: bloco global cobre) */
.gr-bingo-cell.is-near-miss-cell { outline: 2px dashed var(--cb-accent); outline-offset: -2px; z-index: 1; animation: cb-near-miss-pulse 1.2s ease-in-out infinite; }
@keyframes cb-near-miss-pulse {
  0%, 100% { box-shadow: inset 0 0 0 rgba(251,191,36,0); }
  50%      { box-shadow: inset 0 0 10px rgba(251,191,36,.6); }
}
.gr-ticket.is-near-miss { border-color: color-mix(in srgb, var(--cb-accent) 55%, transparent); }
.gr-ticket-near-miss { display: inline-flex; align-items: center; gap: .25rem; padding: .1rem .45rem; border-radius: 9999px; font-size: .62rem; font-weight: 800; letter-spacing: .04em; color: #1a1a2e; background: linear-gradient(135deg, var(--color-accent-500), var(--color-accent-300)); animation: cb-near-miss-badge 1s ease-in-out infinite; }
@keyframes cb-near-miss-badge {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.08); }
}
```

- [ ] **Step 3: Escrever o teste (falha)**

Adicionar a `TicketCard.test.tsx` (usa o `renderCard` helper já existente). Padrão linha-0 (índices 0–4); marcar 4 das 5 → near-miss:

```tsx
import { computeTicketNearMiss } from './ticketUtils'; // se precisar; senão só via render

it('mostra alerta Falta 1! quando um padrão está a 1 célula', () => {
  const LINHA0 = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] } as Pattern;
  renderCard({
    patterns: [LINHA0],
    drawnSet: new Set([1, 16, 31, 46]), // falta O61 (índice 4) — TEST_MATRIX tem 61 no índice 4
  });
  expect(screen.getByTestId('tc-near-miss')).toBeTruthy();
  expect(screen.getByTestId('tc-cell-4').className).toContain('is-near-miss-cell');
});

it('NÃO mostra alerta quando a cartela é vencedora', () => {
  const LINHA0 = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] } as Pattern;
  renderCard({
    patterns: [LINHA0],
    drawnSet: new Set([1, 16, 31, 46, 61]), // linha completa → winner
  });
  expect(screen.queryByTestId('tc-near-miss')).toBeNull();
});
```

> O `renderCard` de `TicketCard.test.tsx` usa `TEST_MATRIX` (B:1-5, I:16-20, N:31-34, G:46-50, O:61-65). Índice 4 = O da linha 0 = 61. Conferir o helper antes; ajustar os números sorteados se a matriz do helper diferir.

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- TicketCard`
Expected: FAIL (sem `tc-near-miss`/`is-near-miss-cell`).

- [ ] **Step 5: Implementar em `TicketCard.tsx`**

(a) Importar e calcular (memoizado), após o `useMemo` de `completedPatterns`:

```tsx
import { computeTicketNearMiss } from './ticketUtils';
// ...
const nearMiss = useMemo(
  () => computeTicketNearMiss(matrix, drawnSet, patterns),
  [matrix, drawnSet, patterns],
);
const showNearMiss = !isWinner && nearMiss.patternsOneAway > 0;
```

(b) Adicionar `is-near-miss` à lista de classes do `<article>` (quando `showNearMiss`).
(c) No header, ao lado de `gr-ticket-marks`, renderizar o badge quando `showNearMiss`:

```tsx
{showNearMiss && (
  <span className="gr-ticket-near-miss" data-testid="tc-near-miss" aria-label={t('game_room.near_miss_aria', { id: ticketId })}>
    {t('game_room.near_miss')}
  </span>
)}
```

(d) Na célula, acrescentar `is-near-miss-cell` quando `showNearMiss && nearMiss.nearMissCells.has(gridIdx)` (e a célula não está marcada):

```tsx
showNearMiss && nearMiss.nearMissCells.has(gridIdx) && !isMarked ? 'is-near-miss-cell' : '',
```

- [ ] **Step 6: Rodar e ver passar (TicketCard + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "TicketCard|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; TicketCard PASS; caracterização PASS (cartela vencedora no cenário de win não dispara near-miss).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/TicketCard.tsx apps/frontend/src/components/TicketCard.test.tsx apps/frontend/src/styles/globals.design.css apps/frontend/src/locales/pt.json apps/frontend/src/locales/en.json apps/frontend/src/locales/zh.json
git commit -m "feat(frontend): alerta Falta 1! + destaque da célula que fecha (near-miss)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Barra de progresso do padrão mais próximo

Mostra na cartela quão perto está o padrão mais próximo (não-completo).

**Files:**
- Modify: `apps/frontend/src/components/TicketCard.tsx`
- Modify: `apps/frontend/src/components/TicketCard.test.tsx`
- Modify: `apps/frontend/src/styles/globals.design.css`

**Interfaces:**
- Usa `nearMiss.closestPct` (Task 1). Renderiza uma barra fina no rodapé da cartela quando `!isWinner && nearMiss.closestPct > 0`. data-testid `tc-progress`; largura = `${Math.round(closestPct*100)}%`.

> **YAGNI:** o spec diz "barra por padrão/combo"; N barras poluiriam a cartela 5×5. Entregamos **uma** barra do padrão mais próximo (sinal mais relevante p/ o jogador). Decisão registrada no corpo do PR.

- [ ] **Step 1: CSS**

```css
.gr-ticket-progress { height: 4px; border-radius: 9999px; background: var(--cb-border-subtle); overflow: hidden; margin: 0 .75rem .5rem; }
.gr-ticket-progress > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--color-accent-500), var(--color-accent-300)); transition: width 400ms cubic-bezier(0.4,0,0.2,1); }
```

- [ ] **Step 2: Escrever o teste (falha)**

```tsx
it('renderiza barra de progresso do padrão mais próximo', () => {
  const LINHA0 = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] } as Pattern;
  renderCard({ patterns: [LINHA0], drawnSet: new Set([1, 16]) }); // 2/5 = 40%
  const bar = screen.getByTestId('tc-progress');
  const fill = bar.querySelector('i') as HTMLElement;
  expect(fill.style.width).toBe('40%');
});

it('não renderiza barra quando vencedora', () => {
  const LINHA0 = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] } as Pattern;
  renderCard({ patterns: [LINHA0], drawnSet: new Set([1, 16, 31, 46, 61]) });
  expect(screen.queryByTestId('tc-progress')).toBeNull();
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- TicketCard`
Expected: FAIL (sem `tc-progress`).

- [ ] **Step 4: Implementar em `TicketCard.tsx`**

Antes do `<div className="gr-ticket-foot">`, adicionar:

```tsx
{!isWinner && nearMiss.closestPct > 0 && (
  <div className="gr-ticket-progress" data-testid="tc-progress" aria-hidden="true">
    <i style={{ width: `${Math.round(nearMiss.closestPct * 100)}%` }} />
  </div>
)}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "TicketCard|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; TicketCard PASS; caracterização PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/TicketCard.tsx apps/frontend/src/components/TicketCard.test.tsx apps/frontend/src/styles/globals.design.css
git commit -m "feat(frontend): barra de progresso do padrão mais próximo na cartela

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Verificação visual + PR

- [ ] **Step 1: Verificação visual manual**

Run: `pnpm --filter @cryptobingo/frontend dev`, abrir uma sala em `drawing` com cartelas. Conferir: célula recém-batida "pipoca" (já existia); quando um padrão fica a 1 → badge "Falta 1!" pulsa no header e a célula que fecha ganha contorno tracejado pulsante; barra fina mostra a proximidade do padrão mais próximo; cartela vencedora **não** mostra near-miss/barra. Conferir com `prefers-reduced-motion` (DevTools) que as animações somem e o alerta textual permanece legível.

- [ ] **Step 2: `/sonar-analyze`**

Rodar em `ticketUtils.ts` e `TicketCard.tsx`. Corrigir BLOCKER/CRITICAL/MAJOR.

- [ ] **Step 3: Abrir PR**

```bash
git push -u origin feature/gameroom-fase2-cartelas-vivas
```

PR para `develop` com `Closes #<N>`, checklist (typecheck/testes verdes, nota visual + reduced-motion, Sonar), e a nota de YAGNI (uma barra do padrão mais próximo, não N). Revisor `frontend-reviewer`.

---

## Self-Review

**1. Cobertura do spec (Fase 2):** marcação pop/glow ao bater (já existe `cb-cell-pop` em `is-just-hit` — preservado) ✔; célula prestes-a-fechar (`is-near-miss-cell` + `cb-near-miss-pulse`, T2) ✔; alerta "Falta 1!" (`tc-near-miss` + i18n, T2) ✔; barra de progresso por padrão/combo (T3 — entregue como **uma** barra do padrão mais próximo; YAGNI documentado) ✔; reusa proximity de `ticketUtils` (nova função pura `computeTicketNearMiss`, T1) ✔. Nenhuma mudança de payout ✔.

**2. Placeholders:** `<N>` (issue) preenchido na criação. Código completo da função pura, CSS e edits do TicketCard. Sem TODO/TBD.

**3. Consistência de tipos:** `TicketNearMiss`/`computeTicketNearMiss` (T1) consumidos em T2/T3; `nearMiss.nearMissCells`/`patternsOneAway`/`closestPct` usados com os mesmos nomes. `is-near-miss-cell`/`gr-ticket-near-miss`/`gr-ticket-progress` consistentes entre CSS (T2/T3) e JSX.

**Observação para o executor:** confira o `TEST_MATRIX` e o helper `renderCard` em `TicketCard.test.tsx` antes de escrever os números sorteados — os índices de célula (0–24) precisam casar com a matriz do helper (índice 4 = O da linha 0 = 61). Near-miss é **cosmético**: jamais alterar `completedPatterns`/`winPattern`/`prize`.
