## Goal
Landing page com UX completa, busca e conteudo i18n pt/en/zh. Content workflow com personas + QA (ADR-044).

## Constraints
- Azure SWA free tier (no server runtime), SSG puro (React Router v7 ssr:false + prerender)
- TDD obrigatorio vitest, SonarQube, Git flow (feature → PR → develop)
- i18n pt/en/zh, slugs traduziveis (content/slugs.json)
- GTM N88CZVJF, GA4 G-BLQRZ64RES, Clarity xge781i2so

## Progress
### PRs merged to develop
| PR | Branch | Result |
|---|---|---|
| #185 | feature/lp-fixes-e-analytics | Analytics 15 eventos + ADR-042 |
| #187 | feature/lp-observability | Pino, Sentry, Grafana alertas, OTel tracing, ADR-043 |
| #188 | feature/lp-features-restantes | 11 UX features + perf |

### Branch Atual
`feature/lp-content-ux-search` — 13 commits ahead `develop`

### Plan A (UX Foundations) — ✅
Layout tipografia, ContentHeader/Body, useReadingProgress, BlogPost/TutorialPost

### Plan B (Nav & TOC) — ✅
TocSidebar, Breadcrumbs (schema.org), RelatedContent, PrevNextNav, Pagination, TagFilter, anchor icons. 40 test files / 163 tests PASS. Build 99 URLs.

### Plan C (Content Production) — ✅ (precisa remediacao)
14 posts blog + 9 tutoriais × 3 locales = 75 arquivos (42 .md + 27 .mdx). Figure.tsx + FigureGallery (12 testes). Commit 072995f.

### ADRs
- ADR-042: Analytics Landing Page
- ADR-043: Stack de Observabilidade
- ADR-044: Workflow Producao Conteudo com Personas e QA Obrigatorio

### Docs criados
- docs/guides/content-personas.md — 22 personas (4 core + 9 especialistas + 9 audiencia)
- docs/adr/ADR-044-conteudo-workflow-personas-qa.md
- .opencode/plans/2026-07-05-plano-remediacao-conteudo.md — 4 fases

### Gaps identificados (07-05)
- 75 arquivos produzidos sem ativar personas/RAG/content QA
- Info factual desatualizada (WAX wallet passkeys, EOS→Vaulta, stats)
- `images:[]` vazio em todos os arquivos
- Links contextuais ausentes
- Workflow revisado em ADR-044

### Pendente
- Fase 0: content/slugs.json + content.ts modificado
- Fase 1: remediacao factual (WAX wallet 2026, EOS→Vaulta, eco Antelope)
- Fase 2: imagens frontmatter + Figure inline
- Fase 3: links contextuais + referencias
- Fase 4: scripts/check-content-qa.mjs + workflow personas
- Plan D: Search system (MiniSearch, overlay, trigger, results)

### Testes
- Landing: 163 tests, 40 files
- API Gateway: 350+ tests
- Worker: 200+ tests
- Frontend: 290+ tests

### Performance
596KB JS, 53KB CSS, tree-shaking OK, Lighthouse 6 pages
