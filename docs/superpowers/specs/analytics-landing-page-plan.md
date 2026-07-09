# Plano de Analytics — Landing Page CryptoBingo

**Data:** 2026-07-04
**Persona:** Growth Analytics Lead
**Objetivo:** Implementar eventos custom de tracking (GA4 via GTM) na landing page para monitorar conversao, engajamento e funil de aquisicao.

---

## 1. Diagnostico Atual

### Funciona
- ✅ GTM (GTM-N88CZVJF) carregado, GA4 (G-BLQRZ64RES) configurado
- ✅ Clarity (xge781i2so) configurado e respeita consentimento
- ✅ CookieConsent v3 com GCM v2 (consent defaults = denied)
- ✅ `page_view` basico em SPA navigation (root.tsx RouteTracker)
- ✅ CSP cobre GTM/GA4/Clarity em producao

### Bugs (P0 — corrigir ANTES dos eventos)
Nenhum bug em producao. `index.html` (dev apenas) e `root.tsx` (prod) nao colidem em prod.
- **ZERO eventos custom:** Nenhum clique, formulario, scroll ou interacao rastreada.
- **Proxy GA4 MP:** Funciona. Nao mexer.

---

## 2. Eventos Propostos

### P0 — Funil de Aquisicao (2h)

| Evento | Pergunta de Negocio | Gatilho | Parametros |
|---|---|---|---|
| `cta_click` | Qual canal/locale converte melhor? | CTA Hero, Header, Drawer "Jogar Agora" | `cta_location: hero\|header\|drawer`, `locale` |
| `nav_click` | Que produtos interessam? | Nav link click (internal/external) | `link_text`, `link_href`, `link_type: internal\|external`, `locale` |
| `newsletter_subscribe` | Newsletter convertendo? CAC da lead? | Submit OK formulario | `locale`, `method: api` |

### P1 — Engajamento (2h)

| Evento | Pergunta de Negocio | Gatilho | Parametros |
|---|---|---|---|
| `section_visibility` | Que secoes sao vistas? | Viewport entry via IntersectionObserver | `section_name`, `locale`, `time_on_page` |
| `external_link_click` | Canais sociais geram trafego? | Social link click (Telegram, X, Discord, GitHub) | `link_text`, `link_url`, `locale` |
| `faq_toggle` | FAQ e util? Duvidas frequentes? | Open/close FAQ `<details>` | `question_slug`, `action: open\|close`, `locale` |
| `locale_switch` | Preferencia idioma? Fricao no UX? | Lang switcher click | `from_locale`, `to_locale`, `source: header\|footer` |

### P2 — Profundidade (2h)

| Evento | Pergunta de Negocio | Gatilho | Parametros |
|---|---|---|---|
| `scroll_depth` | Ponto de queda na pagina? | Scroll 25/50/75/100% | `depth: 25\|50\|75\|100`, `page_path`, `locale` |
| `page_time` | Investimento do usuario? | Timers 15/30/60/120s | `duration`, `page_path`, `locale` |
| `press_kit_download` | Imprensa baixando materiais? | Download button (logo/icon/screenshots) | `item: logo\|icon\|screenshots`, `locale` |
| `blog_click` | Conteudo que engaja? | Blog post click | `post_slug`, `post_title`, `locale` |
| `newsletter_error` | Fricao no formulario? | Erro submissao newsletter | `error_type`, `error_message`, `locale` |
| `error_display` | Pontos de friccao gerais? | UX error visible | `error_type`, `error_message`, `locale` |

---

## 3. Arquitetura

### Abordagem: `services/analytics.ts` + `useAnalytics` hook + GTM-only (sem fallback)

```
Componentes
  → useAnalytics().trackEvent(name, params)
  → services/analytics.ts
    ├── consentimento OK → dataLayer.push({ event: name, ...params })
    └── sem consentimento → silencioso
```

Sem fallback proxy GA4 MP. Se adblock bloquear GTM, eventos sao perdidos — aceitavel. O GTM carrega `gtag` e gerencia o envio ao GA4.

### Alternativa Rejeitada
- ❌ **dataLayer.push puro nos componentes:** Sem abstracao, sem teste, sem consistencia.

---

## 4. Correcoes Pre-Requisito

Nenhuma. Setup existente de analytics permanece intocado.

---

## 5. Plano de Implementacao

**Estimativa total: ~6h**

### Fase 1 — Fundacao (1h)
- Criar `src/services/analytics.ts` (trackEvent via dataLayer.push)
- Criar `src/services/__tests__/analytics.test.ts`
- Criar `src/hooks/useAnalytics.ts`

### Fase 2 — Eventos P0 (2h)
- `Hero.tsx`: `cta_click` no CTA e learn-more
- `Header.tsx`: `cta_click` no CTA, `nav_click` nos links, `locale_switch`
- `Newsletter.tsx`: `newsletter_subscribe`, `newsletter_error`

### Fase 3 — Eventos P1 (2h)
- `Footer.tsx`: `external_link_click` nos sociais
- `FaqPage.tsx`: `faq_toggle` via observer no `<details>`
- Criar `useSectionVisibility.ts` + integrar em `HomePage.tsx`

### Fase 4 — Eventos P2 (2h)
- Criar `useScrollDepth.ts` + integrar em `HomePage.tsx`
- Criar `usePageTiming.ts` + integrar em paginas
- `PressKitPage.tsx`: `press_kit_download`
- `BlogIndex.tsx` / `TutorialsIndex.tsx`: `blog_click`, `tutorial_click`

### Fase 5 — QA + Docs (1h)
- Testes unitarios (`analytics.test.ts`)
- Testes de componente (data-testid + gtag mock)
- ADR-042: `docs/adr/ADR-042-analytics-landing-page.md`
- Atualizar `docs/analytics-setup.md`

---

## 6. Testes

### Unitarios (analytics.test.ts)
- `trackEvent` com consent → chama `dataLayer.push`
- `trackEvent` sem consent → silencioso
- `trackEvent` com `dataLayer` undefined → silencioso (nao quebra)
- `trackEvent` nunca lanca excecao

### Componente (data-testid + gtag mock)
- Click `hero-cta` → `cta_click`
- `newsletter-success` aparece → `newsletter_subscribe`
- `trust-contract-link` click → `external_link_click`

### Manual (GA4 DebugView)
- Abrir com `?gtm_debug=x`
- Verificar cada evento no DebugView

---

## 7. Metricas de Sucesso

| Metrica | Target (30d) | Evento Base |
|---|---|---|
| CTA click rate | >2% | `cta_click` |
| Newsletter conversao | >5% | `newsletter_subscribe` |
| Scroll 50%+ | >50% das visitas | `scroll_depth` |
| FAQ interacao | >10% visitas FAQ | `faq_toggle` |
| Press downloads | >5/mes | `press_kit_download` |
| Zero erro de tracking | 100% uptime | `trackEvent` sem throw |

---

## 8. ADR-042 (proposto)

**Decisao:** Criar `services/analytics.ts` proprio da landing page seguindo padrao do frontend.

**Justificativa:** Consistencia com monorepo, reuso do proxy GA4 ja existente, testabilidade, fallback adblock.

**Unico path:** `dataLayer.push({ event: name, ...params })`. Sem fallback, sem proxy.

**Hibrido:** TS-first para eventos estruturantes + GTM para experimentos/marketing sem deploy.

**Excluido:** PostHog, Cloudflare Insights, Facebook Pixel (sem decisao de produto). Proxy GA4 MP intocado (funciona).

---

## 9. Processos Obrigatorios

Toda implementacao segue os processos definidos em `CLAUDE.md` e `docs/MASTER-PROMPT.md`:

### TDD (RED→GREEN→refactor)
- Teste unitario primeiro para `services/analytics.ts`
- `dataLayer.push` mockado, verificar chamada com evento correto
- Teste sem consentimento → silencioso
- `dataLayer` undefined → silencioso (nao quebra)
- Implementacao minima para passar o teste

### SonarQube
- Rodar `sonarqube_analyze_code_snippet` em cada `.ts`/`.tsx` modificado antes do commit
- Blocker/critical/major corrigidos antes do commit
- Minor aceitavel com justificativa

### Git Flow
- Branch: `feature/lp-analytics` a partir de `develop`
- PR para `develop` com template `.github/PULL_REQUEST_TEMPLATE.md`
- Pre-PR: typecheck + testes verdes
- NUNCA commit direto em `develop`/`master`

### ADR
- `docs/adr/ADR-042-analytics-landing-page.md` se decisao estrutural (services/analytics.ts proprio da LP)
- Atualizar `docs/analytics-setup.md`

### RAG e Contexto
- Usar `mcp-rag_search` para consultar padroes existentes no codigo (frontend `services/analytics.ts`, hooks, componentes com data-testid)
