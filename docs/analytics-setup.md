# Analytics Setup

## Stack

- **GTM:** `GTM-N88CZVJF` (carregado via `index.html`)
- **GA4:** `G-BLQRZ64RES` · Property ID: `544079006`
- **GA4 API Secret:** `GA4_API_SECRET` (env var no `api-gateway`)

## Eventos

### Frontend (app principal)

| Evento | Local | Gatilho | Parâmetros |
|---|---|---|---|
| `page_view` | `useAnalytics.ts` | Troca de rota | `page_path`, `page_search` |
| `win` | `GameRoom.tsx` | Vitória do jogador | `game_id`, `amount`, `value` |
| `buyin` | `useTicketPurchase.ts` | Compra de cartela | `game_id`, `amount`, `tickets` |
| `login` | `App.tsx:handleLogin` | Auth bem-sucedida | `method` |
| `room_enter` | `useGameRoomState.ts` | Game carregado (1x) | `game_id` |
| `share_win_click` | `ShareWinButton.tsx` | Clique em botão de share | `platform`, `game_id`, `prize_amount` |

### Landing Page (apps/landing-page)

Serviço próprio `services/analytics.ts` (sem proxy GA4 MP). Detalhes em `docs/superpowers/analytics-setup-landing.md` e ADR-042.

| Evento | Local | Gatilho | Parâmetros |
|---|---|---|---|
| `cta_click` | Hero / Header | Clique CTA | `cta_location`, `locale` |
| `nav_click` | Header / Footer | Clique nav link | `link_text`, `link_href`, `link_type`, `locale` |
| `newsletter_subscribe` | Newsletter | Submit OK | `method`, `locale` |
| `newsletter_error` | Newsletter | Erro submit | `error_type`, `error_message`, `locale` |
| `external_link_click` | Footer | Clique social/produto | `link_text`, `link_url`, `locale` |
| `faq_toggle` | FaqPage | Open/close FAQ | `question_slug`, `action`, `locale` |
| `locale_switch` | Header | Troca idioma | `from_locale`, `to_locale`, `source`, `locale` |
| `scroll_depth` | useScrollDepth | Scroll milestone | `depth`, `path`, `locale` |
| `page_timing` | usePageTiming | Timer threshold | `seconds`, `path`, `locale` |
| `section_visibility` | useSectionVisibility | Viewport entry | `section`, `action`, `locale` |
| `press_kit_download` | PressKitPage | Download button | `item`, `locale` |
| `blog_click` | BlogIndex | Post click | `post_slug`, `post_title`, `locale` |
| `tutorial_click` | TutorialsIndex | Tutorial click | `tutorial_slug`, `locale` |

## Arquitetura

### `services/analytics.ts`

Camada base — resolve rota do evento:

```
se adblock detectado → POST /api/v1/analytics/event (proxy server-side)
senão → gtag('event', ...) direto
```

- `trackEvent(eventName, params?)` — função pública
- `setAdblockDetected(bool)` — toggle do proxy

### `hooks/useAnalytics.ts`

Hook React que:

1. Detecta adblock no mount (fetch de `gtag/js` → falha = adblock)
2. Enriquece eventos com: `send_to`, `page_location`, `page_title`, `language`, `user_agent`
3. Dispara `page_view` automático em troca de rota
4. Retorna `{ trackEvent }` p/ uso em componentes hook-based

### Chamada direta via `~/services/analytics`

Para hooks que não podem consumir `useAnalytics` (ex: `useGameRoomState`), importar `trackEvent` direto do service. Enriquecimento GA4 (send_to, page_location etc.) é perdido — OK para eventos simples (`room_enter`, `login`) pois GTM no site já coleta page info.

### Landing Page (`apps/landing-page`)

Serviço próprio em `apps/landing-page/src/services/analytics.ts` — versão simplificada sem proxy GA4 MP. Único path: `dataLayer.push({ event: name, ...params })`. Consumo via `useAnalytics(locale)` de `@/hooks/useAnalytics`. Ver ADR-042 e `docs/superpowers/analytics-setup-landing.md`.

## Adblock

- **Detecção:** fetch HEAD de `https://www.google-analytics.com/gtag/js?id=G-BLQRZ64RES`
- **Cache:** detectado uma vez por sessão (`adblockCached`), compartilhado entre `useAnalytics` e chamadas diretas
- **Fallback:** proxy em `POST /api/v1/analytics/event` no api-gateway, que repassa ao GA4 via Measurement Protocol

## GA4 Custom Events (configurar no GA4)

Criar como **eventos personalizados** (não precisam ser pré-declarados, mas recommended):

- `share_win_click` — sem parâmetros obrigatórios
- `login` — sem parâmetros obrigatórios
- `room_enter` — sem parâmetros obrigatórios

## Manutenção

### Adicionar novo evento

#### Frontend principal

1. Chamar `trackEvent('meu_evento', { param1: 'valor' })`
2. Se o hook tem acesso a `useAnalytics()`, usar `trackEvent` do hook (enriquecido)
3. Se for hook sem acesso (ex: service, hook stand-alone), importar `trackEvent` de `~/services/analytics`
4. Atualizar tabela acima

#### Landing page

1. Usar `useAnalytics(locale)` de `@/hooks/useAnalytics`
2. Chamar `trackEvent` nos handlers relevantes
3. Testar com mock `window.dataLayer`
4. Atualizar `docs/superpowers/analytics-setup-landing.md`

### Links úteis

- [GA4 DebugView](https://support.google.com/analytics/answer/7201382)
- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
