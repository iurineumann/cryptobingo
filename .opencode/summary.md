## Goal
Landing page completa: i18n, CMS, conteudo legal, SEO, analytics, observabilidade, UX.

## Constraints
- Azure SWA free tier (no server runtime)
- SSG puro (React Router v7 ssr:false + prerender)
- TDD obrigatorio vitest
- Git flow: feature → PR → develop
- Sem comentarios em codigo
- i18n pt/en/zh
- GTM container GTM-N88CZVJF, GA4 G-BLQRZ64RES, Clarity xge781i2so

## Progress

### PRs merged to develop
| PR | Branch | Issues |
|---|---|---|
| #185 | feature/lp-fixes-e-analytics | Analytics 15 eventos + ADR-042 |
| #187 | feature/lp-observability | Pino, Sentry, Grafana alertas, OTel tracing, ADR-043 |
| #188 | feature/lp-features-restantes | 11 issues: perf, 8 UX features, fixes |

### Fases PLANO-FINAL
| Fase | Status |
|---|---|
| 0 — CI/SWA/Cache/CSP | ✅ |
| 0.5 — Legal pipeline (TinaCMS) | ✅ |
| 1 — i18n Stack | ✅ |
| 2 — TinaCMS + Routing | ✅ |
| 3 — Legal + Trust (9 paginas) | ✅ |
| 4 — Whitepaper | ✅ |
| 5 — Content + Tutoriais | ✅ |
| 6 — SEO + Polish (hreflang, canonical, sitemap, 404, structured data) | ✅ |
| 7 — Analytics (GA4, hooks, ADR-042) | ✅ |
| 8 — Observabilidade (Pino, Sentry, Grafana, OTel, ADR-043) | ✅ |
| 9 — UX features + fixes (11 issues) | ✅ |

### Analytics (15 eventos)
cta_click, nav_click, locale_switch, newsletter_subscribe, newsletter_error, external_link_click, faq_toggle, press_kit_download, blog_click, tutorial_click, scroll_depth, page_timing, section_visibility

### Observabilidade
- Pino: API Gateway + Worker (JSON logging, requestId ALS)
- Sentry: Frontend (ErrorBoundary) + Landing (SSG-safe)
- Grafana alertas: 6 regras (worker, api, chain) + Slack notifier
- OTel: API Gateway (auto-instrumentations) + Worker (amqplib)

### UX features implementadas
ActivityFeed (wins live), HowItWorks BAB redesign, Hero pulse+animation+timer+screenshot, Header urgency timer+hamburger drawer, StatsBar counting-up, WalletSection, Feature icons fix, i18n keys audit

### Performance
Lighthouse script (6 pages), bundle visualizer (rollup-plugin-visualizer), tree-shaking OK, 596KB JS, 53KB CSS

## Testes
- Landing: 92 tests, 26 files
- API Gateway: 350+ tests
- Worker: 200+ tests
- Frontend: 290+ tests

## ADRs Criados
- ADR-042: Analytics Landing Page
- ADR-043: Stack de Observabilidade

## Branch Atual
`develop` — todas as features mergeadas. Landing page completa.

## Next Steps
- Verificar deploy landing page
- Voltar a issues de outros pacotes (worker, frontend, contrato)
