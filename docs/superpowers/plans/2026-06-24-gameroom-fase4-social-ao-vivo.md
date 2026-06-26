# GameRoom Fase 4 — Social ao Vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vida social na sala: **presença** (quantos online), **reações** flutuantes (emojis), e um **feed de eventos** ("cartela X fez Linha!", "Estágio limpo") — integrados ao chat existente, sem persistência nova.

**Architecture:** Backend adiciona ao namespace Socket.io `/chat` (api-gateway) **presença** (mapa efêmero por wallet, dedup multi-socket) e **reações** (allowlist + rate-limit + broadcast). **Sem nova coleção Mongo** — estado transitório in-memory. O **feed de eventos é derivado no frontend** dos dados que o `useSlowReveal` já entrega (`winners`/`clearedStages`) — nenhum backend novo para o feed. Frontend ganha o hook `useRoomSocial` (online + reações) e o `RoomSocial` cresce: badge de online, barra de reações, reações flutuantes e feed. Leaderboard reusa o `leaderboardController` existente (sem mudança backend).

**Tech Stack:** Socket.io (api-gateway, jest), React 18 + TS + socket.io-client (vitest), i18next.

## Global Constraints

- Idioma de código/comentários/commits: **PT-BR**. Comentários explicam o *porquê*.
- **Presença/reações são EFÊMERAS (in-memory).** Sem nova coleção Mongo. O chat persiste como hoje (`ChatMessage`); presença/reações não.
- **Presença por wallet, não por socket.** Um usuário com 2 abas/sockets conta **uma vez**. Mapa `roomId → (wallet → contagem de sockets)`; remove a wallet quando a contagem chega a 0; limpar no `disconnect`.
- **Reações com allowlist + rate-limit** (espelha o anti-spam do `chat:send`). Wallet vem de `socket.data.wallet` (JWT) — cliente nunca informa wallet. Emoji fora da allowlist é descartado.
- **Feed derivado no front** de `useSlowReveal` (winners/clearedStages) — não inventar dados; não expor PII (mostrar cartela/conta como já exibido hoje).
- Segurança bloqueante: autenticação do socket inalterada (JWT + revogação); novos handlers validam entrada e nunca confiam em wallet do cliente.
- Acessibilidade: badge de online com rótulo i18n; reações flutuantes `aria-hidden`; reduced-motion via bloco global. i18n em **3 locales** (`pt`/`en`/`zh`).
- data-testids novos: `gr-online-count`, `gr-reaction-bar`, `gr-event-feed`.
- Backend: `npx jest <arquivo>` para o socket; segurança em `chatSocket.security.test.ts` deve continuar verde. Typecheck api: `npx tsc --project tsconfig.build.json --noEmit`. Frontend: `pnpm --filter @cryptobingo/frontend test` (era 165); typecheck `npx tsc --noEmit`.
- Commits PT-BR `tipo(escopo): ...` terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Git flow: branch `feature/gameroom-fase4-social` de `develop`. PR `Closes #<N>` para `develop`. **ADR-032** (presença/reações efêmeras no socket) + **AsyncAPI** (`docs/asyncapi.yaml`) atualizados. Revisores: **`api-reviewer`** (backend) + **`frontend-reviewer`** (frontend). Skills `api-endpoint` + `frontend-feature` (+ `impeccable` na UI). Pré-PR `/sonar-analyze`.

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `apps/api-gateway/src/socket/chatSocket.ts` | **Modificar** — presença (join/leave/disconnect + `presence:update`) e reações (`reaction:send`→`reaction:new`). |
| `apps/api-gateway/src/socket/presence.ts` | **Criar** — mapa de presença efêmero + helpers puros (testável). |
| `apps/api-gateway/src/socket/presence.test.ts` | **Criar** — testes dos helpers. |
| `apps/api-gateway/src/socket/chatSocket.social.test.ts` | **Criar** — testes de integração de presença/reações no socket. |
| `apps/frontend/src/hooks/useRoomSocial.ts` | **Criar** — online count + reações (send/receive). |
| `apps/frontend/src/hooks/useRoomSocial.test.ts` | **Criar** — testes (socket mockado). |
| `apps/frontend/src/components/gameroom/RoomSocial.tsx` | **Modificar** — badge online, barra de reações, reações flutuantes, feed. |
| `apps/frontend/src/components/gameroom/RoomSocial.test.tsx` | **Criar** — testes. |
| `apps/frontend/src/components/GameRoom.tsx` | **Modificar** — passar `localWinners`/`clearedStages` ao `RoomSocial` (feed). |
| `apps/frontend/src/styles/globals.design.css` | **Modificar** — classes social. |
| `apps/frontend/src/locales/{pt,en,zh}.json` | **Modificar** — chaves `game_room.social_*`. |
| `docs/adr/ADR-032-presenca-reacoes-socket.md` | **Criar**. |
| `docs/asyncapi.yaml` | **Modificar** — canais `presence:update`, `reaction:send`, `reaction:new`. |

> ⚠️ **Pré-requisito:** `develop` atualizado (Fases 0-3 + hotfix mergeados). Criar branch: `git checkout develop && git pull && git checkout -b feature/gameroom-fase4-social`.

---

### Task 1: Backend — presença (mapa efêmero + helpers puros)

**Files:**
- Create: `apps/api-gateway/src/socket/presence.ts`
- Test: `apps/api-gateway/src/socket/presence.test.ts`

**Interfaces:**
- Produces:

```ts
// Presença efêmera por sala, contada por WALLET (dedup multi-socket).
export interface PresenceStore {
  add(roomId: string, wallet: string): void;
  remove(roomId: string, wallet: string): void;
  count(roomId: string): number;       // nº de wallets distintas online
}
export function createPresenceStore(): PresenceStore;
```

- `add` incrementa a contagem de sockets daquela wallet na sala; `remove` decrementa e apaga a wallet em 0 (e a sala quando vazia); `count` = nº de wallets com contagem > 0.

- [ ] **Step 1: Teste (falha)**

```ts
// apps/api-gateway/src/socket/presence.test.ts
import { createPresenceStore } from './presence';

describe('PresenceStore', () => {
  it('conta wallets distintas, não sockets', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r1', 'alice'); // 2ª aba da mesma wallet
    p.add('r1', 'bob');
    expect(p.count('r1')).toBe(2); // alice + bob, não 3
  });

  it('remove wallet só quando todos os sockets dela saem', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r1', 'alice');
    p.remove('r1', 'alice');
    expect(p.count('r1')).toBe(1); // ainda 1 socket da alice
    p.remove('r1', 'alice');
    expect(p.count('r1')).toBe(0);
  });

  it('remove tolera wallet/sala inexistente', () => {
    const p = createPresenceStore();
    expect(() => p.remove('rX', 'ghost')).not.toThrow();
    expect(p.count('rX')).toBe(0);
  });

  it('salas são independentes', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r2', 'bob');
    expect(p.count('r1')).toBe(1);
    expect(p.count('r2')).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/api-gateway && npx jest src/socket/presence.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// apps/api-gateway/src/socket/presence.ts
// Presença efêmera (in-memory) por sala, contada por WALLET.
// Multi-socket da mesma wallet (abas/dispositivos) conta uma vez —
// guardamos a contagem de sockets por wallet e só removemos em 0.
export interface PresenceStore {
  add(roomId: string, wallet: string): void;
  remove(roomId: string, wallet: string): void;
  count(roomId: string): number;
}

export function createPresenceStore(): PresenceStore {
  const rooms = new Map<string, Map<string, number>>();

  return {
    add(roomId, wallet) {
      let wallets = rooms.get(roomId);
      if (!wallets) { wallets = new Map(); rooms.set(roomId, wallets); }
      wallets.set(wallet, (wallets.get(wallet) ?? 0) + 1);
    },
    remove(roomId, wallet) {
      const wallets = rooms.get(roomId);
      if (!wallets) return;
      const n = wallets.get(wallet);
      if (n === undefined) return;
      if (n <= 1) wallets.delete(wallet);
      else wallets.set(wallet, n - 1);
      if (wallets.size === 0) rooms.delete(roomId);
    },
    count(roomId) {
      return rooms.get(roomId)?.size ?? 0;
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/api-gateway && npx jest src/socket/presence.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/socket/presence.ts apps/api-gateway/src/socket/presence.test.ts
git commit -m "feat(api): PresenceStore efêmero por wallet (dedup multi-socket)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Backend — wiring de presença + reações no `chatSocket`

**Files:**
- Modify: `apps/api-gateway/src/socket/chatSocket.ts`
- Create: `apps/api-gateway/src/socket/chatSocket.social.test.ts`

**Interfaces (eventos socket):**
- `presence:update` (servidor→sala): `{ roomId: string; online: number }` — emitido em join/leave/disconnect.
- `reaction:send` (cliente→servidor): `{ roomId: string; emoji: string }`.
- `reaction:new` (servidor→sala): `{ wallet: string; emoji: string; ts: number }`.

- [ ] **Step 1: Implementar no `chatSocket.ts`**

(a) Topo do módulo: store + allowlist + rate-limit de reações.

```ts
import { createPresenceStore } from './presence';

const presence = createPresenceStore();

// Reações permitidas — fora da lista é descartado (anti-abuso).
const REACTION_EMOJIS = ['👏', '🔥', '😮', '😢', '🍀', '🎉'];

// Rate-limit de reações (mais permissivo que chat): 10 por 5s por wallet.
const REACTION_WINDOW_MS = 5_000;
const REACTION_MAX = 10;
const reactionBuckets = new Map<string, { count: number; windowStart: number }>();
function isReactionLimited(wallet: string): boolean {
  const now = Date.now();
  const b = reactionBuckets.get(wallet);
  if (!b || now - b.windowStart >= REACTION_WINDOW_MS) {
    reactionBuckets.set(wallet, { count: 1, windowStart: now });
    return false;
  }
  if (b.count >= REACTION_MAX) return true;
  b.count++;
  return false;
}
```

(b) No `connection`, rastrear as salas do socket p/ limpar no disconnect:

```ts
    const joinedRooms = new Set<string>();
    socket.on('disconnect', () => {
      socketConnectionsActive.dec();
      const wallet = socket.data.wallet as string;
      for (const roomId of joinedRooms) {
        presence.remove(roomId, wallet);
        chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
      }
    });
```

(Remover o `socket.on('disconnect', () => socketConnectionsActive.dec())` antigo — agora unificado acima.)

(c) No handler `chat:join`, após `socket.join(roomId)`:

```ts
      socket.join(roomId);
      joinedRooms.add(roomId);
      presence.add(roomId, socket.data.wallet as string);
      chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
```

(d) No handler `chat:leave`, após `socket.leave(roomId)`:

```ts
      socket.leave(roomId);
      joinedRooms.delete(roomId);
      presence.remove(roomId, socket.data.wallet as string);
      chatNs.to(roomId).emit('presence:update', { roomId, online: presence.count(roomId) });
```

(e) Novo handler de reação:

```ts
    socket.on('reaction:send', ({ roomId, emoji }: { roomId?: string; emoji?: string }) => {
      socketMessagesTotal.inc({ event: 'reaction:send' });
      if (!roomId || !emoji || !REACTION_EMOJIS.includes(emoji)) return;
      const wallet = socket.data.wallet as string;
      if (isReactionLimited(wallet)) {
        socketRateLimitedTotal.inc();
        return;
      }
      chatNs.to(roomId).emit('reaction:new', { wallet, emoji, ts: Date.now() });
    });
```

> Export `REACTION_EMOJIS` para o frontend espelhar a allowlist? Não — o frontend tem sua própria lista de botões; o backend é a fonte de verdade que descarta inválidos. Mantenha as listas alinhadas manualmente (documentar na ADR).

- [ ] **Step 2: Teste de integração (social)**

Criar `chatSocket.social.test.ts` espelhando o estilo de `chatSocket.security.test.ts` (mesmos mocks de `ChatMessage`/`RoomMetadata`/`isTokenRevoked`, server Socket.io em porta efêmera + clientes socket.io-client autenticados). Casos:
1. dois clientes (wallets distintas) entram na mesma sala → ambos recebem `presence:update` com `online: 2`.
2. duas conexões da MESMA wallet → `online: 1`.
3. `reaction:send` com emoji da allowlist → outros na sala recebem `reaction:new` com `wallet` do JWT (não do cliente) + emoji.
4. `reaction:send` com emoji fora da allowlist → nenhum `reaction:new`.
5. rate-limit: 11ª reação em 5s não emite.
6. disconnect decrementa a presença e emite `presence:update`.

(Use timeouts curtos e `done`/await de eventos; padrão já presente no projeto para sockets.)

- [ ] **Step 3: Rodar testes do socket**

Run: `cd apps/api-gateway && npx jest src/socket/chatSocket.social.test.ts src/socket/chatSocket.security.test.ts`
Expected: social PASS; segurança continua PASS (sem regressão).

- [ ] **Step 4: Typecheck + commit**

Run: `cd apps/api-gateway && npx tsc --project tsconfig.build.json --noEmit` → 0 erros.

```bash
git add apps/api-gateway/src/socket/chatSocket.ts apps/api-gateway/src/socket/chatSocket.social.test.ts
git commit -m "feat(api): presença e reações efêmeras no socket /chat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — hook `useRoomSocial`

**Files:**
- Create: `apps/frontend/src/hooks/useRoomSocial.ts`
- Test: `apps/frontend/src/hooks/useRoomSocial.test.ts`

**Interfaces:**
- Produces:

```ts
export interface FloatingReaction { id: string; wallet: string; emoji: string; }
export interface UseRoomSocialReturn {
  onlineCount: number;
  reactions: FloatingReaction[];   // reações recentes (auto-expiram ~4s)
  sendReaction: (emoji: string) => void;
}
export function useRoomSocial(opts: { roomId: string }): UseRoomSocialReturn;
```

- Conecta a `${WS_URL}/chat` com JWT (igual `useChat`), emite `chat:join`, escuta `presence:update` (→ `onlineCount`) e `reaction:new` (→ push em `reactions`, remove após 4s). `sendReaction` emite `reaction:send`. Reconecta como o `useChat`. Cleanup no unmount.

- [ ] **Step 1: Teste (falha)** — socket.io-client mockado:

```ts
// apps/frontend/src/hooks/useRoomSocial.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
const emit = vi.fn();
const fakeSocket = {
  connected: true,
  on: (ev: string, cb: (p: unknown) => void) => { handlers[ev] = cb; },
  emit,
  disconnect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));
vi.mock('../services/api', () => ({ getAuthToken: () => 'tok' }));

import { useRoomSocial } from './useRoomSocial';

describe('useRoomSocial', () => {
  beforeEach(() => { Object.keys(handlers).forEach(k => delete handlers[k]); emit.mockClear(); });

  it('atualiza onlineCount em presence:update', async () => {
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['connect']?.(undefined); });
    act(() => { handlers['presence:update']?.({ roomId: 'r1', online: 3 }); });
    expect(result.current.onlineCount).toBe(3);
  });

  it('sendReaction emite reaction:send', () => {
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['connect']?.(undefined); });
    act(() => result.current.sendReaction('🔥'));
    expect(emit).toHaveBeenCalledWith('reaction:send', { roomId: 'r1', emoji: '🔥' });
  });

  it('reaction:new adiciona reação que expira', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['reaction:new']?.({ wallet: 'bob', emoji: '🎉', ts: Date.now() }); });
    expect(result.current.reactions.length).toBe(1);
    act(() => { vi.advanceTimersByTime(4100); });
    expect(result.current.reactions.length).toBe(0);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- useRoomSocial`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** (espelha a conexão de `useChat`; própria socket — backend dedup por wallet torna seguro coexistir com o socket do chat):

```ts
// apps/frontend/src/hooks/useRoomSocial.ts
// Presença + reações ao vivo (efêmeras) via namespace /chat.
// Conexão própria — o backend conta presença por WALLET, então coexistir
// com o socket do useChat não infla a contagem.
import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthToken } from '../services/api';

const API_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '';
const WS_URL  = import.meta.env.VITE_WS_URL || API_URL;
const REACTION_TTL_MS = 4_000;

export interface FloatingReaction { id: string; wallet: string; emoji: string; }
export interface UseRoomSocialReturn {
  onlineCount: number;
  reactions: FloatingReaction[];
  sendReaction: (emoji: string) => void;
}

export function useRoomSocial({ roomId }: { roomId: string }): UseRoomSocialReturn {
  const [onlineCount, setOnlineCount] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token || !roomId) return;
    const s = io(`${WS_URL}/chat`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => s.emit('chat:join', { roomId }));
    s.on('presence:update', (p: { roomId: string; online: number }) => {
      if (p.roomId === roomId) setOnlineCount(p.online);
    });
    s.on('reaction:new', (r: { wallet: string; emoji: string }) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setReactions(prev => [...prev, { id, wallet: r.wallet, emoji: r.emoji }]);
      const tmr = setTimeout(() => setReactions(prev => prev.filter(x => x.id !== id)), REACTION_TTL_MS);
      timers.current.push(tmr);
    });

    return () => {
      s.emit('chat:leave', { roomId });
      s.disconnect();
      socketRef.current = null;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [roomId]);

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit('reaction:send', { roomId, emoji });
  }, [roomId]);

  return { onlineCount, reactions, sendReaction };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @cryptobingo/frontend test -- useRoomSocial`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useRoomSocial.ts apps/frontend/src/hooks/useRoomSocial.test.ts
git commit -m "feat(frontend): hook useRoomSocial (presença + reações ao vivo)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — `RoomSocial` (online + reações + feed)

**Files:**
- Modify: `apps/frontend/src/components/gameroom/RoomSocial.tsx`
- Test: `apps/frontend/src/components/gameroom/RoomSocial.test.tsx` (criar)
- Modify: `apps/frontend/src/components/GameRoom.tsx`
- Modify: `apps/frontend/src/styles/globals.design.css`
- Modify: `apps/frontend/src/locales/{pt,en,zh}.json`

**Interfaces:**
- `RoomSocialProps` ganha: `localWinners: Array<{ ticket_id: string; win_pattern: string }>` e `clearedStages: Array<{ stage: number; winners: unknown[] }>` (para o feed). Usa `useRoomSocial({ roomId: room.room_id })`.
- Allowlist de emojis no front (espelha o backend): `['👏','🔥','😮','😢','🍀','🎉']`.

- [ ] **Step 1: i18n (3 locales)** — namespace `game_room`:

```jsonc
// pt.json
"social_online": "{{count}} online",
"social_react_aria": "Enviar reação {{emoji}}",
"social_feed_win": "Cartela #{{id}} fez {{pattern}}",
"social_feed_stage": "Estágio {{stage}} limpo",
// en.json
"social_online": "{{count}} online",
"social_react_aria": "Send reaction {{emoji}}",
"social_feed_win": "Ticket #{{id}} hit {{pattern}}",
"social_feed_stage": "Stage {{stage}} cleared",
// zh.json
"social_online": "{{count}} 在线",
"social_react_aria": "发送反应 {{emoji}}",
"social_feed_win": "卡片 #{{id}} 达成 {{pattern}}",
"social_feed_stage": "阶段 {{stage}} 已完成"
```

- [ ] **Step 2: CSS** — adicionar classes (online badge, barra de reações, reações flutuantes com `cb-reaction-float`, feed). Animar só `transform`/`opacity`:

```css
.gr-online { display: inline-flex; align-items: center; gap: .3rem; font-size: .7rem; font-weight: 700; color: var(--cb-success); }
.gr-online .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--cb-success); box-shadow: 0 0 6px var(--cb-success); }
.gr-reaction-bar { display: inline-flex; gap: .25rem; }
.gr-reaction-bar button { width: 1.9rem; height: 1.9rem; border-radius: 50%; border: 1px solid var(--cb-border-default); background: var(--cb-bg-elevated); cursor: pointer; font-size: .9rem; line-height: 1; transition: transform 120ms; }
.gr-reaction-bar button:hover { transform: scale(1.15); }
.gr-reactions-overlay { position: fixed; bottom: 90px; right: 24px; width: 60px; height: 320px; pointer-events: none; z-index: 9998; overflow: hidden; }
.gr-reaction-float { position: absolute; bottom: 0; font-size: 1.6rem; animation: cb-reaction-float 4s ease-out forwards; }
@keyframes cb-reaction-float {
  0%   { transform: translateY(0) scale(.6); opacity: 0; }
  15%  { transform: translateY(-30px) scale(1.1); opacity: 1; }
  100% { transform: translateY(-300px) scale(1); opacity: 0; }
}
.gr-event-feed { display: flex; flex-direction: column; gap: .2rem; }
.gr-event-feed .ev { font-size: .68rem; color: var(--cb-text-secondary); animation: cb-fade-in .3s ease forwards; }
```

- [ ] **Step 3: Teste (falha)** — mock `useRoomSocial`:

```tsx
// apps/frontend/src/components/gameroom/RoomSocial.test.tsx
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import RoomSocial from './RoomSocial';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }) }));
const sendReaction = vi.fn();
vi.mock('../../hooks/useRoomSocial', () => ({ useRoomSocial: () => ({ onlineCount: 4, reactions: [], sendReaction }) }));
vi.mock('../chat/ChatFloating', () => ({ default: () => <div data-testid="chat-stub" /> }));
afterEach(() => cleanup());

const room = { room_id: '1', metadata: { name: 'Sala' } } as never;

describe('RoomSocial', () => {
  it('mostra contagem de online', () => {
    render(<RoomSocial room={room} walletAddress="alice" localWinners={[]} clearedStages={[]} />);
    expect(screen.getByTestId('gr-online-count').textContent).toContain('4');
  });

  it('clicar numa reação chama sendReaction', () => {
    render(<RoomSocial room={room} walletAddress="alice" localWinners={[]} clearedStages={[]} />);
    const bar = screen.getByTestId('gr-reaction-bar');
    fireEvent.click(bar.querySelector('button')!);
    expect(sendReaction).toHaveBeenCalled();
  });

  it('feed lista vitórias recentes', () => {
    render(<RoomSocial room={room} walletAddress="alice" localWinners={[{ ticket_id: '7', win_pattern: 'Linha' }]} clearedStages={[]} />);
    expect(screen.getByTestId('gr-event-feed').textContent).toContain('7');
  });

  it('retorna null sem sala', () => {
    const { container } = render(<RoomSocial room={null} walletAddress="alice" localWinners={[]} clearedStages={[]} />);
    expect(container.querySelector('[data-testid="gr-reaction-bar"]')).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @cryptobingo/frontend test -- gameroom/RoomSocial`
Expected: FAIL.

- [ ] **Step 5: Implementar `RoomSocial.tsx`**

Manter `if (!room) return null;`. Usar `useRoomSocial`. Render: um painel social (badge online `gr-online-count`, barra de reações `gr-reaction-bar` com os 6 emojis, feed `gr-event-feed` a partir de `localWinners` (últimos ~5) + `clearedStages`), reações flutuantes `gr-reactions-overlay` (mapeia `reactions`), e o `ChatFloating` existente. Emojis allowlist no componente. Feed: `localWinners.slice(-5).map(w => t('game_room.social_feed_win', { id: w.ticket_id, pattern: w.win_pattern }))` + stages. data-testids: `gr-online-count`, `gr-reaction-bar`, `gr-event-feed`.

- [ ] **Step 6: Wire no `GameRoom.tsx`**

Passar `localWinners={localWinners}` e `clearedStages={clearedStages}` ao `<RoomSocial>` (ambos já vêm do hook).

- [ ] **Step 7: Rodar (RoomSocial + caracterização)**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm --filter @cryptobingo/frontend test -- "gameroom/RoomSocial|gameroom/GameRoom.characterization"`
Expected: 0 erros TS; RoomSocial 4/4 PASS; caracterização PASS (o mock de `useSlowReveal`/api da caracterização não quebra; `useRoomSocial` usa socket — garantir que no ambiente de teste da caracterização o `RoomSocial` não dispare erro: como a caracterização não mocka `useRoomSocial`, o hook tentará `io()` real. **Mitigar:** a caracterização já mocka `services/api`; adicionar mock de `useRoomSocial` na caracterização **não** é permitido (arquivo intocado). Portanto o hook deve ser resiliente: sem token (`getAuthToken` mockado retorna o quê?) → não conecta. Confirmar que `getAuthToken` no mock da caracterização retorna vazio/undefined → `useRoomSocial` retorna early sem `io()`. Se a caracterização quebrar, reportar NEEDS_CONTEXT em vez de editar o teste.)

> ⚠️ Risco conhecido: a caracterização (`GameRoom.characterization.test.tsx`) renderiza `RoomSocial` via `GameRoom`. Ela mocka `../../services/api` mas talvez não exporte `getAuthToken`. Verificar o mock: se faltar `getAuthToken`, o import quebra. **Solução permitida:** adicionar `getAuthToken: vi.fn(() => '')` ao mock de `services/api` JÁ EXISTENTE na caracterização conta como manter o teste verde (ajuste de mock, não de asserção) — isso é aceitável (a Task 1 da Fase 0 já ajustou mocks). Se necessário, faça esse ajuste mínimo e documente no report.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/gameroom/RoomSocial.tsx apps/frontend/src/components/gameroom/RoomSocial.test.tsx apps/frontend/src/components/GameRoom.tsx apps/frontend/src/styles/globals.design.css apps/frontend/src/locales/pt.json apps/frontend/src/locales/en.json apps/frontend/src/locales/zh.json
git commit -m "feat(frontend): RoomSocial — online, reações flutuantes e feed de eventos

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: ADR-032 + AsyncAPI + verificação + PR

**Files:**
- Create: `docs/adr/ADR-032-presenca-reacoes-socket.md`
- Modify: `docs/asyncapi.yaml`

- [ ] **Step 1: ADR-032** — contexto (sala sem sinais sociais ao vivo), decisão (presença por wallet + reações allowlist/rate-limited efêmeras no `/chat`; feed derivado no front de `useSlowReveal`; leaderboard reusa controller existente). Decisões não-óbvias: **sem Mongo** (estado transitório); **presença por wallet** (dedup multi-socket); **allowlist de reações duplicada front/back** (back é fonte de verdade); **feed sem backend** (compõe de winners/stages já recebidos). Segurança: wallet do JWT, rate-limit, sem PII nova. Alternativas descartadas (persistir presença/reações; feed via novo canal do worker).

- [ ] **Step 2: AsyncAPI** — adicionar ao `docs/asyncapi.yaml` os canais/mensagens: `presence:update` (server→client), `reaction:send` (client→server), `reaction:new` (server→client), com schemas dos payloads. Seguir o estilo das mensagens já documentadas.

- [ ] **Step 3: Verificação manual** — `docker compose` + `init_dev_env.sh` + 2 navegadores logados em contas distintas na mesma sala: badge online mostra 2; reação de um aparece flutuando no outro; feed lista vitórias; reduced-motion respeitado; rate-limit de reações segura spam.

- [ ] **Step 4: `/sonar-analyze`** em `presence.ts`, `chatSocket.ts`, `useRoomSocial.ts`, `RoomSocial.tsx`. Corrigir BLOCKER/CRITICAL/MAJOR.

- [ ] **Step 5: PR**

```bash
git add docs/adr/ADR-032-presenca-reacoes-socket.md docs/asyncapi.yaml
git commit -m "docs(adr): ADR-032 presença/reações efêmeras no socket + AsyncAPI

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin feature/gameroom-fase4-social
```

PR para `develop` com `Closes #<N>`, checklist (typecheck api+front, jest socket verdes, vitest verdes, segurança do socket sem regressão, Sonar, nota visual Tier 2). Revisores: `api-reviewer` (backend) + `frontend-reviewer` (frontend).

---

## Self-Review

**1. Cobertura do spec (Fase 4):** presença/online (`PresenceStore` T1 + wiring T2 + `useRoomSocial` T3 + badge T4) ✔; reações flutuantes (backend allowlist/rate-limit T2 + hook T3 + UI/animação T4) ✔; feed de eventos (derivado no front de winners/stages, T4) ✔; chat integrado (ChatFloating mantido, T4) ✔; leaderboard reusa `leaderboardController` (sem mudança — citar na ADR) ✔. Sem nova coleção Mongo ✔; segurança (wallet do JWT, rate-limit, allowlist) ✔.

**2. Placeholders:** `<N>` (issue) preenchido na criação. Código completo: `presence.ts`, wiring do `chatSocket`, `useRoomSocial`, CSS, i18n; testes com casos concretos. AsyncAPI/ADR descritos com o conteúdo exato a documentar. Sem TODO/TBD.

**3. Consistência de tipos/eventos:** eventos `presence:update`/`reaction:send`/`reaction:new` com os mesmos payloads em backend (T2), hook (T3), testes e AsyncAPI (T5). `REACTION_EMOJIS` idêntico front/back (documentado na ADR). `createPresenceStore`/`PresenceStore` (T1) consumido em T2.

**Observação para o executor:** presença é **por wallet** — nunca contar sockets. O `useRoomSocial` abre socket próprio: isso é seguro **porque** o backend dedup por wallet; não "consertar" abrindo no socket do `useChat` (acoplaria). Risco a vigiar: a caracterização renderiza `RoomSocial`; garanta que sem token o `useRoomSocial` não chama `io()` (early return) — ajuste de mock é permitido, edição de asserção não. Segurança do socket é bloqueante: `chatSocket.security.test.ts` deve seguir verde.
