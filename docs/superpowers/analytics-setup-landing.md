# Analytics — Landing Page (doc final)

## Arquitetura

```
Componentes (Hero, Header, Footer, Newsletter, etc.)
  → useAnalytics(locale).trackEvent(name, params)
    → services/analytics.ts
      ├── _analyticsConsented && dataLayer presente → dataLayer.push()
      └── sem consentimento/dataLayer ausente → silencioso
        → GTM (GTM-N88CZVJF) coleta do dataLayer
          → GA4 (G-BLQRZ64RES)

Hooks automáticos (HomePage):
  useScrollDepth  → scroll_depth (25/50/75/90/100% + bottom)
  usePageTiming   → page_timing (10/30/60/120/180/300s)
  useSectionVisibility → section_visibility (IntersectionObserver)
```

Sem proxy GA4 MP, sem fallback adblock, sem alteração no setup GTM existente.

## Eventos

### P0 — Funil de Aquisição

| Evento | Componente | Gatilho | Parâmetros |
|---|---|---|---|
| `cta_click` | Hero | Clique CTA principal / Learn More | `cta_location: hero\|hero_learn`, `locale` |
| `cta_click` | Header | Clique CTA no header / drawer | `cta_location: header\|drawer`, `locale` |
| `nav_click` | Header | Clique em link de navegação (desktop ou mobile) | `link_text`, `link_href`, `link_type: internal\|external`, `locale` |
| `nav_click` | Footer | Clique em link interno (FAQ, blog, etc.) | `link_text`, `link_href`, `link_type: internal`, `locale` |
| `newsletter_subscribe` | Newsletter | Submit do formulário com sucesso | `method: api`, `locale` |

### P1 — Engajamento

| Evento | Componente | Gatilho | Parâmetros |
|---|---|---|---|
| `external_link_click` | Footer | Clique em link externo (produto ou comunidade) | `link_text`, `link_url`, `locale` |
| `faq_toggle` | FaqPage | Open/close `<details>` | `question_slug`, `action: open\|close`, `locale` |
| `locale_switch` | Header | Troca de idioma no seletor | `from_locale`, `to_locale`, `source: header`, `locale` |
| `section_visibility` | HomePage* | Seção entra no viewport (30%) | `section: hero\|features\|...`, `action: view`, `locale` |

### P2 — Profundidade

| Evento | Componente | Gatilho | Parâmetros |
|---|---|---|---|
| `scroll_depth` | HomePage* | Scroll atinge milestone | `depth: 25%\|50%\|75%\|90%\|100%\|bottom`, `path`, `locale` |
| `page_timing` | HomePage* | Tempo na página | `seconds: 10\|30\|60\|120\|180\|300`, `path`, `locale` |
| `press_kit_download` | PressKitPage | Clique download | `item: logo\|icon\|screenshots`, `locale` |
| `blog_click` | BlogIndex | Clique em post | `post_slug`, `post_title`, `locale` |
| `tutorial_click` | TutorialsIndex | Clique em tutorial | `tutorial_slug`, `locale` |
| `newsletter_error` | Newsletter | Erro no submit | `error_type`, `error_message`, `locale` |

\* Pendente integração — hooks existem mas não conectados a componente.

## Hooks

### `useAnalytics(locale?)`

Hook principal. Retorna `{ trackEvent }`.

- Aceita `locale` opcional — injetado em todo evento como parâmetro `locale`
- Se locale omitido, usa `'en'` como fallback
- `trackEvent(name, params)` chama `services/analytics.trackEvent` com locale enriquecido

### `useScrollDepth(trackEvent, pagePath, locale?)`

Rastreia profundidade de scroll.

- Milestones: 25%, 50%, 75%, 90%, 100%
- Evento extra `bottom` quando scrollY está a <50px do final
- Dedup via `Set` — cada milestone dispara uma vez
- Listener `scroll` com `{ passive: true }`

### `usePageTiming(trackEvent, pagePath, locale?)`

Rastreia tempo na página.

- Thresholds: 10s, 30s, 60s, 120s, 180s, 300s
- `setInterval` a cada 1s, verifica thresholds atingidos
- Dedup via `Set` — cada threshold dispara uma vez
- Cleanup: `clearInterval` no unmount

### `useSectionVisibility(trackEvent, sectionRefs, sectionNames, locale?)`

Rastreia visibilidade de seções via IntersectionObserver.

- Threshold: 30% visível
- Aceita arrays paralelos `sectionRefs` (ref objects) e `sectionNames` (strings)
- Dedup por nome — cada seção dispara uma vez
- Usa `useRef` para refs e nomes estáveis (evita re-criação do observer)

## Manutenção

### Adicionar novo evento

1. Chamar `trackEvent('meu_evento', { param1: 'valor' })` no componente
2. Usar `useAnalytics(locale)` para locale automático
3. Escrever teste que verifica `window.dataLayer` após o evento
4. Atualizar tabela neste documento
5. Atualizar ADR-042 se evento for estrutural

### Adicionar analytics a novo componente

1. Importar `useAnalytics` de `@/hooks/useAnalytics`
2. Obter locale via `useParams()` ou `i18n.language`
3. Usar `trackEvent` nos handlers relevantes
4. Adicionar `data-testid` nos elementos
5. Criar `__tests__/Componente.test.tsx` com mock `window.dataLayer`

### Adicionar nova seção à HomePage

1. Criar `useRef` para o elemento da seção
2. Adicionar ref ao JSX da seção
3. Incluir ref e nome em `useSectionVisibility`

## Convenções

- `trackEvent` só chama `dataLayer.push` — sem efeitos colaterais
- Nomes de eventos em inglês, snake_case
- Parâmetros em snake_case
- `locale` incluso automaticamente pelo hook — não passar manualmente
- Sem comentários no código
- Testes em `__tests__/` ao lado do arquivo testado
- `dataLayer` mockado via `window.dataLayer = []` no beforeEach
- `_analyticsConsented = true` nos testes que esperam eventos
