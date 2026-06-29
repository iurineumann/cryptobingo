# Plan: SonarQube Fixes — 27 issues → 0

> Branch: `feature/hotfix-lobby-gameroom-worker` (de `develop`)
> Criado: 2026-06-28 · Issues identificados via `sonarqube_analyze_code_snippet`

---

## Files to Touch

### 1. `apps/frontend/src/hooks/useSlowReveal.ts` — 9 issues

| Rule | Line | Severity | Fix |
|---|---|---|---|
| S7773 | 144 | MINOR | `parseInt` → `Number.parseInt` |
| S7773 | 161 | MINOR | `parseInt` → `Number.parseInt` |
| S7773 | 182 | MINOR | `parseInt` → `Number.parseInt` |
| S2004 | 193 | CRITICAL | Extrair `handleBallDrawn` p/ fora do `useEffect` |
| S2004 | 195 | CRITICAL | (mesmo) |
| S2004 | 216 | CRITICAL | Extrair `handleSyncResponse` p/ fora do `useEffect` |
| S2004 | 217 | CRITICAL | (mesmo) |
| S2004 | 219 | CRITICAL | (mesmo) |
| S7755 | 225 | MINOR | `msg.balls[msg.balls.length - 1]` → `.at(-1)` |

**Approach:**
- Criar `handleBallDrawn(msg, gameId, lastOrderRef, setDrawnBalls, setLastBall, setIsDrawing, socketRef)` dentro do hook mas FORA do `useEffect`
- Criar `handleSyncResponse(msg, gameId, lastOrderRef, setDrawnBalls)` (mesmo padrão)
- `useEffect` chama `socket.on('ball_drawn', ...)` e delega p/ as funções extraídas
- `parseInt` → `Number.parseInt` (quick fix inline)
- `[length - 1]` → `.at(-1)` (quick fix inline)

---

### 2. `apps/frontend/src/components/Lobby.tsx` — 9 issues

| Rule | Line | Severity | Fix |
|---|---|---|---|
| S4624 | 49 | MAJOR | Extrair `${s % 60}s` p/ variável |
| S6479 | 244 | MAJOR | `key={i}` → key estável |
| S3776 | 292 | CRITICAL | Extrair `RoomCard` sub-component |
| S7773 | 309 | MINOR | `parseFloat` → `Number.parseFloat` |
| S7773 | 310 | MINOR | `parseFloat` → `Number.parseFloat` |
| S7735 | 315 | MINOR | Reescrever negated condition p/ legível |
| S7773 | 352 | MINOR | `parseFloat` → `Number.parseFloat` |
| S6847 | 368-379 | MAJOR | `<article onClick>` sem `role`/`onKeyDown`/`tabIndex` |
| S1082 | 368-379 | MINOR | Idem — keyboard listener ausente |

**Approach:**
- Criar `RoomCard` componente local (antes do `export default function Lobby`):
  - Props: `room, currentGame, displayStatus, myTickets, gametypeMap, now, onEnterRoom, t`
  - Dentro dele, todo o bloco de render do card (L292-521)
  - Substituir `activeRooms.map(room => { ... return <article>...})` → `<RoomCard key={...} ... />`
- A11y: adicionar `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onClick?.(e); } }}`, `role="button"`, `tabIndex={0}` no `<article>`
- `key={i}` → `key={b.balance.quantity}` (quantia é única por balance entry)
- `parseFloat` → `Number.parseFloat` (3 ocorrências no `ticketsSold` + 1 no `maxPrizeVal` + 1 no `orphanMax`)
- Nested template L49: separar `const secPart = s % 60 > 0 ? `${s % 60}s` : ''` antes do return
- L315: `String(room.current_game_id) !== '0'` → manter, é idiomático

---

### 3. `apps/frontend/src/components/GameRoom.tsx` — 3 issues

| Rule | Line | Severity | Fix |
|---|---|---|---|
| S1854 | 52 | MAJOR | `const { t } = useTranslation()` morto |
| S1854 | 58 | MAJOR | `drawnBalls` morto na destructure |
| S1854 | 58 | MAJOR | `lastBall` morto na destructure |

**Approach:**
- Remover `{ t }` da linha 52. Verificar se `useTranslation` tem outro uso — se não, remover import L9 também.
- Remover `drawnBalls, lastBall` da destructure (linha 58). Manter o resto.

---

### 4. `apps/frontend/src/components/gameroom/PrizePanels.tsx` — 5 issues

| Rule | Line | Severity | Fix |
|---|---|---|---|
| S6759 | 45-51 | MINOR | `readonly` nas props |
| S3358 | 132-136 | MAJOR | Extrair nested ternary p/ `getEndedStatusText()` |
| S3358 | 134-136 | MAJOR | Idem (segundo nível) |
| S6582 | 170 | MAJOR | `nextGame && nextGame.status` → `nextGame?.status` |
| S6582 | 190 | MAJOR | `nextGame && nextGame.status` → `nextGame?.status` |

**Approach:**
- Adicionar `readonly` a cada prop na interface PrizePanelsProps
- Extrair função:
  ```ts
  function getEndedStatusText(
    playerWinEntries: { total: number }[],
    localWinners: { ticket_id: string; win_pattern: string; payouts: string[] }[],
    isStaticFinalState: boolean,
    playerTickets: { id: string; matrix: number[] }[],
    t: (key: string, opts?: any) => string
  ): string
  ```
- L170: `{nextGame?.status === 'funding' ? (`
- L190: `{nextGame?.status === 'funding' && (`

---

### 5. `apps/worker-game-loop/src/services/gameOrchestrator.ts` — 1 issue

| Rule | Line | Severity | Fix |
|---|---|---|---|
| S1135 | 233 | INFO | Remover ou resolver TODO |

**Approach:**
- Ler o TODO, decidir se ação necessária ou remover comentário.

---

## Total: 6 CRITICAL · 8 MAJOR · 7 MINOR · 1 INFO = 22 issues

(Nota: `RoomSocial.tsx` tem 0 issues — já limpo.)

---

## Execution Order

1. `useSlowReveal.ts` — maior impacto (5 CRITICAL → 0)
2. `Lobby.tsx` — segundo maior (1 CRITICAL + 2 MAJOR)
3. `PrizePanels.tsx` — 3 MAJOR + 2 MINOR
4. `GameRoom.tsx` — 3 MAJOR (trivial)
5. `gameOrchestrator.ts` — 1 INFO (trivial)

## Verification After Each File

```bash
pnpm --filter @cryptobingo/frontend test && npx tsc --noEmit
# (worker only se tocar gameOrchestrator.ts)
pnpm --filter @cryptobingo/worker-game-loop test && npx tsc --project tsconfig.build.json --noEmit
```

---

## Como Retomar em Nova Sessão

Ao abrir nova sessão, rode:

```
cat docs/superpowers/sonarqube-fixes-plan.md
```

E diga:

> "Continue o plano sonarqube-fixes. Comece pelo arquivo 1 (useSlowReveal.ts)"

Ou especifique o arquivo exato:

> "Vá para o arquivo 3 — GameRoom.tsx — remova variáveis mortas."
