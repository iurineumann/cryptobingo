# Share pós-win + Analytics Padronizado

**Data:** 2026-07-03
**Fase:** 4 do plano `closeout-processo-e-features-pendentes`
**Issue:** #135 (referral) · PR: #136

---

## 1. Share Button (PrizePanels)

### 1.1 Localização

Botão "Compartilhar" dentro do `PrizePanels.tsx`, ao lado do banner "You won!". Só renderiza quando `playerWinEntries.length > 0`.

```
┌──────────────────────────────────────┐
│  🎉 You won!  R$ 45,00              │
│                                      │
│  [X] [Telegram] [Discord] [Copy]    │
│                                      │
│  + confete + prize breakdown         │
└──────────────────────────────────────┘
```

### 1.2 Plataformas

| Plataforma | Ação | URL |
|---|---|---|
| Twitter/X | `window.open` intent | `https://twitter.com/intent/tweet?text=...` |
| Telegram | `window.open` intent | `https://t.me/share/url?url=...&text=...` |
| Discord | clipboard + toast | Copia texto formatado, toast "Copiado! Cole no Discord" |
| Copy Link | clipboard + toast | Copia link do jogo, toast "Link copiado!" |

### 1.3 Texto compartilhado (i18n pt/en/zh)

```
{ t('share_win.text', { amount, gameUrl }) }
```

- **pt:** "Acabei de ganhar R${amount} no @CryptoBingo! 🎰💰\n{gameUrl}"
- **en:** "I just won $${amount} on @CryptoBingo! 🎰💰\n{gameUrl}"
- **zh:** "我在 @CryptoBingo 赢了 $${amount}！🎰💰\n{gameUrl}"

### 1.4 Componente

`apps/frontend/src/components/gameroom/ShareWinButton.tsx`

- Props: `{ amount: number; gameId: string; gameUrl: string }`
- 4 botões com ícones + data-testid `share-win-btn-{platform}`
- Clipboard usa `navigator.clipboard.writeText` com fallback `document.execCommand('copy')`
- Toast via hook existente (ou biblioteca de notificação)
- Tracking: `trackEvent('share_win_click', { platform, game_id, prize_amount })`

### 1.5 Testes

- Renderiza 4 botões quando `amount > 0`
- Click Twitter → `window.open` com URL correta
- Click Telegram → `window.open` com URL correta
- Click Copy → `navigator.clipboard.writeText` chamado
- Click Discord → clipboard + toast
- data-testid presente em cada botão

---

## 2. Analytics Padronizado

### 2.1 `apps/frontend/src/services/analytics.ts`

Função única `trackEvent(name, params)`:

```ts
// usa adblockDetection ref do useAnalytics (setado via fetch probe)
// true → proxy fallback · false → gtag direto
let adblockDetected = false;
export function setAdblockDetected(v: boolean) { adblockDetected = v; }

export function trackEvent(name: string, params?: Record<string, unknown>): void {
    try {
        if (adblockDetected && navigator.onLine) {
            fetch('/api/v1/analytics/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, params }),
                keepalive: true,
            }).catch(() => {});
        } else if (typeof window.gtag === 'function') {
            window.gtag('event', name, params);
        }
    } catch {
        // silencioso
    }
}
```

### 2.2 Migração de eventos existentes

| Local | Evento atual | Passa a usar |
|---|---|---|
| `GameRoom.tsx:119` | `dataLayer.push({ event: 'win', ... })` | `trackEvent('win', { ... })` |
| `useTicketPurchase.ts:205` | `gtag('event', 'buyin', ...)` | `trackEvent('buyin', { ... })` |
| `useAnalytics.ts:87` | `gtag('event', 'page_view', ...)` | `trackEvent('page_view', { ... })` |

### 2.3 Enriquecimento de eventos

**Evento `win`** (GameRoom.tsx):
```
{ game_id, amount, tickets, game_type, draw_mode, room_id, player_tier, golden_multiplier }
```

**Evento `buyin`** (useTicketPurchase.ts):
```
{ tickets, game_id, value, game_type, room_id, currency, player_tier }
```

**Evento `login`** (novo — `useWallet` ou `App.tsx` no callback `onLogin`/`onAuthenticated`):
```
{ wallet, method: 'wharfkit'|'anchor' }
```

**Evento `room_enter`** (novo — useGameRoomState ou GameRoom):
```
{ game_id, room_id, game_type }
```

**Evento `share_win_click`** (ShareWinButton):
```
{ platform: 'twitter'|'telegram'|'discord'|'copy', game_id, prize_amount }
```

---

## 3. GTM / GA4 Configuration

### 3.1 GA4 Custom Events (Admin > Events > Create)

| Evento | Parâmetros |
|---|---|
| `share_win_click` | `platform`, `game_id`, `prize_amount` |
| `login` | `wallet`, `method` |
| `room_enter` | `game_id`, `room_id`, `game_type` |

### 3.2 GA4 Custom Dimensions (Admin > Custom Definitions)

| Dimensão | Escopo | Eventos |
|---|---|---|
| `game_id` | event | win, buyin, share_win, room_enter |
| `game_type` | event | win, buyin, room_enter |
| `draw_mode` | event | win |
| `room_id` | event | win, buyin, room_enter |
| `player_tier` | event | win, buyin |
| `golden_multiplier` | event | win |
| `platform` | event | share_win_click |

### 3.3 GTM Tags

- 1 GA4 Event tag → Measurement ID `G-BLQRZ64RES`
- Triggers: 4 eventos custom (`share_win_click`, `login`, `room_enter`)

### 3.4 GA4 Funnels

1. **Aquisição:** `page_view` → `login` → `room_enter` → `buyin` → `win`
2. **Viralidade:** `share_win_click` por plataforma
3. **Retenção:** Weekly active users, repeat buyers

---

## 4. Arquivos afetados

### Frontend

| Arquivo | Ação |
|---|---|
| `apps/frontend/src/components/gameroom/PrizePanels.tsx` | Adicionar `ShareWinButton` |
| `apps/frontend/src/components/gameroom/ShareWinButton.tsx` | **Criar** — 4 botões share |
| `apps/frontend/src/services/analytics.ts` | **Criar** — `trackEvent()` |
| `apps/frontend/src/hooks/useAnalytics.ts` | Refatorar para usar `trackEvent()` |
| `apps/frontend/src/components/GameRoom.tsx` | Migrar `dataLayer.push` → `trackEvent` |
| `apps/frontend/src/hooks/useTicketPurchase.ts` | Migrar `gtag` → `trackEvent` |
| `apps/frontend/src/App.tsx` | Adicionar `trackEvent('login')` no callback auth |
| `apps/frontend/src/hooks/useGameRoomState.ts` (ou GameRoom) | Adicionar `trackEvent('room_enter')` |
| `apps/frontend/src/locales/{pt,en,zh}.json` | Adicionar seção `share_win` |

### Docs

| Arquivo | Ação |
|---|---|
| `docs/analytics-setup.md` | **Criar** — GTM/GA4 config reference |

---

## 5. Testes

| Teste | Arquivo |
|---|---|
| ShareWinButton renderiza 4 botões | `ShareWinButton.test.tsx` |
| Clipboard copy | `ShareWinButton.test.tsx` |
| Toast no Discord | `ShareWinButton.test.tsx` |
| trackEvent envia gtag + fetch fallback | `analytics.test.ts` |
| Migração win event (regressão) | `GameRoom.test.tsx` (existente) |
