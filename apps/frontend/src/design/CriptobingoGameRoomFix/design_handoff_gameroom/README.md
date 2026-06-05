# Handoff: GameRoom — Layout Fix & Feature Additions

## Visão Geral

Este pacote documenta **todas as correções de layout e novas funcionalidades** aplicadas ao componente `GameRoom` da plataforma CryptoBingo. O arquivo de referência é `GameRoom Fix.html` — um protótipo de alta fidelidade que demonstra o estado final esperado.

## Sobre os Arquivos de Design

Os arquivos `.html` incluídos neste pacote são **referências de design criadas como protótipos HTML**. Eles não devem ser copiados diretamente para produção. A tarefa é **recriar este comportamento e visual no codebase existente** (React + TypeScript + TailwindCSS v4), usando os padrões e bibliotecas já estabelecidos no projeto.

O arquivo de referência de design é: `GameRoom Fix.html`  
O arquivo CSS de produção a ser editado é: `apps/frontend/src/styles/globals.design.css`  
O componente a ser editado é: `apps/frontend/src/components/GameRoom.tsx`

## Fidelidade

**Alta fidelidade (hifi).** O protótipo `GameRoom Fix.html` é pixel-perfect. Recriar exatamente as cores, espaçamentos, animações e comportamentos descritos abaixo.

---

## 1. Modelo de Scroll — Body Scroll (Page Scroll Model)

### Problema
O shell anterior usava `overflow: hidden` em cascata, impedindo o scroll das cartelas quando o conteúdo ultrapassava a viewport.

### Mudanças em `globals.design.css`

```css
/* ── ANTES ── */
html, body, #root { height: 100%; }
body { overflow: hidden; }
.gr-shell { width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }

/* ── DEPOIS ── */
html, body, #root { height: 100%; }
body {
  overflow-x: hidden;
  overflow-y: auto; /* body scrola — não mais overflow:hidden */
}
.gr-shell {
  width: 100%;
  min-height: 100%;   /* cresce com o conteúdo */
  /* remover: height:100% e overflow:hidden */
  display: flex;
  flex-direction: column;
}
```

### Navbar sticky

```css
/* ── ADICIONAR ao .gr-navbar ── */
.gr-navbar {
  /* ... propriedades existentes ... */
  position: sticky;
  top: 0;
  z-index: 50; /* fica visível ao scrolar */
}
```

---

## 2. Layout Principal — De Grid para Flex + `gr-top-row`

### Problema
O `gr-main` usava `display: grid` com `grid-template-rows: minmax(22rem, 1.2fr) auto minmax(8rem, 0.8fr)`, o que fixava as proporções e impedia que a seção superior crescesse dinamicamente com o número de bolas sorteadas.

### Novo modelo
- `gr-main` vira um **flex column** sem restrição de altura
- Um novo wrapper `gr-top-row` envolve `gr-stage` + `gr-patterns` lado a lado
- As seções crescem pelo conteúdo e empurram os tickets para baixo naturalmente

### Mudanças em `globals.design.css`

```css
/* ── REMOVER completamente os blocos abaixo ── */
.gr-main { display: grid; ... }
.gr-main.gr-comfortable { grid-template-columns: ...; grid-template-rows: ...; grid-template-areas: ...; }
.gr-main.gr-comfortable > .gr-stage    { grid-area: stage }
.gr-main.gr-comfortable > .gr-patterns { grid-area: patterns }
/* etc. */

/* ── SUBSTITUIR POR ── */
.gr-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: .875rem;
  padding: .5rem 1.5rem 1.25rem;
  overflow-y: visible; /* body faz o scroll */
}

/* Linha superior: stage + patterns lado a lado, altura pelo conteúdo */
.gr-top-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: .875rem;
  align-items: start; /* cada coluna tem sua própria altura */
}

/* compact variant */
.gr-main.gr-compact { gap: .625rem; padding: .5rem 1.25rem 1rem; }
.gr-main.gr-compact .gr-top-row { gap: .625rem; }
```

### Mudanças em `GameRoom.tsx` (estrutura JSX)

```tsx
/* ── ANTES ── */
<div className="gr-main gr-comfortable">
  <section className="gr-stage" data-stage-style="spotlight">
    {/* ... */}
  </section>
  {showPatterns && <PatternsPanel />}
  {hasBanners && (
    <div className="gr-banners-row">
      {/* banners */}
    </div>
  )}
  <div className="gr-tickets-section">
    {/* tickets */}
  </div>
</div>

/* ── DEPOIS ── */
<div className="gr-main gr-comfortable">

  {/* Linha superior: stage + patterns crescem juntos */}
  <div className="gr-top-row">
    <section className="gr-stage" data-stage-style="spotlight">
      {/* ... conteúdo da stage sem alteração ... */}
    </section>
    {showPatterns && <PatternsPanel />}
  </div>{/* fim gr-top-row */}

  {/* Banners: só renderiza o wrapper quando há pelo menos um banner ativo */}
  {hasBanners && (
    <div className="gr-banners-row">
      {isGoldenBall && <div className="gr-golden-banner">...</div>}
      {clearedStages.length > 0 && <div className="gr-stages-panel">...</div>}
      {isGameEnded && <div className="gr-ended-banner">...</div>}
    </div>
  )}

  <div className="gr-tickets-section">
    {/* tickets */}
  </div>
</div>
```

---

## 3. Stage — Altura Dinâmica

### Problema
Stage tinha `min-height: clamp(18rem, 44vh, 26rem)` fixo e `gr-stage-body` com `display: grid`. Isso impedia o crescimento dinâmico.

### Mudanças em `globals.design.css`

```css
/* .gr-stage — remover min-height fixa */
.gr-stage {
  position: relative;
  overflow: clip; /* clip em vez de hidden: não cria scroll container */
  background: var(--cb-stage-bg);
  border: 1px solid var(--cb-border-default);
  border-radius: 1.25rem;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  /* REMOVER: min-height: clamp(...) */
}

/* .gr-stage-body — trocar grid por flex */
.gr-stage-body {
  flex: 1;
  display: flex;         /* era display: grid */
  flex-direction: column;
  position: relative;
  z-index: 1;
  overflow: visible;     /* era overflow: hidden */
  /* REMOVER: min-height: 0 */
}

/* .gr-stage-spot — altura mínima para a bola hero */
.gr-stage-spot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .75rem;
  position: relative;    /* contexto de posicionamento para .gr-ball-halo */
  min-height: 16rem;     /* garante espaço mínimo para bola hero */
  padding: .5rem .75rem; /* era 1rem — reduzido para dar mais folga */
  overflow: visible;
  /* REMOVER: flex: 1; min-height: 0 */
}
```

### Variant `data-stage-style="spotlight"` (adicionar se não existir)

```css
.gr-stage[data-stage-style="spotlight"] {
  background:
    radial-gradient(circle at 50% 40%, rgb(139 92 246 / .22) 0%, rgb(124 58 237 / .08) 40%, transparent 70%),
    linear-gradient(180deg, var(--color-surface-800), var(--color-surface-900));
}
.gr-stage[data-stage-style="spotlight"] .gr-ball-halo {
  width: 26rem;
  height: 26rem;
}
```

---

## 4. Ball Halo — Fix de Centralização

### Problema
`.gr-ball-halo` usava `position: absolute` sem `top/left`, resultando em posicionamento no canto top-left do pai em vez de centrado sobre a bola.

### Mudanças em `globals.design.css`

```css
/* ── ANTES ── */
.gr-ball-halo {
  position: absolute;
  width: 22rem; height: 22rem;
  /* sem top/left → renderiza no canto */
  background: radial-gradient(...);
  z-index: -1;
  animation: cb-halo-pulse 2.8s ease-in-out infinite;
}

/* ── DEPOIS ── */
.gr-ball-halo {
  position: absolute;
  width: 22rem; height: 22rem;
  border-radius: 50%;
  top: 50%;                          /* FIX: centrado verticalmente */
  left: 50%;                         /* FIX: centrado horizontalmente */
  transform: translate(-50%, -50%);  /* FIX: offset pelo próprio tamanho */
  background: radial-gradient(circle, color-mix(in srgb, var(--ball-color, #8b5cf6) 30%, transparent) 0%, transparent 60%);
  filter: blur(6px);
  z-index: -1;
  pointer-events: none;
  animation: cb-halo-pulse 2.8s ease-in-out infinite;
}

/* ── KEYFRAME: incluir translate em cada frame para não conflitar ── */
@keyframes cb-halo-pulse {
  0%,  100% { opacity: .5; transform: translate(-50%, -50%) scale(1);   }
  50%       { opacity: .8; transform: translate(-50%, -50%) scale(1.1); }
}
```

---

## 5. Sequência de Bolas — Quebra de Linha

### Problema
`.gr-sequence` usava `overflow-x: auto` — bolas saíam da tela pela direita.

### Mudanças em `globals.design.css`

```css
/* ── ANTES ── */
.gr-sequence {
  display: flex;
  gap: .3rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: .15rem;
}

/* ── DEPOIS ── */
.gr-sequence {
  display: flex;
  flex-wrap: wrap;           /* quebra de linha ao invés de scroll horizontal */
  gap: .3rem;
  align-items: flex-start;
  align-content: flex-start;
  padding-bottom: .15rem;
  /* REMOVER: overflow-x: auto; scrollbar-width: none */
}

/* ── TAMBÉM: remover max-height e overflow do gr-stage-footer ── */
.gr-stage-footer {
  padding: .5rem 1rem .75rem;
  display: flex;
  flex-direction: column;
  gap: .45rem;
  border-top: 1px solid var(--cb-border-subtle);
  background: color-mix(in srgb, var(--cb-bg-base) 30%, transparent);
  flex-shrink: 0;
  /* REMOVER: max-height; overflow: hidden */
}

/* ── TAMBÉM: remover overflow: hidden do gr-patterns ── */
.gr-patterns {
  /* ... propriedades existentes ... */
  /* REMOVER: min-height: 0; overflow: hidden */
}
```

---

## 6. Banners — Classes que Faltavam

As classes abaixo são **usadas nos componentes mas não tinham CSS definido**. Adicionar ao `globals.design.css`:

```css
/* ── gr-banners-row: wrapper obrigatório ── */
.gr-banners-row {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

/* ── Golden Ball (ADR-014) ── */
.gr-golden-banner {
  display: flex; align-items: center; gap: 1rem;
  padding: .875rem 1.25rem;
  background: linear-gradient(135deg, rgba(251,191,36,.14), rgba(245,158,11,.06));
  border: 1px solid rgba(251,191,36,.35);
  border-radius: .875rem;
  animation: cb-fade-in .3s ease forwards;
}
.gr-golden-banner .gr-golden-icon {
  font-size: 1.6rem; flex-shrink: 0;
  filter: drop-shadow(0 0 12px rgba(251,191,36,.7));
}
.gr-golden-banner .gr-golden-text {
  flex: 1; display: flex; flex-direction: column; gap: .1rem;
}
.gr-golden-banner .gr-golden-text strong {
  font-family: var(--font-family-display);
  font-size: .92rem; font-weight: 700; color: var(--cb-accent);
}
.gr-golden-banner .gr-golden-text span {
  font-size: .78rem; color: var(--cb-text-secondary);
}
.gr-golden-banner .gr-golden-mult {
  font-family: var(--font-family-display);
  font-size: 1.6rem; font-weight: 800;
  color: var(--cb-accent); letter-spacing: -.03em;
  text-shadow: 0 0 20px rgba(251,191,36,.55);
  flex-shrink: 0;
}

/* ── Multi-Match Stages (ADR-013) ── */
.gr-stages-panel {
  display: flex; align-items: center; gap: .875rem;
  padding: .5rem 1.125rem;
  background: var(--cb-bg-card);
  border: 1px solid var(--cb-border-default);
  border-radius: .75rem;
  box-shadow: var(--shadow-card);
}
.gr-stages-title {
  font-size: .62rem; font-weight: 800;
  letter-spacing: .14em; text-transform: uppercase;
  color: var(--cb-text-tertiary); flex-shrink: 0;
}
.gr-stages-list {
  display: flex; align-items: center;
  gap: .4rem; flex-wrap: wrap;
}
.gr-stage-item {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .18rem .55rem;
  background: var(--cb-brand-subtle);
  border: 1px solid rgba(139,92,246,.25);
  border-radius: 9999px;
}
.gr-stage-badge {
  font-family: var(--font-family-mono);
  font-size: .7rem; font-weight: 700; color: var(--cb-brand);
}
.gr-stage-count { font-size: .67rem; color: var(--cb-text-secondary); }

/* ── Game Ended (ADR-014) ── */
.gr-ended-banner {
  display: flex; align-items: center; gap: 1rem;
  padding: .875rem 1.25rem;
  background: linear-gradient(135deg, rgba(139,92,246,.12), rgba(30,30,53,.88));
  border: 1px solid rgba(139,92,246,.3);
  border-radius: .875rem;
  animation: cb-fade-in .4s ease forwards;
}
.gr-ended-banner .gr-ended-icon { font-size: 1.6rem; flex-shrink: 0; }
.gr-ended-banner .gr-ended-text {
  flex: 1; display: flex; flex-direction: column; gap: .15rem;
}
.gr-ended-banner .gr-ended-text strong {
  font-family: var(--font-family-display);
  font-size: .92rem; font-weight: 700; color: var(--cb-text-primary);
}
.gr-ended-banner .gr-ended-text span { font-size: .78rem; color: var(--cb-text-secondary); }
.gr-ended-banner .gr-ended-next {
  font-size: .72rem; color: var(--cb-brand); font-weight: 600; margin-top: .1rem;
}
```

---

## 7. Ticket — Realce de Padrões Completados

### Novas classes CSS (adicionar em `globals.design.css`)

```css
/* Animação pulsante para células em padrão completado */
.gr-bingo-cell.in-winning-pattern {
  outline: 2px solid var(--cb-accent);
  outline-offset: -2px;
  z-index: 1;
  animation: cb-winning-blink 1.8s ease-in-out infinite;
}
@keyframes cb-winning-blink {
  0%,  100% { outline-color: var(--cb-accent); box-shadow: inset 0 0 8px rgba(251,191,36,.25); }
  50%       { outline-color: rgba(251,191,36,.3); box-shadow: none; }
}

/* Seção de badges de padrões completados */
.gr-ticket-patterns {
  display: flex;
  flex-wrap: wrap;
  gap: .25rem;
  padding: .35rem .65rem;
  border-top: 1px solid rgba(251,191,36,.2);
  background: rgba(251,191,36,.05);
}
.gr-ticket-pattern-badge {
  display: inline-flex; align-items: center; gap: .2rem;
  padding: .1rem .45rem;
  background: rgba(251,191,36,.15);
  border: 1px solid rgba(251,191,36,.35);
  border-radius: 9999px;
  font-size: .62rem; font-weight: 700;
  color: var(--cb-accent);
  animation: cb-fade-in .3s ease forwards;
}
```

### Lógica no `TicketCard` (GameRoom.tsx)

Adicionar ao componente `TicketCard` a detecção de padrões completados:

```tsx
// 1. Receber patterns como prop
interface TicketCardProps {
  ticketId: string;
  matrix: number[];
  drawnSet: Set<number>;
  lastDrawn: number | null;
  patterns: Pattern[]; // ← adicionar
}

// 2. Dentro do componente, ANTES do JSX:

// Monta flat[25]: grid 5×5 linearizado (flat[12] = null = FREE, sempre marcado)
const B = matrix.slice(0, 5);
const I = matrix.slice(5, 10);
const Nr = matrix.slice(10, 14);
const G = matrix.slice(14, 19);
const O = matrix.slice(19, 24);
const N = [Nr[0], Nr[1], null, Nr[2], Nr[3]];

const flat: (number | null)[] = [];
for (let r = 0; r < 5; r++) flat.push(B[r], I[r], N[r], G[r], O[r]);
// flat[12] === null (free space)

// Verifica se uma célula pelo índice flat está marcada
const isCellMarked = (i: number) => flat[i] === null || drawnSet.has(flat[i] as number);

// Padrões completados: todos os bits=1 do padrão têm célula marcada
const completedPatterns = patterns.filter(p =>
  p.cells.every((req, i) => !req || isCellMarked(i))
);

// Índices flat de células que fazem parte de algum padrão completado
const winningCells = new Set<number>();
completedPatterns.forEach(p =>
  p.cells.forEach((req, i) => { if (req) winningCells.add(i); })
);

const isWinner = completedPatterns.length > 0;

// 3. No JSX da célula, adicionar a classe:
// flatIdx = rowIndex * 5 + colIndex
const inWin = winningCells.has(flatIdx);
className={[
  'gr-bingo-cell',
  isFree ? 'is-free' : '',
  isMarked && !isFree ? 'is-marked' : '',
  isJustHit ? 'is-just-hit' : '',
  inWin ? 'in-winning-pattern' : '',  // ← adicionar
].filter(Boolean).join(' ')}

// 4. Adicionar seção de badges após a grade, antes do footer:
{completedPatterns.length > 0 && (
  <div className="gr-ticket-patterns">
    {completedPatterns.map(p => (
      <span key={p.name} className="gr-ticket-pattern-badge">
        <span>★</span>{p.name}
      </span>
    ))}
  </div>
)}

// 5. Atualizar is-winner no ticket:
className={[
  'gr-ticket',
  isWinner ? 'is-winner' : '',
  isClose && !isWinner ? 'is-close' : '',
  isDimmed ? 'is-dimmed' : '',
].filter(Boolean).join(' ')}
```

### Estrutura de `Pattern` (tipo TypeScript)

```ts
interface Pattern {
  name: string;
  prize: string;    // ex: "25.00"
  cells: number[];  // array de 25 elementos (0 ou 1), indexado row-major
                    // índice = row * 5 + col
                    // índice 12 = FREE SPACE (sempre marcado)
}
```

### Mapeamento do índice flat → posição na grade

```
Índice: 00 01 02 03 04  → Linha 1 (B0, I0, N0, G0, O0)
        05 06 07 08 09  → Linha 2 (B1, I1, N1, G1, O1)
        10 11 12 13 14  → Linha 3 (B2, I2, FREE, G2, O2)  ← índice 12 = FREE
        15 16 17 18 19  → Linha 4 (B3, I3, N2, G3, O3)
        20 21 22 23 24  → Linha 5 (B4, I4, N3, G4, O4)
```

---

## 8. Checklist de Implementação

- [ ] `globals.design.css` — Body scroll model (`body overflow-y: auto`, `gr-shell min-height: 100%`)
- [ ] `globals.design.css` — `.gr-navbar { position: sticky; top: 0; z-index: 50 }`
- [ ] `globals.design.css` — Substituir `.gr-main` grid por flex column + `.gr-top-row`
- [ ] `globals.design.css` — `.gr-stage` sem `min-height` fixa
- [ ] `globals.design.css` — `.gr-stage-body` flex em vez de grid, `overflow: visible`
- [ ] `globals.design.css` — `.gr-stage-spot { min-height: 16rem; padding: .5rem .75rem }`
- [ ] `globals.design.css` — `.gr-stage-footer` sem `max-height` e sem `overflow: hidden`
- [ ] `globals.design.css` — `.gr-sequence { flex-wrap: wrap }` (remover `overflow-x: auto`)
- [ ] `globals.design.css` — `.gr-patterns` sem `min-height: 0; overflow: hidden`
- [ ] `globals.design.css` — `.gr-ball-halo { top: 50%; left: 50%; transform: translate(-50%,-50%) }`
- [ ] `globals.design.css` — Keyframe `cb-halo-pulse` com `translate(-50%,-50%)` em cada frame
- [ ] `globals.design.css` — Adicionar `.gr-banners-row`, `.gr-golden-banner`, `.gr-stages-panel`, `.gr-ended-banner` e sub-classes
- [ ] `globals.design.css` — Adicionar `.gr-stage[data-stage-style="spotlight"]`
- [ ] `globals.design.css` — Atualizar `.in-winning-pattern` com animação pulsante
- [ ] `globals.design.css` — Adicionar `.gr-ticket-patterns` e `.gr-ticket-pattern-badge`
- [ ] `GameRoom.tsx` — Envolver `<gr-stage>` + `<PatternsPanel>` em `<div className="gr-top-row">`
- [ ] `GameRoom.tsx` — Envolver banners em `<div className="gr-banners-row">` (render condicional)
- [ ] `GameRoom.tsx` — Atualizar `TicketCard`: lógica de `completedPatterns` + `winningCells` + badges

---

## Arquivos Incluídos

| Arquivo | Descrição |
|---|---|
| `GameRoom Fix.html` | Protótipo de referência — estado final esperado |
| `README.md` | Este documento |

## Notas

- O protótipo usa React/Babel inline e CSS vanilla para demonstração. No codebase real, usar os componentes React existentes e o sistema de classes CSS definido em `globals.design.css`.
- Os dados de teste no protótipo (bolas sorteadas, matrizes de cartelas) são estáticos. No codebase real, esses dados vêm do WebSocket/hook `useSlowReveal`.
- Os padrões de vitória vêm de `room.patterns` ou equivalente na API. O array `cells[25]` deve corresponder ao formato descrito na seção 7.
