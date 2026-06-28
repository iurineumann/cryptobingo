# Hotfix Lobby + GameRoom + Worker — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. TDD: test → fail → implement → pass.

**Goal:** Corrigir 4 áreas de bugs visíveis. Nenhuma mudança de economia, contrato ou API.

**Dependências:** E0 (tests) → A → B → C → D (worker, isolado).

---

## Task E0: Test Infrastructure

Criar testes que travarão o comportamento antes das correções.

### E0a: Lobby.test.tsx

- [ ] **Step 1: Escrever teste (fail)**

```tsx
// apps/frontend/src/components/Lobby.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Lobby from './Lobby';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'pt-BR' } }),
}));
vi.mock('../services/api', () => ({
  fetchRooms: vi.fn().mockResolvedValue([]),
  fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [] }),
}));

describe('Lobby — hotfix', () => {
  it('renderiza nome da sala ou fallback #ID', async () => {
    // metadata.name ausente → fallback
    render(<Lobby session={null} />);
    await waitFor(() => {
      expect(screen.getByText(/Sala #/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Rodar — fail** (ainda sem componente isolado para testar)
- [ ] **Step 3: Implementar mock adequado e ver passar**

### E0b: Worker evaluator tests

- [ ] **Step 1: Escrever testes para golden ball count e multimatch cutoff**
- [ ] **Step 2: Rodar — fail**
- [ ] **Step 3: Implementar**

---

## Task A1: POLL Intervals

**File:** `apps/frontend/src/components/Lobby.tsx`

- [ ] **Step 1: Teste falha** — verifica que POLL_NORMAL_MS=4000 e POLL_ACTIVE_MS=1000
- [ ] **Step 2: Mudar constantes** `POLL_NORMAL_MS = 8_000` → `4_000`, `POLL_ACTIVE_MS = 2_000` → `1_000`
- [ ] **Step 3: Typecheck + testes passam**
- [ ] **Step 4: SonarQube + commit**

---

## Task A2: Room Name Display

**File:** `apps/frontend/src/components/Lobby.tsx` (linha ~384)

- [ ] **Step 1: Teste falha** — room com metadata=null ainda mostra fallback
- [ ] **Step 2: Remover condicional** `{room.metadata?.name && (` → sempre renderizar `<p className="lobby-card-name">{roomName}</p>`
- [ ] **Step 3: Typecheck + testes passam**
- [ ] **Step 4: SonarQube + commit**

---

## Task A3: maxPrizeVal Correction

**File:** `apps/frontend/src/components/Lobby.tsx` (linha ~348-354)

- [ ] **Step 1: Teste falha** — maxPrizeVal usa ticket_price_max, não default
- [ ] **Step 2: Corrigir fórmula** — `priceAmt = max(room.ticket_price_max?.quantity, room.ticket_price_default?.quantity)`
- [ ] **Step 3: Typecheck + testes passam**
- [ ] **Step 4: SonarQube + commit**

---

## Task B1: Online Counter Move

**Files:** `RoomSocial.tsx`, `GameRoom.tsx`

- [ ] **Step 1: Mover `<span className="gr-online">`** de `RoomSocial.tsx:42` para o header `gr-nav-right` em `GameRoom.tsx`
- [ ] **Step 2: Verificar** renderização visual (dev server)
- [ ] **Step 3: Commit**

---

## Task B2: Reaction Bar Popover

**Files:** `RoomSocial.tsx`, `GameRoom.tsx`

- [ ] **Step 1: Transformar `gr-reaction-bar`** em popover perto do chat FAB
- [ ] **Step 2: Verificar** renderização
- [ ] **Step 3: Commit**

---

## Task B3: MatchStats Reposition

**File:** `GameRoom.tsx`

- [ ] **Step 1: Mover `<MatchStats>`** de dentro de `gr-main` topo para entre `gr-match-stats` e `gr-tickets-section`
- [ ] **Step 2: Verificar** renderização
- [ ] **Step 3: Commit**

---

## Task C1: Locales Ticket Sections

**Files:** `pt.json`, `en.json`, `zh.json`

- [ ] **Step 1: Adicionar chaves** nos 3 arquivos:
  - `ticket_section.winners`
  - `ticket_section.near_miss`
  - `ticket_section.pattern_label`
  - `ticket_section.other`
- [ ] **Step 2: Typecheck + commit**

---

## Task C2: i18n in groupTicketsByCategory

**File:** `ticketUtils.ts`

- [ ] **Step 1: Teste falha** — labels usam chaves i18n
- [ ] **Step 2: Modificar assinatura** `groupTicketsByCategory(tickets, patterns, t)` e usar `t()` nos labels
- [ ] **Step 3: Typecheck + testes passam**
- [ ] **Step 4: SonarQube + commit**

---

## Task D1: Golden Ball Max Balls

**Files:** `evaluator.ts`, `gameOrchestrator.ts`

- [ ] **Step 1: Teste falha** — golden ball progress = 36/36
- [ ] **Step 2: Usar `gt.max_balls`** instead of `DEFAULT_DRAW_BALLS=75` nas mensagens de progresso
- [ ] **Step 3: Typecheck + tests pass**
- [ ] **Step 4: SonarQube + commit**

---

## Task D2: Golden Ball Multiplier Animation

**File:** `gameOrchestrator.ts`

- [ ] **Step 1: Teste falha** — multiplier reveal sequence
- [ ] **Step 2: Implementar** pause + sequential reveal tiers após golden ball draw
- [ ] **Step 3: Typecheck + tests pass**
- [ ] **Step 4: SonarQube + commit**

---

## Task D3: Multi Match Slow Reveal

**File:** `gameOrchestrator.ts`

- [ ] **Step 1: Teste falha** — MULTI_MATCH chama `startSlowReveal`
- [ ] **Step 2: Adicionar gate** no switch/orchestrateMultiMatch para iniciar slow reveal antes do draw
- [ ] **Step 3: Typecheck + tests pass**
- [ ] **Step 4: SonarQube + commit**

---

## Task D4: Multi Match Stage Cutoff

**File:** `evaluator.ts`

- [ ] **Step 1: Teste falha** — MULTI_MATCH usa `preComputeMultiMatchCutoffs`
- [ ] **Step 2: Ajustar dispatch** para chamar cutoff em vez de usar 75 bolas
- [ ] **Step 3: Typecheck + tests pass**
- [ ] **Step 4: SonarQube + commit**

---

## Final Gate

- [ ] Typecheck frontend: `npx tsc --noEmit` (em `apps/frontend`)
- [ ] Testes frontend: `pnpm --filter @cryptobingo/frontend test`
- [ ] Testes worker: `npx jest evaluator` (em `apps/worker-game-loop`)
- [ ] SonarQube: `/sonar-analyze` em cada arquivo modificado
- [ ] Se estrutural: ADR-037
- [ ] Push + PR para `develop` com `Closes #N`
