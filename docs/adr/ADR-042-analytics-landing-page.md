# ADR-042 — Analytics na Landing Page (cliente-side via GTM/GA4)

**Status:** Aceito (2026-07-04)
**Data:** 2026-07-04

---

## Problema

A landing page (`apps/landing-page`) não possuía nenhum evento custom de tracking. GTM
(GTM-N88CZVJF) e GA4 (G-BLQRZ64RES) já carregados mas sem eventos de clique, formulário,
scroll ou interação. Impossível medir conversão do funil de aquisição, engajamento ou
pontos de atrito.

### Restrições

1. **Azure SWA Free**: sem server runtime — GA4 Measurement Protocol proxy não é opção
2. **Setup GTM existente intocado**: `index.html` (dev) e `root.tsx` (prod) não podem ser
   alterados (CSP, consentimento já configurados)
3. **Consentimento**: CookieConsent v3 com GCM v2 — eventos só após consentimento `granted`
4. **Monorepo**: landing page é aplicação separada do frontend principal — compartilha
   stack mas não o mesmo `services/analytics.ts` (que tem proxy GA4 MP e lógica de adblock)

## Decisão

### Camada de abstração própria

Criar `services/analytics.ts` exclusivo da landing page, seguindo o mesmo padrão do
frontend principal mas simplificado (sem proxy GA4 MP, sem adblock detection):

```
Componentes
  → useAnalytics().trackEvent(name, params)
  → services/analytics.ts
    ├── consentimento OK → dataLayer.push({ event: name, ...params })
    └── sem consentimento → silencioso
```

### dataLayer.push como único path

- `trackEvent` empurra para `dataLayer` com `event` como primeiro campo
- GTM coleta do dataLayer e repassa ao GA4
- Sem fallback, sem proxy — se adblock bloquear GTM, eventos são perdidos (aceitável)

### Hook useAnalytics

- Injeta `locale` automaticamente em todos os eventos
- Componentes importam `@/hooks/useAnalytics` com locale do segmento da URL
- Locale enriquecido evita ter que passar `i18n.language` em cada chamada

### Hooks de profundidade

Três hooks dedicados para automação de eventos sem intervenção manual:

| Hook | Evento | Gatilho |
|---|---|---|
| `useScrollDepth` | `scroll_depth` | Milestones 25/50/75/90/100% + bottom |
| `usePageTiming` | `page_timing` | Thresholds 10/30/60/120/180/300s |
| `useSectionVisibility` | `section_visibility` | IntersectionObserver 30% |

### Alternativas Rejeitadas

- **dataLayer.push puro nos componentes**: sem abstração, sem teste, sem consistência
- **Proxy GA4 MP (como no frontend principal)**: Azure SWA Free sem server runtime
- **PostHog / Cloudflare Insights / Facebook Pixel**: sem decisão de produto

## Consequências

### Positivas

- Consistência com o monorepo (mesmo padrão `services/analytics.ts` + hooks)
- Testabilidade via `dataLayer` mock — sem dependência externa
- Zero impacto no setup GTM/GA4/consentimento existente
- Eventos ricos com `locale` automático em todas as chamadas
- Hooks de profundidade evitam poluir componentes com lógica de tracking

### Negativas

- Dois `services/analytics.ts` no monorepo (frontend + landing) — podem divergir
- Eventos perdidos se adblock bloquear GTM (sem fallback)
- `section_visibility` exige refs manuais e nomes de seção consistentes

### Neutras

- Hook `useScrollDepth` e `usePageTiming` usam `Set` para dedup — fica em memória até
  a página desmontar
- GTM continua sendo o ponto central de configuração — experimentos/marketing sem deploy

## Eventos

| Evento | Prioridade | Componente | Gatilho | Parâmetros |
|---|---|---|---|---|
| `cta_click` | P0 | Hero, Header | Clique CTA | `cta_location: hero\|header\|drawer\|hero_learn`, `locale` |
| `nav_click` | P0 | Header, Footer | Clique nav link | `link_text`, `link_href`, `link_type: internal\|external`, `locale` |
| `newsletter_subscribe` | P0 | Newsletter | Submit OK | `method: api`, `locale` |
| `newsletter_error` | P2 | Newsletter | Erro submit | `error_type`, `error_message`, `locale` |
| `section_visibility` | P1 | HomePage* | Viewport entry | `section: hero\|features\|...`, `action: view`, `locale` |
| `external_link_click` | P1 | Footer | Clique social | `link_text`, `link_url`, `locale` |
| `faq_toggle` | P1 | FaqPage | Open/close `<details>` | `question_slug`, `action: open\|close`, `locale` |
| `locale_switch` | P1 | Header | Lang switcher | `from_locale`, `to_locale`, `source: header\|footer` |
| `scroll_depth` | P2 | HomePage* | Scroll milestone | `depth: 25%\|50%\|75%\|90%\|100%\|bottom`, `path`, `locale` |
| `page_timing` | P2 | HomePage* | Timer threshold | `seconds: 10\|30\|60\|120\|180\|300`, `path`, `locale` |
| `press_kit_download` | P2 | PressKitPage | Download button | `item: logo\|icon\|screenshots`, `locale` |
| `blog_click` | P2 | BlogIndex | Post link click | `post_slug`, `post_title`, `locale` |
| `tutorial_click` | P2 | TutorialsIndex | Tutorial link click | `tutorial_slug`, `locale` |

\* Pendente integração — hooks criados mas não conectados a página.
