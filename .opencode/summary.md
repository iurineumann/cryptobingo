## Goal
- Implementar analytics (GA4 via GTM) na landing page + integrar hooks profundidade + gerar docs/ADR

## Constraints & Preferences
- Landing page em Azure SWA free tier (sem server runtime)
- Az Function landing-api.cryptobingo.bet como backend (fora do escopo)
- Nao mexer em index.html (dev) / app/root.tsx (prod) — setup GTM/CCv3 intocado
- trackEvent so chama dataLayer.push (sem GA4 MP fallback)
- Nomes de eventos em ingles
- TDD obrigatorio (test-first) com vitest
- Git flow: feature branch → PR → develop
- SonarQube blocker/critical antes de commit
- Sem comentarios em codigo

## Progress
- [fix] Blog markdown: `content.ts:111` `marked.parse()`, `BlogPost.tsx` `dangerouslySetInnerHTML`
- [fix] TOC scroll tracking: `PageView.tsx` IntersectionObserver fix (topmost heading + rootMargin)
- [fix] Tutoriais sem link: adicionado no Header + Footer
- [spec] `docs/superpowers/specs/analytics-landing-page-plan.md` — 15 eventos
- [spec] `docs/superpowers/specs/observability-stack-plan.md` — 5 fases
- [plan] `docs/superpowers/plans/2026-07-04-analytics-landing-page.md` — 10 tasks
- [plan] `docs/superpowers/plans/2026-07-04-observability-stack.md` — 5 fases
- Task 1: `services/analytics.ts` + testes (commit `a0d05e1`)
- Task 2: `hooks/useAnalytics.ts` + testes (commit `e56c7b9`, fix `0ad698c`)
- Task 3: Hero.tsx — cta_click (commit `a2b564e`)
- Task 4: Header.tsx — nav_click, cta_click, locale_switch
- Task 5: Newsletter.tsx — newsletter_subscribe, newsletter_error
- Task 6: Footer.tsx — external_link_click, nav_click (internal)
- Task 7: FaqPage.tsx — faq_toggle
- Task 8: hooks profundidade — useScrollDepth, usePageTiming, useSectionVisibility (commit `8fec300`, fix `d8c8579`)
- Task 9: PressKitPage, BlogIndex, TutorialsIndex — downloads/clicks
- Task 10: QA + Docs + ADR + HomePage integration (commit `c12c888`)
- `docs/adr/ADR-042-analytics-landing-page.md`
- `docs/superpowers/analytics-setup-landing.md`
- 82 testes, 24 files, build ok

## Events Implementados (15)
| Evento | Local | Gatilho |
|---|---|---|
| `cta_click` | Hero (hero, hero_learn), Header (header, drawer) | Click CTA |
| `nav_click` | Header, Footer (internal) | Nav link click |
| `locale_switch` | Header | Lang switcher |
| `newsletter_subscribe` | Newsletter | Submit OK |
| `newsletter_error` | Newsletter | Submit erro |
| `external_link_click` | Footer | External link click |
| `faq_toggle` | FAQ page | Details toggle |
| `press_kit_download` | PressKit | Download button |
| `blog_click` | BlogIndex | Post link click |
| `tutorial_click` | TutorialsIndex | Tutorial link click |
| `scroll_depth` | HomePage | Scroll milestones 25/50/75/90/100% |
| `page_timing` | HomePage | Time thresholds 10/30/60/120/180/300s |
| `section_visibility` | HomePage | Section enters viewport (once) |

## Branch
`feature/lp-fixes-e-analytics` — 1 commit ahead of `develop` (merge PR #183)

## Next Steps
- Verificar deploy landing page apos merge
- Implementar Monte Carlo calibration UI / ajustes finos de peso
