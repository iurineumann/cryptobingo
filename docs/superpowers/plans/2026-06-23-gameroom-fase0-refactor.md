# GameRoom Fase 0 — Refactor base (sem mudança de comportamento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar o monólito `apps/frontend/src/components/GameRoom.tsx` (1176 linhas) em um hook de estado + componentes isolados, **sem alterar comportamento nem markup visual**.

**Architecture:** `GameRoom.tsx` vira orquestrador fino. Toda a lógica de estado/derivações migra para o hook `useGameRoomState`. Cada região de UI vira um componente que recebe props explícitas e renderiza markup `gr-*` idêntico ao atual. Rede de segurança = um teste de caracterização que monta `GameRoom` com dependências mockadas e trava os `data-testid` e textos-chave antes e depois de cada extração.

**Tech Stack:** React 18 + TS, Vite, Vitest + @testing-library/react, i18next, Wharfkit (`@wharfkit/session`/`antelope`), Socket.io (via `useSlowReveal`).

## Global Constraints

- Idioma de código/comentários/commits: **PT-BR**. Comentários explicam o *porquê*.
- **Zero mudança de comportamento/markup** nesta fase. Nenhuma classe `gr-*` ou `data-testid` removida sem equivalente idêntico. Nenhuma lógica de payout/economia alterada (ADR-005/010/016 intocados).
- Commits PT-BR `tipo(escopo): ...` terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Typecheck do frontend: `npx tsc --noEmit` (rodar em `apps/frontend`). Testes: `pnpm --filter @cryptobingo/frontend test` (vitest).
- Git flow: trabalho em branch `feature/gameroom-fase0-refactor` saída de `develop`. PR com `Closes #<N>` para `develop`.
- ADR-030 (arquitetura de componentes da GameRoom) acompanha o PR.
- Pré-PR: `/sonar-analyze` em cada `.tsx` novo/modificado; revisor `frontend-reviewer`.

## Estrutura de arquivos alvo

Diretório novo: `apps/frontend/src/components/gameroom/`

| Arquivo | Responsabilidade |
|---|---|
| `gameroom/useGameRoomState.ts` | Hook: estado local, efeitos, `loadGame`, wiring `useSlowReveal`, **todas** as derivações `useMemo`. Retorna objeto consumido pelo orquestrador. |
| `gameroom/GameRoomHeader.tsx` | Navbar (`gr-navbar`): logo, crumb, status, saldo, idioma, status WS, menu ⋮. |
| `gameroom/DrawStage.tsx` | Palco (`gr-stage`): bola hero, call, histórico (`gr-sequence`), progresso. |
| `gameroom/PatternsPanel.tsx` | Aside (`gr-patterns`): padrões + combinações com proximidade. |
| `gameroom/PrizePanels.tsx` | Banners (`gr-banners-row`): golden ball, stages, ended/breakdown + confete. |
| `gameroom/TicketsGrid.tsx` | Seção (`gr-tickets-section`): cartelas agrupadas + botão comprar. |
| `gameroom/RoomSocial.tsx` | Wrapper do `ChatFloating` (placeholder de social; expande na Fase 4). |
| `GameRoom.tsx` | Orquestrador fino: chama o hook, compõe os componentes, modais. |
| `gameroom/GameRoom.characterization.test.tsx` | Teste de caracterização (rede de segurança). |

> ⚠️ **Pré-requisito:** `fix/multimatch-slow-reveal` mergeada e `develop` atualizado antes de iniciar. Criar branch: `git checkout develop && git pull && git checkout -b feature/gameroom-fase0-refactor`.

---

### Task 1: Teste de caracterização (rede de segurança)

Trava o comportamento renderizado ANTES de qualquer extração. Deve passar contra a `GameRoom.tsx` atual, sem modificá-la.

**Files:**
- Create: `apps/frontend/src/components/gameroom/GameRoom.characterization.test.tsx`

**Interfaces:**
- Consumes: `GameRoom` default export de `../GameRoom`.
- Produces: nada (teste). Garante os testids: `gr-room-header`, `gr-ball-hero`, `gr-ball-history`, `gr-my-tickets`, e em estado encerrado `gr-ended-overlay` + `gr-prize-breakdown`.

- [ ] **Step 1: Escrever o teste de caracterização**

```tsx
// apps/frontend/src/components/gameroom/GameRoom.characterization.test.tsx
// Rede de segurança da Fase 0: trava o markup renderizado da GameRoom.
// Mocka useSlowReveal, sessão Wharfkit e a API para isolar a renderização.
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';

// i18n: devolve a própria chave (espelha o padrão de TicketCard.test.tsx)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

// useSlowReveal controlável por teste
const slowRevealState = {
  drawnBalls: [] as Array<{ order: number; number: number; timestamp: string }>,
  lastBall: null as null | { order: number; number: number; timestamp: string },
  isDrawing: false,
  winners: [] as unknown[],
  isAborted: false,
  abortReason: null as string | null,
  wsStatus: 'connected' as const,
  isGameEnded: false,
  goldenBall: null as unknown,
  clearedStages: [] as unknown[],
  drawMode: 'standard' as const,
};
vi.mock('../../hooks/useSlowReveal', () => ({
  useSlowReveal: () => slowRevealState,
}));

// API: room/metadata vazios
vi.mock('../../services/api', () => ({
  fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [] }),
  fetchRoom: vi.fn().mockResolvedValue({ room_id: '1', metadata: { name: 'Sala Teste' }, current_game_id: '0' }),
}));
vi.mock('./../ticketUtils', async (orig) => await orig());

// Sessão Wharfkit mínima: games (1 linha funding) + tickets vazios + balances vazios
function makeSession(status = 'funding'): Session {
  const game = {
    game_id: String(Date.now()), status, drawn_balls: [], room_id: '1',
    ticket_price: { quantity: '1.0000 WAX', contract: 'eosio.token' },
    gametype_id: '0', end_time: 0,
  };
  const get_table_rows = vi.fn(async ({ table }: { table: string }) => {
    if (table === 'games') return { rows: [game], more: false };
    return { rows: [], more: false };
  });
  return {
    actor: 'player1',
    client: { v1: { chain: { get_table_rows } } },
  } as unknown as Session;
}

const profile = { wallet_address: 'player1' } as MongoUserProfile;

async function renderRoom(session: Session) {
  const { default: GameRoom } = await import('../GameRoom');
  return render(
    <GameRoom gameId="100" roomId="1" session={session} profile={profile} onLeave={vi.fn()} />,
  );
}

describe('GameRoom — caracterização Fase 0', () => {
  beforeEach(() => {
    slowRevealState.drawnBalls = [];
    slowRevealState.lastBall = null;
    slowRevealState.isGameEnded = false;
    slowRevealState.winners = [];
  });

  it('renderiza header, palco e seção de cartelas no estado funding', async () => {
    renderRoom(makeSession('funding'));
    expect(await screen.findByTestId('gr-room-header')).toBeTruthy();
    expect(await screen.findByTestId('gr-ball-hero')).toBeTruthy();
    expect(await screen.findByTestId('gr-ball-history')).toBeTruthy();
    expect(await screen.findByTestId('gr-my-tickets')).toBeTruthy();
  });

  it('mostra estrela ⭐ no hero quando nenhuma bola foi sorteada', async () => {
    renderRoom(makeSession('funding'));
    expect((await screen.findByTestId('gr-ball-hero-number')).textContent).toBe('⭐');
  });

  it('renderiza overlay de fim quando o slow reveal indica jogo encerrado', async () => {
    slowRevealState.isGameEnded = true;
    renderRoom(makeSession('drawn'));
    expect(await screen.findByTestId('gr-ended-overlay')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que PASSA contra a GameRoom atual**

Run: `cd apps/frontend && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: PASS (3 testes). Se falhar, ajustar o mock até refletir o comportamento atual — **não** alterar `GameRoom.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/gameroom/GameRoom.characterization.test.tsx
git commit -m "test(frontend): caracterização da GameRoom antes do refactor Fase 0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Extrair `useGameRoomState`

Move estado + efeitos + `loadGame` + **todas** as derivações para um hook. Comportamento idêntico.

**Files:**
- Create: `apps/frontend/src/components/gameroom/useGameRoomState.ts`
- Modify: `apps/frontend/src/components/GameRoom.tsx` (passa a consumir o hook)

**Interfaces:**
- Consumes: `useSlowReveal`, `ticketUtils`, `services/api`, sessão Wharfkit (igual hoje).
- Produces: `useGameRoomState({ gameId, roomId, session })` retorna **exatamente** os valores hoje derivados no corpo do componente:

```ts
export interface GameRoomState {
  game: BlockchainGameState | null;
  nextGame: BlockchainGameState | null;
  playerTickets: Array<{ id: string; matrix: number[]; pricePaid?: string }>;
  room: EnrichedRoom | null;
  loadingGame: boolean;
  maxBalls: number;
  gamePatterns: Pattern[];
  gameCombinations: CombinationRuleInput[];
  ingameBalances: BlockchainBalance[];
  // WS
  drawnBalls: DrawnBall[]; lastBall: DrawnBall | null; isDrawing: boolean;
  winners: WinnerPayload[]; isAborted: boolean; abortReason: string | null;
  wsStatus: string; goldenBall: GoldenBallInfo | null; clearedStages: ClearedStage[];
  // derivados
  effectiveBalls: DrawnBall[]; drawnNumbers: number[]; drawnSet: Set<number>;
  lastDrawn: number | null; isEffectiveGameEnded: boolean;
  effectiveDisplayStatus: string; gameStatusText: string;
  timeRemaining: string; nextGameTimer: string;
  localWinners: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }>;
  winnerMap: Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>;
  patternByName: Map<string, Pattern>;
  playerWinEntries: Array<{ name: string; total: number; currency: string; isCombination: boolean }>;
  adjustedPatternWinCount: Map<string, number>;
  allGameCombinationWinCount: Map<string, number>;
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  combinationCells: Map<string, number[]>;
  patternProximityMap: Map<string, number>;
  combinationProximityMap: Map<string, number>;
  sortedPatterns: Pattern[];
  groupedTickets: ReturnType<typeof groupTicketsByCategory>;
  currencySymbol: string; ticketPrice: ExtendedAsset | undefined;
  col: string; color: string; hasBanners: boolean;
  now: number;
  loadGame: () => Promise<void>;
}
```

- [ ] **Step 1: Criar o hook movendo a lógica verbatim**

Criar `useGameRoomState.ts` com assinatura `export function useGameRoomState({ gameId, roomId, session }: { gameId: string; roomId?: string; session: Session }): GameRoomState`. Mover **sem alterar lógica** o conteúdo das linhas **80–653** da `GameRoom.tsx` atual (todos os `useState`, `useEffect`, `useMemo`, `useCallback loadGame`, constantes locais `STATUS_DOT`/`wsStatusClass`/`AUTO_LOCK_SEC`/`CONTRACT`, helpers `fmtCountdown`/`parseHexMatrix`). Mover também os refs de animação? **Não** — `heroRef`/`seqRef`/`stageRef`/`patternsRef`/`prevBall` e seus dois `useEffect` (linhas 486–513) pertencem ao `DrawStage`/`PatternsPanel`; deixá-los fora do hook (entram nas Tasks 4 e 5). Ao final, `return { ...todos os campos da interface }`.

Copiar `parseHexMatrix` (linhas 38–45) e `CONTRACT` (linha 67) para dentro de `useGameRoomState.ts` (usados só pela lógica de estado). **NÃO** copiar `fmtCountdown` para o hook — ele só é usado no JSX do banner de fim (linha 1032) → vai para `PrizePanels` na Task 6 (fonte única). `STATUS_DOT` (137–146) e `wsStatusClass` (634–639) são usados na renderização → exportá-los do hook como constantes nomeadas reexportadas:

```ts
// constantes de apresentação reusadas pelo header/stage
export const STATUS_DOT: Record<string, string> = { /* ...verbatim 138–146... */ };
export const WS_STATUS_CLASS: Record<string, string> = { /* ...verbatim 635–639... */ };
```

- [ ] **Step 2: Consumir o hook na GameRoom**

Na `GameRoom.tsx`, remover as linhas 80–653 (exceto os refs/efeitos de animação que ficam para Tasks 4/5) e substituir por:

```tsx
const state = useGameRoomState({ gameId, roomId, session });
// desestruturar o que o JSX usa (mantém nomes idênticos para minimizar diff do JSX)
const {
  game, nextGame, playerTickets, room, loadingGame, maxBalls, gamePatterns,
  gameCombinations, ingameBalances, drawnBalls, lastBall, isDrawing, isAborted,
  wsStatus, goldenBall, clearedStages, effectiveBalls, drawnNumbers, drawnSet,
  lastDrawn, isEffectiveGameEnded, effectiveDisplayStatus, gameStatusText,
  timeRemaining, nextGameTimer, localWinners, winnerMap, patternByName,
  playerWinEntries, adjustedPatternWinCount, allGameCombinationWinCount,
  completedCombinationsPerTicket, combinationCells, patternProximityMap,
  combinationProximityMap, sortedPatterns, groupedTickets, currencySymbol,
  ticketPrice, col, color, hasBanners, now, loadGame,
} = state;
const roomPatterns = gamePatterns;
```

Manter o JSX (655–1176) inalterado. Manter `showBuyModal`/`showPatterns`/`density` como estado local do orquestrador (são UI puramente local do orquestrador/painéis — `showPatterns` migra na Task 4).

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: 0 erros. Corrigir imports (`useSlowReveal`, tipos) movidos para o hook.

- [ ] **Step 4: Rodar o teste de caracterização**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: PASS (3 testes, sem mudança).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gameroom/useGameRoomState.ts apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair useGameRoomState da GameRoom

Move estado, efeitos e derivações para hook isolado. Comportamento idêntico.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Extrair `<GameRoomHeader>`

**Files:**
- Create: `apps/frontend/src/components/gameroom/GameRoomHeader.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Consumes: campos de `state` + callbacks de navegação.
- Produces:

```tsx
export interface GameRoomHeaderProps {
  gameId: string;
  room: EnrichedRoom | null;
  game: BlockchainGameState | null;
  effectiveDisplayStatus: string;
  gameStatusText: string;
  timeRemaining: string;
  isDrawing: boolean;
  isAborted: boolean;
  ingameBalances: BlockchainBalance[];
  wsStatus: string;
  isAdmin?: boolean;
  theme?: 'dark' | 'light';
  onLeave: () => void;
  onGoToHistory?: () => void;
  onGoToWallet?: () => void;
  onGoToAdmin?: () => void;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  onLanguageChange?: (locale: string) => void;
}
export default function GameRoomHeader(props: GameRoomHeaderProps): JSX.Element;
```

- [ ] **Step 1: Criar o componente**

Mover o JSX do `<header className="gr-navbar">` (linhas **659–764** atuais) verbatim para o corpo do `return` de `GameRoomHeader`. Importar no topo: `useTranslation`, `Logo`, `Button`, `DropdownMenu*`, e `STATUS_DOT`/`WS_STATUS_CLASS` de `./useGameRoomState`. Trocar referências locais por `props.*`. `i18n` vem de `useTranslation()` dentro do componente.

- [ ] **Step 2: Usar na GameRoom**

Substituir as linhas 659–764 por:

```tsx
<GameRoomHeader
  gameId={gameId} room={room} game={game}
  effectiveDisplayStatus={effectiveDisplayStatus} gameStatusText={gameStatusText}
  timeRemaining={timeRemaining} isDrawing={isDrawing} isAborted={isAborted}
  ingameBalances={ingameBalances} wsStatus={wsStatus}
  isAdmin={isAdmin} theme={theme}
  onLeave={onLeave} onGoToHistory={onGoToHistory} onGoToWallet={onGoToWallet}
  onGoToAdmin={onGoToAdmin} onToggleTheme={onToggleTheme} onLogout={onLogout}
  onLanguageChange={onLanguageChange}
/>
```

- [ ] **Step 3: Typecheck + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: 0 erros TS; 3 testes PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/gameroom/GameRoomHeader.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair GameRoomHeader (navbar) da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Extrair `<DrawStage>`

**Files:**
- Create: `apps/frontend/src/components/gameroom/DrawStage.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Consumes: derivados de bola/histórico/progresso do `state`.
- Produces:

```tsx
export interface DrawStageProps {
  wsStatus: string;
  drawnNumbers: number[];
  effectiveBalls: DrawnBall[];
  lastDrawn: number | null;
  col: string;
  color: string;
  maxBalls: number;
  /** ref encaminhada para o ResizeObserver que sincroniza altura com o PatternsPanel */
  stageRef: React.RefObject<HTMLElement>;
}
export default function DrawStage(props: DrawStageProps): JSX.Element;
```

- [ ] **Step 1: Criar o componente**

Mover o `<section ref={stageRef} className="gr-stage">` (linhas **773–847**) verbatim. Mover para dentro do componente o ref `heroRef`/`prevBall` e o `useEffect` da animação de drop (linhas **490, 506–513**) — são internos ao palco. Importar `getCol`, `BINGO_COLORS` de `../ticketUtils` e `WS_STATUS_CLASS` de `./useGameRoomState`. `stageRef` vem por prop (o orquestrador precisa dele para o `ResizeObserver` que dimensiona o PatternsPanel).

- [ ] **Step 2: Usar na GameRoom**

Substituir as linhas 773–847 por `<DrawStage wsStatus={wsStatus} drawnNumbers={drawnNumbers} effectiveBalls={effectiveBalls} lastDrawn={lastDrawn} col={col} color={color} maxBalls={maxBalls} stageRef={stageRef} />`. Manter `stageRef` declarado no orquestrador (linha 488) e o `ResizeObserver` (linhas 493–504) no orquestrador, pois ele cruza `stageRef`↔`patternsRef`.

- [ ] **Step 3: Typecheck + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: 0 erros; 3 PASS (testids `gr-ball-hero`, `gr-ball-hero-number`, `gr-ball-history` continuam).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/gameroom/DrawStage.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair DrawStage (palco do sorteio) da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Extrair `<PatternsPanel>`

**Files:**
- Create: `apps/frontend/src/components/gameroom/PatternsPanel.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Produces:

```tsx
export interface PatternsPanelProps {
  loadingGame: boolean;
  roomPatterns: Pattern[];
  sortedPatterns: Pattern[];
  gameCombinations: CombinationRuleInput[];
  adjustedPatternWinCount: Map<string, number>;
  allGameCombinationWinCount: Map<string, number>;
  patternProximityMap: Map<string, number>;
  combinationProximityMap: Map<string, number>;
  combinationCells: Map<string, number[]>;
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  currencySymbol: string;
  onClose: () => void;
  /** ref para sincronizar altura com o DrawStage */
  panelRef: React.RefObject<HTMLElement>;
}
export default function PatternsPanel(props: PatternsPanelProps): JSX.Element;
```

- [ ] **Step 1: Criar o componente**

Mover o `<aside ref={patternsRef} className="gr-patterns">` (linhas **851–934**) verbatim, trocando `patternsRef`→`panelRef`, `setShowPatterns(false)`→`onClose()`, e referências locais por props.

- [ ] **Step 2: Usar na GameRoom**

`showPatterns` e `patternsRef` permanecem no orquestrador (controlam visibilidade + ResizeObserver). Substituir 850–935 por:

```tsx
{showPatterns && (
  <PatternsPanel
    loadingGame={loadingGame} roomPatterns={roomPatterns} sortedPatterns={sortedPatterns}
    gameCombinations={gameCombinations} adjustedPatternWinCount={adjustedPatternWinCount}
    allGameCombinationWinCount={allGameCombinationWinCount}
    patternProximityMap={patternProximityMap} combinationProximityMap={combinationProximityMap}
    combinationCells={combinationCells} completedCombinationsPerTicket={completedCombinationsPerTicket}
    currencySymbol={currencySymbol} onClose={() => setShowPatterns(false)} panelRef={patternsRef}
  />
)}
```

- [ ] **Step 3: Typecheck + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: 0 erros; 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/gameroom/PatternsPanel.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair PatternsPanel da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Extrair `<PrizePanels>` (banners + confete)

**Files:**
- Create: `apps/frontend/src/components/gameroom/PrizePanels.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Produces:

```tsx
export interface PrizePanelsProps {
  hasBanners: boolean;
  goldenBall: GoldenBallInfo | null;
  clearedStages: ClearedStage[];
  isEffectiveGameEnded: boolean;
  isStaticFinalState: boolean;
  playerWinEntries: Array<{ name: string; total: number; currency: string; isCombination: boolean }>;
  localWinners: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }>;
  playerTickets: Array<{ id: string; matrix: number[] }>;
  nextGame: BlockchainGameState | null;
  nextGameTimer: string;
  game: BlockchainGameState | null;
  room: EnrichedRoom | null;
  now: number;
  onLeave: () => void;
  onGoToHistory?: () => void;
}
export default function PrizePanels(props: PrizePanelsProps): JSX.Element | null;
```

> `isStaticFinalState` é derivado interno do hook (linhas 164–167); adicioná-lo ao retorno de `GameRoomState` na Task 2 (incluir em `GameRoomState` e no `return`). Atualizar a interface da Task 2 mentalmente: `isStaticFinalState: boolean;`.

- [ ] **Step 1: Criar o componente**

Mover o bloco `{hasBanners && (<div className="gr-banners-row">...` (linhas **940–1065**) **e** o bloco de confete `{isEffectiveGameEnded && playerWinEntries.length > 0 && (<div className="gr-confetti-overlay">...` (linhas **1133–1148**) para `PrizePanels`. Importar `fmtCountdown` (copiar o helper das linhas 31–36 para o componente — é puro). Retornar um fragmento com `gr-banners-row` + confete; se `!hasBanners && !(isEffectiveGameEnded && playerWinEntries.length>0)`, retornar `null`.

- [ ] **Step 2: Usar na GameRoom**

Substituir os blocos 940–1065 e 1133–1148 por um único:

```tsx
<PrizePanels
  hasBanners={hasBanners} goldenBall={goldenBall} clearedStages={clearedStages}
  isEffectiveGameEnded={isEffectiveGameEnded} isStaticFinalState={isStaticFinalState}
  playerWinEntries={playerWinEntries} localWinners={localWinners} playerTickets={playerTickets}
  nextGame={nextGame} nextGameTimer={nextGameTimer} game={game} room={room} now={now}
  onLeave={onLeave} onGoToHistory={onGoToHistory}
/>
```

(Posicionar o `<PrizePanels>` no lugar do `gr-banners-row` — dentro do `gr-main`, após `gr-top-row`. O confete renderiza via fragmento; como era irmão fora de `gr-main`, garantir CSS: `gr-confetti-overlay` usa `position:fixed`, então a posição no DOM não afeta o layout. Verificar visualmente.)

- [ ] **Step 3: Typecheck + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: 0 erros; 3 PASS (incluindo `gr-ended-overlay`).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/gameroom/PrizePanels.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair PrizePanels (banners/breakdown/confete) da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Extrair `<TicketsGrid>`

**Files:**
- Create: `apps/frontend/src/components/gameroom/TicketsGrid.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Produces:

```tsx
export interface TicketsGridProps {
  playerTickets: Array<{ id: string; matrix: number[]; pricePaid?: string }>;
  groupedTickets: ReturnType<typeof groupTicketsByCategory>;
  loadingGame: boolean;
  gameStatus: string | undefined;
  canBuyMore: boolean;
  winnerMap: Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>;
  patternByName: Map<string, Pattern>;
  drawnSet: Set<number>;
  lastDrawn: number | null;
  roomPatterns: Pattern[];
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  onBuyMore: () => void;
}
export default function TicketsGrid(props: TicketsGridProps): JSX.Element;
```

- [ ] **Step 1: Criar o componente**

Mover `<div className="gr-tickets-section">` (linhas **1068–1128**) verbatim. `density` é constante `'comfortable'` → declarar dentro do componente. Trocar `game?.status`→`props.gameStatus`, a condição do botão comprar por `props.canBuyMore`, `setShowBuyModal(true)`→`onBuyMore()`.

- [ ] **Step 2: Usar na GameRoom**

Substituir 1068–1128 por:

```tsx
<TicketsGrid
  playerTickets={playerTickets} groupedTickets={groupedTickets} loadingGame={loadingGame}
  gameStatus={game?.status} canBuyMore={game?.status === 'funding' && !!ticketPrice}
  winnerMap={winnerMap} patternByName={patternByName} drawnSet={drawnSet} lastDrawn={lastDrawn}
  roomPatterns={roomPatterns} completedCombinationsPerTicket={completedCombinationsPerTicket}
  onBuyMore={() => setShowBuyModal(true)}
/>
```

- [ ] **Step 3: Typecheck + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- gameroom/GameRoom.characterization`
Expected: 0 erros; 3 PASS (`gr-my-tickets` continua).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/gameroom/TicketsGrid.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair TicketsGrid da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Extrair `<RoomSocial>` + slim final do orquestrador

**Files:**
- Create: `apps/frontend/src/components/gameroom/RoomSocial.tsx`
- Modify: `apps/frontend/src/components/GameRoom.tsx`

**Interfaces:**
- Produces:

```tsx
export interface RoomSocialProps {
  room: EnrichedRoom | null;
  walletAddress: string;
}
export default function RoomSocial(props: RoomSocialProps): JSX.Element | null;
```

- [ ] **Step 1: Criar o componente**

Wrapper fino do chat (placeholder de social; expande na Fase 4):

```tsx
// apps/frontend/src/components/gameroom/RoomSocial.tsx
// Camada social da sala. Hoje só encapsula o ChatFloating;
// na Fase 4 (ADR-032) ganha presença/reações/feed de eventos.
import ChatFloating from '../chat/ChatFloating';
import type { EnrichedRoom } from '../../services/api';

export interface RoomSocialProps {
  room: EnrichedRoom | null;
  walletAddress: string;
}

export default function RoomSocial({ room, walletAddress }: RoomSocialProps) {
  if (!room) return null;
  return (
    <ChatFloating
      roomId={room.room_id}
      roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
      walletAddress={walletAddress}
    />
  );
}
```

- [ ] **Step 2: Usar na GameRoom + revisar o orquestrador**

Substituir o bloco `{room && (<ChatFloating ... />)}` (linhas **1151–1157**) por `<RoomSocial room={room} walletAddress={profile.wallet_address} />`. Conferir que `GameRoom.tsx` agora é só: hook + `showBuyModal`/`showPatterns`/refs de layout (`stageRef`/`patternsRef`) + `ResizeObserver` + composição (`<GameRoomHeader/>`, `gr-main` com `<DrawStage/>`+`<PatternsPanel/>`, `<PrizePanels/>`, `<TicketsGrid/>`) + `<RoomSocial/>` + `<BuyTicketModal/>`. Remover imports agora não usados (`useSlowReveal`, `ticketUtils` específicos, `Logo`, `DropdownMenu*` etc. que migraram).

- [ ] **Step 3: Typecheck + lint de imports + teste**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test`
Expected: 0 erros TS; **toda** a suíte vitest verde (não só caracterização).

- [ ] **Step 4: Verificação visual manual (no behavior change)**

Run: `pnpm --filter @cryptobingo/frontend dev` e abrir uma sala. Conferir: navbar, palco com bola/histórico/progresso, painel de padrões, banners de fim/golden/stages, cartelas, confete em vitória, chat floating — todos idênticos ao baseline.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gameroom/RoomSocial.tsx apps/frontend/src/components/GameRoom.tsx
git commit -m "refactor(frontend): extrair RoomSocial e afinar orquestrador GameRoom

GameRoom passa a ser orquestrador fino (hook + composição). Sem mudança de comportamento.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: ADR-030 + abertura de PR

**Files:**
- Create: `docs/adr/ADR-030-arquitetura-componentes-gameroom.md`

- [ ] **Step 1: Escrever ADR-030**

Documentar: contexto (monólito 1176 linhas), decisão (hook `useGameRoomState` + componentes isolados em `components/gameroom/`, orquestrador fino), consequências (testável, habilita Fases 1–5 e modo compacto p/ embeds), alternativas descartadas (manter monólito; rewrite big-bang). Referenciar o spec `docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md`.

- [ ] **Step 2: `/sonar-analyze` em cada `.tsx`/`.ts` novo**

Rodar `/sonar-analyze` em `gameroom/*.tsx`, `gameroom/useGameRoomState.ts` e na `GameRoom.tsx`. Corrigir BLOCKER/CRITICAL/MAJOR. MINOR com justificativa no corpo do PR.

- [ ] **Step 3: Commit do ADR + abrir PR**

```bash
git add docs/adr/ADR-030-arquitetura-componentes-gameroom.md
git commit -m "docs(adr): ADR-030 arquitetura de componentes da GameRoom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin feature/gameroom-fase0-refactor
```

Abrir PR para `develop` com corpo `Closes #<N>`, checklist de typecheck/testes verdes, nota de Sonar, e link do spec/ADR. Delegar revisão ao agent `frontend-reviewer` antes do merge.

---

## Self-Review

**1. Cobertura do spec (§3 arquitetura-alvo):** `useGameRoomState` (T2), `DrawStage` (T4), `PatternsPanel` (T5), `TicketsGrid` (T7), `PrizePanels`=PrizePanels (T6), `RoomSocial` (T8). `GameRoomHeader` adicionado (T3) — necessário, navbar não cabia em nenhum dos 6. ✔ Critério de aceite da Fase 0 (UI pixel-equivalente, vitest+Cypress verdes, nenhum `gr-*` removido sem equivalente): coberto por caracterização (T1) + verificação visual (T8.4) + suíte completa (T8.3). Cypress Tier 1 não roda aqui (frontend dev server); validar no PR-gate.

**2. Placeholders:** `<N>` (número da issue) é intencional — preenchido na criação da issue. Nenhum TODO/TBD de implementação. Código de teste completo em T1; componentes movem JSX verbatim com ranges exatos.

**3. Consistência de tipos:** `GameRoomState` (T2) é a fonte; props das Tasks 3–8 referenciam campos idênticos. `isStaticFinalState` sinalizado na T6 para ser incluído no retorno do hook na T2. `WS_STATUS_CLASS`/`STATUS_DOT` exportados pelo hook e consumidos por header/stage com o mesmo nome.

**Observação para o executor:** este é um refactor verbatim — ao mover blocos JSX, **não** "melhorar" markup nem renomear classes. Qualquer melhoria visual é Fase 1+.
