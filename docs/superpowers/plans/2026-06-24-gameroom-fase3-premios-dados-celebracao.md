# GameRoom Fase 3 — Prêmios + Dados + Celebração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar peso aos prêmios e dados da partida: pote da partida + bônus patrocinado em destaque (visível durante o jogo), distinção clara entre **premiações do jogador** e **premiações da sala** (todos os vencedores) ao final, e uma celebração de vitória com o total em evidência.

**Architecture:** Um componente novo `MatchStats` (faixa persistente de dados, no topo do `gr-main`) e melhorias no `PrizePanels` (seção sala vs jogador no fim de jogo). Todos os valores são **on-chain** exibidos como vêm (`game.total_wagered`, `game.sponsor_pool`, `localWinners`) — **sem recalcular economia no front** (ADR-010: o worker/chain resolvem; o front só exibe). Funções de soma/parse ficam puras em um util testável.

**Tech Stack:** React 18 + TS, Vite, Vitest + @testing-library/react, i18next, CSS.

## Global Constraints

- Idioma de código/comentários/commits: **PT-BR**. Comentários explicam o *porquê*.
- **Sem recálculo de economia no front.** Pote = `game.total_wagered` (valor on-chain), bônus = `game.sponsor_pool` (on-chain). Premiações pagas = soma dos `payouts` dos `localWinners` (valores que o worker/chain resolveram). Não aplicar RTP/GGR/base_multiplier no front (ADR-010 / RTP 85% são do contrato).
- **Premiações: jogador vs sala** (ajuste do spec). "Você ganhou" = `playerWinEntries` (já existe). "Sala pagou" = total + nº de vencedores de `localWinners` (todos os jogadores). Distinção textual explícita (i18n).
- Acessibilidade: faixa de stats com rótulos i18n; reduced-motion via bloco global (sem media query nova); animar só `transform`/`opacity`.
- data-testids existentes preservados (`gr-ended-overlay`, `gr-prize-breakdown`); novos: `gr-match-stats`, `gr-pot`, `gr-room-prizes`.
- i18n em **3 locales** (`pt`/`en`/`zh`), namespace `game_room`.
- Typecheck: `cd apps/frontend && npx tsc --noEmit` → 0 erros. Testes: `pnpm --filter @cryptobingo/frontend test` → suíte completa verde (era 155). `gameroom/GameRoom.characterization.test.tsx` continua verde.
- Commits PT-BR `tipo(escopo): ...` terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Git flow: branch `feature/gameroom-fase3-premios-dados` de `develop`. PR `Closes #<N>` para `develop`. Revisor `frontend-reviewer`. Skills `impeccable` + `frontend-feature`. Pré-PR `/sonar-analyze`. **Sem ADR** (sem decisão estrutural nova; só exibição de dados existentes).

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `apps/frontend/src/components/gameroom/prizeFormat.ts` | **Criar** — utils puros: parse/soma de `ExtendedAsset`/payouts por moeda. |
| `apps/frontend/src/components/gameroom/prizeFormat.test.ts` | **Criar** — testes. |
| `apps/frontend/src/components/gameroom/MatchStats.tsx` | **Criar** — faixa: pote da partida + bônus patrocinado + bolas. |
| `apps/frontend/src/components/gameroom/MatchStats.test.tsx` | **Criar** — testes. |
| `apps/frontend/src/components/gameroom/PrizePanels.tsx` | **Modificar** — seção "premiações da sala" + total do jogador destacado. |
| `apps/frontend/src/components/gameroom/PrizePanels.test.tsx` | **Criar** — testes da seção sala vs jogador. |
| `apps/frontend/src/components/GameRoom.tsx` | **Modificar** — renderizar `<MatchStats>` no topo do `gr-main`. |
| `apps/frontend/src/styles/globals.design.css` | **Modificar** — classes `gr-match-stats`/`gr-pot`/`gr-room-prizes`. |
| `apps/frontend/src/locales/{pt,en,zh}.json` | **Modificar** — chaves `game_room.pot_*`, `room_prizes_*`, `stats_*`. |

> ⚠️ **Pré-requisito:** `develop` atualizado (Fase 2 mergeada via PR #78). Criar branch: `git checkout develop && git pull && git checkout -b feature/gameroom-fase3-premios-dados`.

---

### Task 1: Utils de formatação de prêmio (`prizeFormat`)

Funções puras para parse/soma de valores monetários — sem recálculo econômico, só agregação de valores já resolvidos.

**Files:**
- Create: `apps/frontend/src/components/gameroom/prizeFormat.ts`
- Test: `apps/frontend/src/components/gameroom/prizeFormat.test.ts`

**Interfaces:**
- Produces:

```ts
/** Quebra "10.0000 WAX" em { amount: 10, symbol: 'WAX' }. Tolerante a vazio. */
export function parseAsset(quantity: string): { amount: number; symbol: string };

/** Soma payouts (strings "x.yyyy SYM") agrupando por símbolo de moeda.
 *  Retorna [{ symbol, total }] ordenado por total desc. */
export function sumPayoutsByCurrency(payouts: string[]): Array<{ symbol: string; total: number }>;

/** Conta vencedores distintos (ticket_id) numa lista de winners. */
export function countWinners(winners: Array<{ ticket_id: string }>): number;
```

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// apps/frontend/src/components/gameroom/prizeFormat.test.ts
import { describe, it, expect } from 'vitest';
import { parseAsset, sumPayoutsByCurrency, countWinners } from './prizeFormat';

describe('parseAsset', () => {
  it('quebra quantidade e símbolo', () => {
    expect(parseAsset('10.0000 WAX')).toEqual({ amount: 10, symbol: 'WAX' });
  });
  it('tolera string vazia', () => {
    expect(parseAsset('')).toEqual({ amount: 0, symbol: '' });
  });
});

describe('sumPayoutsByCurrency', () => {
  it('soma por moeda e ordena desc', () => {
    const r = sumPayoutsByCurrency(['1.0000 WAX', '2.5000 WAX', '3.0000 USDT']);
    expect(r).toEqual([
      { symbol: 'WAX', total: 3.5 },
      { symbol: 'USDT', total: 3 },
    ]);
  });
  it('ignora payouts vazios', () => {
    expect(sumPayoutsByCurrency(['', '1.0000 WAX'])).toEqual([{ symbol: 'WAX', total: 1 }]);
  });
});

describe('countWinners', () => {
  it('conta ticket_id distintos', () => {
    expect(countWinners([{ ticket_id: '1' }, { ticket_id: '1' }, { ticket_id: '2' }])).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- prizeFormat`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// apps/frontend/src/components/gameroom/prizeFormat.ts
// Utils puros de exibição de prêmio. NÃO recalculam economia (ADR-010):
// apenas fazem parse/soma de valores que o worker/chain já resolveram.

export function parseAsset(quantity: string): { amount: number; symbol: string } {
  const parts = (quantity ?? '').trim().split(/\s+/);
  const amount = parseFloat(parts[0]) || 0;
  const symbol = parts[1] ?? '';
  return { amount, symbol };
}

export function sumPayoutsByCurrency(payouts: string[]): Array<{ symbol: string; total: number }> {
  const map = new Map<string, number>();
  for (const p of payouts) {
    const { amount, symbol } = parseAsset(p);
    if (!symbol) continue;
    map.set(symbol, (map.get(symbol) ?? 0) + amount);
  }
  return [...map.entries()]
    .map(([symbol, total]) => ({ symbol, total }))
    .sort((a, b) => b.total - a.total);
}

export function countWinners(winners: Array<{ ticket_id: string }>): number {
  return new Set(winners.map(w => w.ticket_id)).size;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @cryptobingo/frontend test -- prizeFormat`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gameroom/prizeFormat.ts apps/frontend/src/components/gameroom/prizeFormat.test.ts
git commit -m "feat(frontend): utils puros de formatação/soma de prêmio (sem recálculo econômico)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `MatchStats` — pote da partida + bônus + bolas

Faixa de dados persistente, visível durante o jogo.

**Files:**
- Create: `apps/frontend/src/components/gameroom/MatchStats.tsx`
- Test: `apps/frontend/src/components/gameroom/MatchStats.test.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`
- Modify: `apps/frontend/src/styles/globals.design.css`
- Modify: `apps/frontend/src/locales/{pt,en,zh}.json`

**Interfaces:**
- Produces:

```tsx
export interface MatchStatsProps {
  totalWagered: string;            // game.total_wagered.quantity ("x.yyyy SYM")
  sponsorPool: Array<{ quantity: string }>; // game.sponsor_pool (bônus patrocinado)
  drawnCount: number;
  maxBalls: number;
}
export default function MatchStats(props: MatchStatsProps): React.JSX.Element | null;
```

- Renderiza `null` se `totalWagered` vazio E sem bônus E `drawnCount===0` (nada a mostrar).
- Pote = `totalWagered` exibido como vem (on-chain). Bônus = soma/listagem de `sponsorPool` (só se houver). Bolas = `drawnCount/maxBalls`.

- [ ] **Step 1: i18n (3 locales)** — no namespace `game_room`:

```jsonc
// pt.json
"pot_label": "Pote da partida",
"pot_bonus": "Bônus patrocinado",
"stats_balls": "Bolas",
// en.json
"pot_label": "Match pot",
"pot_bonus": "Sponsored bonus",
"stats_balls": "Balls",
// zh.json
"pot_label": "本局奖池",
"pot_bonus": "赞助奖金",
"stats_balls": "号码球"
```

- [ ] **Step 2: CSS** — adicionar (perto das classes `gr-*` de stage):

```css
.gr-match-stats { display: flex; flex-wrap: wrap; gap: .75rem; padding: .6rem .9rem; background: var(--cb-bg-card); border: 1px solid var(--cb-border-default); border-radius: .75rem; box-shadow: var(--shadow-card); }
.gr-match-stat { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.gr-match-stat .label { font-size: .58rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--cb-text-tertiary); }
.gr-match-stat .value { font-family: var(--font-family-mono); font-size: .95rem; font-weight: 800; color: var(--cb-text-primary); }
.gr-match-stat.is-pot .value { color: var(--cb-accent); }
.gr-match-stat.is-bonus .value { color: var(--cb-brand); }
.gr-match-stats-sep { width: 1px; align-self: stretch; background: var(--cb-border-subtle); }
```

- [ ] **Step 3: Escrever o teste (falha)**

```tsx
// apps/frontend/src/components/gameroom/MatchStats.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import MatchStats from './MatchStats';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
afterEach(() => cleanup());

describe('MatchStats', () => {
  it('mostra pote, bolas e bônus quando há dados', () => {
    render(<MatchStats totalWagered="100.0000 WAX" sponsorPool={[{ quantity: '50.0000 WAX' }]} drawnCount={12} maxBalls={75} />);
    expect(screen.getByTestId('gr-match-stats')).toBeTruthy();
    expect(screen.getByTestId('gr-pot').textContent).toContain('100.0000 WAX');
    expect(screen.getByText('12/75')).toBeTruthy();
    expect(screen.getByText(/50.0000 WAX/)).toBeTruthy();
  });

  it('omite o bônus quando sponsorPool vazio', () => {
    render(<MatchStats totalWagered="10.0000 WAX" sponsorPool={[]} drawnCount={0} maxBalls={75} />);
    expect(screen.queryByText('game_room.pot_bonus')).toBeNull();
  });

  it('renderiza null quando não há nada a mostrar', () => {
    const { container } = render(<MatchStats totalWagered="" sponsorPool={[]} drawnCount={0} maxBalls={75} />);
    expect(container.querySelector('[data-testid="gr-match-stats"]')).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/MatchStats`
Expected: FAIL (módulo inexistente).

- [ ] **Step 5: Implementar `MatchStats.tsx`**

```tsx
// apps/frontend/src/components/gameroom/MatchStats.tsx
// Faixa de dados da partida: pote (on-chain), bônus patrocinado e bolas.
// Não recalcula economia — exibe valores já resolvidos pelo worker/chain (ADR-010).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseAsset } from './prizeFormat';

export interface MatchStatsProps {
  totalWagered: string;
  sponsorPool: Array<{ quantity: string }>;
  drawnCount: number;
  maxBalls: number;
}

export default function MatchStats({ totalWagered, sponsorPool, drawnCount, maxBalls }: MatchStatsProps): React.JSX.Element | null {
  const { t } = useTranslation();

  const pot = parseAsset(totalWagered);
  const bonus = (sponsorPool ?? []).filter(s => parseAsset(s.quantity).amount > 0);
  const hasPot = pot.amount > 0;

  if (!hasPot && bonus.length === 0 && drawnCount === 0) return null;

  return (
    <div className="gr-match-stats" data-testid="gr-match-stats" role="group" aria-label={t('game_room.pot_label')}>
      <div className="gr-match-stat is-pot">
        <span className="label">{t('game_room.pot_label')}</span>
        <span className="value" data-testid="gr-pot">{hasPot ? totalWagered : '—'}</span>
      </div>
      {bonus.length > 0 && (
        <>
          <div className="gr-match-stats-sep" aria-hidden="true" />
          <div className="gr-match-stat is-bonus">
            <span className="label">{t('game_room.pot_bonus')}</span>
            <span className="value">{bonus.map(b => b.quantity).join(' + ')}</span>
          </div>
        </>
      )}
      <div className="gr-match-stats-sep" aria-hidden="true" />
      <div className="gr-match-stat">
        <span className="label">{t('game_room.stats_balls')}</span>
        <span className="value">{drawnCount}/{maxBalls}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Renderizar no `GameRoom.tsx`**

No topo do `gr-main` (antes de `gr-top-row`), adicionar:

```tsx
<MatchStats
  totalWagered={game?.total_wagered?.quantity ?? ''}
  sponsorPool={game?.sponsor_pool ?? []}
  drawnCount={drawnNumbers.length}
  maxBalls={maxBalls}
/>
```

(importar `MatchStats`; `game`/`drawnNumbers`/`maxBalls` já vêm do hook.)

- [ ] **Step 7: Rodar (MatchStats + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "gameroom/MatchStats|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; MatchStats 3/3 PASS; caracterização PASS (a faixa aparece mas não altera os testids existentes; se o mock da caracterização não tiver `total_wagered`/`sponsor_pool`, `MatchStats` ainda renderiza por `drawnCount` ou retorna null — sem quebrar).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/gameroom/MatchStats.tsx apps/frontend/src/components/gameroom/MatchStats.test.tsx apps/frontend/src/components/GameRoom.tsx apps/frontend/src/styles/globals.design.css apps/frontend/src/locales/pt.json apps/frontend/src/locales/en.json apps/frontend/src/locales/zh.json
git commit -m "feat(frontend): faixa MatchStats — pote da partida + bônus + bolas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: PrizePanels — premiações do jogador vs sala + total destacado

No fim de jogo, separar claramente o que **o jogador** ganhou do que **a sala** pagou (todos os vencedores), com o total do jogador em evidência (celebração).

**Files:**
- Modify: `apps/frontend/src/components/gameroom/PrizePanels.tsx`
- Create: `apps/frontend/src/components/gameroom/PrizePanels.test.tsx`
- Modify: `apps/frontend/src/styles/globals.design.css`
- Modify: `apps/frontend/src/locales/{pt,en,zh}.json`

**Interfaces:**
- `PrizePanels` passa a calcular, no fim de jogo, as premiações da sala a partir de `localWinners` (usando `sumPayoutsByCurrency` + `countWinners` da Task 1). Renderiza um bloco `data-testid="gr-room-prizes"` com "Sala pagou {total} a {n} vencedores". O total do jogador (já somado) ganha destaque visual quando `playerWinEntries.length > 0`.

- [ ] **Step 1: i18n (3 locales)** — namespace `game_room`:

```jsonc
// pt.json
"player_prizes_title": "Seus prêmios",
"room_prizes_title": "Prêmios da sala",
"room_prizes_summary": "Sala pagou {{total}} a {{count}} vencedor(es)",
// en.json
"player_prizes_title": "Your prizes",
"room_prizes_title": "Room prizes",
"room_prizes_summary": "Room paid {{total}} to {{count}} winner(s)",
// zh.json
"player_prizes_title": "你的奖励",
"room_prizes_title": "房间奖励",
"room_prizes_summary": "房间向 {{count}} 位中奖者支付了 {{total}}"
```

- [ ] **Step 2: CSS** — adicionar:

```css
.gr-room-prizes { margin-top: .4rem; padding-top: .4rem; border-top: 1px dashed var(--cb-border-subtle); font-size: .72rem; color: var(--cb-text-secondary); display: flex; align-items: center; gap: .35rem; }
.gr-room-prizes .amt { font-family: var(--font-family-mono); font-weight: 700; color: var(--cb-text-primary); }
.gr-ended-breakdown-title { font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--cb-text-tertiary); margin-bottom: .15rem; }
```

- [ ] **Step 3: Escrever o teste (falha)**

```tsx
// apps/frontend/src/components/gameroom/PrizePanels.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import PrizePanels from './PrizePanels';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode }) => <button>{p.children}</button> }));
afterEach(() => cleanup());

const baseProps = {
  hasBanners: true, goldenBall: null, clearedStages: [],
  isEffectiveGameEnded: true, isStaticFinalState: false,
  playerWinEntries: [{ name: 'Linha', total: 1.5, currency: 'WAX', isCombination: false }],
  localWinners: [
    { ticket_id: '1', win_pattern: 'Linha', payouts: ['1.5000 WAX'] },
    { ticket_id: '2', win_pattern: 'Linha', payouts: ['2.0000 WAX'] },
  ],
  playerTickets: [{ id: '1', matrix: [] }],
  nextGame: null, nextGameTimer: '', game: null, room: null, now: Date.now(),
  onLeave: vi.fn(),
};

describe('PrizePanels — prêmios jogador vs sala', () => {
  it('mostra premiações da sala (total + nº vencedores)', () => {
    render(<PrizePanels {...baseProps} />);
    const room = screen.getByTestId('gr-room-prizes');
    // sala pagou 3.5000 WAX a 2 vencedores
    expect(room.textContent).toContain('3.5000');
    expect(room.textContent).toContain('2');
  });

  it('não mostra premiações da sala quando não há vencedores', () => {
    render(<PrizePanels {...baseProps} playerWinEntries={[]} localWinners={[]} />);
    expect(screen.queryByTestId('gr-room-prizes')).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/PrizePanels`
Expected: FAIL (sem `gr-room-prizes`).

- [ ] **Step 5: Implementar em `PrizePanels.tsx`**

(a) Importar utils: `import { sumPayoutsByCurrency, countWinners } from './prizeFormat';`.
(b) Calcular as premiações da sala (no corpo, antes do return — derivado de `localWinners`):

```tsx
  const roomPrize = (() => {
    const all = localWinners.flatMap(w => w.payouts);
    const sums = sumPayoutsByCurrency(all);
    if (sums.length === 0) return null;
    const total = sums.map(s => `${s.total.toFixed(4)} ${s.symbol}`).join(' + ');
    return { total, count: countWinners(localWinners) };
  })();
```

(c) Dentro do bloco do breakdown do jogador (após o `gr-ended-breakdown`, ainda dentro do `gr-ended-text`), adicionar a seção da sala:

```tsx
{roomPrize && (
  <div className="gr-room-prizes" data-testid="gr-room-prizes">
    <span>{t('game_room.room_prizes_summary', { total: roomPrize.total, count: roomPrize.count })}</span>
  </div>
)}
```

(d) Acrescentar um título "Seus prêmios" acima do breakdown do jogador (`gr-ended-breakdown-title` com `t('game_room.player_prizes_title')`) — só quando `playerWinEntries.length > 0`. Não alterar a lógica de cálculo de `playerWinEntries` nem os data-testids existentes.

- [ ] **Step 6: Rodar (PrizePanels + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "gameroom/PrizePanels|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; PrizePanels 2/2 PASS; caracterização PASS (o cenário de vitória da caracterização agora também renderiza `gr-room-prizes` — confirmar que isso não quebra as asserções existentes, que checam `gr-ended-overlay`/`gr-prize-breakdown`).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/gameroom/PrizePanels.tsx apps/frontend/src/components/gameroom/PrizePanels.test.tsx apps/frontend/src/styles/globals.design.css apps/frontend/src/locales/pt.json apps/frontend/src/locales/en.json apps/frontend/src/locales/zh.json
git commit -m "feat(frontend): premiações do jogador vs sala no fim de jogo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Verificação visual + PR

- [ ] **Step 1: Verificação visual manual**

Run: `pnpm --filter @cryptobingo/frontend dev`, abrir uma sala. Conferir: faixa de stats no topo mostra **Pote da partida** (= total apostado on-chain), **Bônus patrocinado** quando houver, e **Bolas** N/max; ao fim, o breakdown separa "Seus prêmios" de "Prêmios da sala" (sala pagou X a N vencedores); confete + total do jogador em destaque na vitória. Conferir `prefers-reduced-motion`.

- [ ] **Step 2: `/sonar-analyze`**

Rodar em `prizeFormat.ts`, `MatchStats.tsx`, `PrizePanels.tsx`. Corrigir BLOCKER/CRITICAL/MAJOR.

- [ ] **Step 3: Abrir PR**

```bash
git push -u origin feature/gameroom-fase3-premios-dados
```

PR para `develop` com `Closes #<N>`, checklist (typecheck/testes verdes, nota visual + reduced-motion, Sonar), e a nota de que **nenhum valor econômico é recalculado no front** (só exibição de dados on-chain). Revisor `frontend-reviewer`.

---

## Self-Review

**1. Cobertura do spec (Fase 3):** pote/jackpot da sala em destaque (`MatchStats`: pote = `total_wagered`, bônus = `sponsor_pool`, T2) ✔; premiações do jogador VS da sala (T3 — "Seus prêmios" vs "Sala pagou X a N", do `localWinners`) ✔ (ajuste do spec atendido); breakdown animado (já existe `gr-ended-breakdown` com `cb-fade-in`; preservado) ✔; stats da partida (bolas em `MatchStats`; pote) ✔; celebração (confete já existe; total do jogador destacado, T3) ✔. Sem recálculo de economia no front (utils só somam valores on-chain; T1) ✔.

**2. Placeholders:** `<N>` (issue) preenchido na criação. Código completo (utils, MatchStats, edits do PrizePanels), CSS e i18n. Sem TODO/TBD.

**3. Consistência de tipos:** `parseAsset`/`sumPayoutsByCurrency`/`countWinners` (T1) consumidos em T2 (`MatchStats`) e T3 (`PrizePanels`); `MatchStatsProps` alinhado ao que o `GameRoom` passa (`game.total_wagered.quantity`, `game.sponsor_pool`). data-testids `gr-match-stats`/`gr-pot`/`gr-room-prizes` consistentes entre JSX e testes.

**Observação para o executor:** **não recalcular RTP/GGR/base_multiplier no front** — `MatchStats` exibe `total_wagered` como o "pote" (valor apostado on-chain) e a soma de `localWinners` como o pago; jamais derivar prêmio aplicando percentuais. Em estado archived/estático, `localWinners` pode refletir só dados disponíveis — aceitável (a seção some quando vazia). Confirme que a caracterização continua verde após o `gr-room-prizes` aparecer no cenário de vitória.
