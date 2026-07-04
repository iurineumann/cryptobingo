# CryptoBingo Landing Page — Plano Final Consolidado

**Data:** Julho 2026
**Fontes:** A1 (SSG+Routing) · A2 (TinaCMS+Content) · A3 (i18n+SEO) · A4 (Trust+Legal) · A5 (Build+Perf) · R1 (Cross: Routing/Content/i18n) · R2 (Cross: Legal/Perf/SEO)

---

## 1. Descobertas transformadoras (vs plano original)

| Descoberta | Origem | Plano original | Plano final |
|---|---|---|---|
| **13 collections → 5-6** | R1 §1 | 3 coleções por tipo × locale | 1 collection por tipo, locale via subdiretório |
| **Content structure invertida** | R1 §1 Conflito 1 | `content/{locale}/{type}/` | `content/{type}/{locale}/` (TinaCMS native) |
| **Settings field-based i18n** | R1 §1 Conflito 2 | Directory-based `home.en.json` | Objeto único `{ en:{}, pt:{}, zh:{} }` |
| **Legal content → TinaCMS** | R2 §5.1 | Assumia locale files i18next | TinaCMS (zero bundle impacto) |
| **Routing: `prefix(":locale")`** | R1 §1 Conflito 3 | `flatMap` explícito | `prefix(":locale", [...])` nativo RR7 |
| **SWA 301 + client detection** | R1 §1 Conflito 4 | Só redirect | SWA 301 para crawlers + client-side opcional |
| **Hreflang: P1, não P2** | R2 §4 corrige A5 | P2 no plano A5 | P1 — junto com routing, não postergado |
| **Sitemap no prerender() + xhtml:link** | R2 §2 Conflito 2 | Script separado vs prerender | Dentro do `prerender()` adaptado p/ alternates |
| **Canonical tags obrigatório** | R2 §1 gap A3 | Não previsto | Self-referencing canonical por locale |
| **CSP headers** | R2 §1 gap A5 | Não previsto | Content-Security-Policy no SWA config |
| **Bundle risk: 317KB** | R2 §1 gap A5 + R1 | — | Audit tree-shake tinacms/lucide-react |

---

## 2. Estrutura final de conteúdo

### Diretórios (modo TinaCMS directory-based)

```
content/
  pages/                  ← collection: "page"
    en/terms.mdx
    en/privacy.mdx
    en/risk-disclaimer.mdx
    en/responsible-gaming.mdx
    en/aml.mdx
    en/dispute-resolution.mdx
    en/whitepaper.mdx
    en/proof-of-fairness.mdx
    en/bug-bounty.mdx
    en/game-rules.mdx
    pt/termos.mdx
    pt/privacidade.mdx
    pt/...                 ← mesmos arquivos, locale PT
    zh/...                 ← mesmos arquivos, locale ZH
  blog/                   ← collection: "blog"
    en/
    pt/
    zh/
  faq/                    ← collection: "faq"
    en/
    pt/
    zh/
  tutorial/               ← collection: "tutorial"
    en/
    pt/
    zh/
  settings/               ← collection: "settings" (field-based i18n)
    home.json              ← { hero: { title: { en, pt, zh } } }
```

### Collections TinaCMS (5-6 total)

| Collection | Path | Format | i18n strategy |
|---|---|---|---|
| `page` | `content/pages` | mdx | Directory-based |
| `blog` | `content/blog` | mdx | Directory-based |
| `faq` | `content/faq` | md | Directory-based |
| `tutorial` | `content/tutorial` | mdx | Directory-based |
| `settings` | `content/settings` | json | Field-based (objeto aninhado) |

### Stack de responsabilidades

| Camada | Biblioteca | Fonte de verdade |
|---|---|---|
| UI text (nav, footer, hero labels) | react-i18next Selector API | `src/locales/{en,pt,zh}.json` |
| CMS content (blog, faq, legal, tutorial) | gray-matter + fs | `content/{type}/{locale}/` files |
| Settings (hero texto, features, SEO defaults) | fs + JSON parse | `content/settings/home.json` (field-based) |
| SEO meta | Cascade: settings → i18next fallback | CMS > i18next |
| Routing locale | React Router `params.locale` | URL path `/:locale/...` |
| Hreflang + sitemap | Helmet + prerender() | Build time |
| Redirect / → /en | SWA 301 | `staticwebapp.config.json` |

---

## 3. Riscos identificados

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | Legal content no bundle JS explode 317KB | CRITICAL | Legal content → TinaCMS, não locale JSON (ver R2 §1 gap 19) |
| R2 | Sitemap sem xhtml:link alternates | HIGH | Implementar dentro de prerender() (ver R2 §2 conflito 2) |
| R3 | Submodule sem conteúdo legal pronto | HIGH | CI falha se content vazio; validar build |
| R4 | Self-exclusion sem UI funcional | HIGH | Fora do escopo landing page → escalar app team |
| R5 | Cookie Policy sem cookie table | MEDIUM | Escrever conteúdo antes do deploy (LGPD/GDPR) |
| R6 | CSP ausente para multi-script | MEDIUM | Adicionar ao staticwebapp.config.json |
| R7 | Build time 3× maior | MEDIUM | Estimar; `concurrency: 4` no prerender |
| R8 | Locale redirect tracking duplicado no GTM | MEDIUM | Ignorar primeiro page_view se redirect |
| R9 | Hreflang tags quebradas sem reciprocidade | LOW | Teste automático de reciprocidade |
| R10 | Font Geist sem fallback zh-CN | LOW | Adicionar font CJK ou system-ui fallback |
| R11 | 404 sem locale detection | LOW | Rota `*` com locale-aware 404 |

---

## 4. Fases detalhadas (7 fases, 42+ tasks)

### Fase 0 — Setup inicial (4 tasks)

Antes de qualquer conteúdo. Bloqueante para Fase 0.5.

| # | Task | Origem | Detalhe |
|---|---|---|---|
| 0.1 | CI: `submodules: true` no checkout | A5 §4.1 | `actions/checkout@v4` com `submodules: recursive` |
| 0.2 | CI: pnpm store + turbo cache | A5 §4.2-4.3 | `actions/cache@v4` com restore-keys |
| 0.3 | SWA redirect `/` → `/en/` + navigationFallback | A1 §3 + A1:426-436 | 301 redirect, excluir rotas localizadas |
| 0.4 | Cache-Control + CSP headers | A5 §3 + R2 §5.1 | `no-cache` index.html, `immutable` assets, CSP |

### Fase 0.5 — Legal Pipeline Setup (NOVA — 2 tasks)

Antes do routing porque define arquitetura de conteúdo.

| # | Task | Origem | Detalhe |
|---|---|---|---|
| 0.5 | Decidir dono do conteúdo legal | R2 §1 gap 21 | Compliance officer / legal counsel |
| 0.6 | Structural decision: legal → TinaCMS (confirmado) | R2 §5.1 + R1 §1 | **Não** locale files; TinaCMS directory-based |

### Fase 1 — i18n Stack (7 tasks) ✅ COMPLETE

| # | Task | Detalhe | Referência | Status |
|---|---|---|---|---|
| 1.1 | `pnpm add react-i18next i18next` | Landing page | A3 §1 | ✅ |
| 1.2 | `src/i18n/config.ts` | default en-US, fallback en-US, resources | A3 §2 | ✅ |
| 1.3 | `src/locales/{en,pt,zh}.json` | UI strings (nav, footer, hero, faq, seo, features, roadmap, newsletter) | A3 §2 (R2 corrigido) | ✅ |
| 1.4 | Migrar Header, Footer, Hero, Features, Roadmap, Newsletter, FaqPage, BlogIndex, BlogPost, HomePage, Seo → `t()` | Selector API | A3 §1.2 | ✅ |
| 1.5 | `<html lang>` dinâmico | Helmet `htmlAttributes` em root.tsx | A3 §5 | ✅ |
| 1.6 | Locale switcher no Header | Dropdown EN/PT/中文, `changeLanguage` + navigate path rewrite | A3 §6 | ✅ |
| 1.7 | Footer: legal links de `#` → `/${lang}/terms`, `/${lang}/privacy` etc. | Rotas apontando para Fase 2 | A4 P0 | ✅ |

### Fase 2 — TinaCMS Restructure + Routing (7 tasks)

| # | Task | Detalhe | Referência |
|---|---|---|---|
| 2.1 | `tina/config.ts`: 5-6 collections | page, blog, faq, tutorial, settings | A2 §5 (não 13!) | ✅ |
| 2.2 | Mover `content/faq/*.md` → `content/faq/pt/*.md` | Manter slug original, add `locale: pt` | A2 §2 | ✅ |
| 2.3 | Mover `content/blog/*.md` → `content/blog/pt/*.md` | Idem | A2 §2 | ✅ |
| 2.4 | Migrar `settings/home.json` → field-based i18n | `{ hero: { title: { en, pt, zh } } }` | A2 §5 | ✅ |
| 2.5 | `lib/content.ts` — loaders com locale param | `loadFAQItems("pt")` → `content/faq/pt/` | A1 §5 + A2 §5 | ✅ |
| 2.6 | `app/routes.ts` — `prefix(":locale", [...])` | Rotas: `/:locale/faq`, `/:locale/blog` etc. | A1 §2.2 | ✅ |
| 2.7 | `react-router.config.ts` — prerender dinâmico | `LOCALES.flatMap(locale => [...])`, slugs | A1 §1 | ✅ |

### Fase 3 — Legal + Trust Content (9 tasks)

| # | Task | Locale priority | Referência |
|---|---|---|---|
| 3.1 | Terms of Service | EN → PT → ZH | A4 §1.1 |
| 3.2 | Privacy Policy (+ LGPD/GDPR) | EN → PT → ZH | A4 §1.2 |
| 3.3 | Risk Disclaimer | EN → PT → ZH | A4 §1.3 |
| 3.4 | Responsible Gaming Policy | EN → PT → ZH | A4 §1.4 |
| 3.5 | AML Policy | EN → PT → ZH | A4 §1.5 |
| 3.6 | Dispute Resolution | EN → PT → ZH | A4 §1.6 |
| 3.7 | Create `src/pages/PageView.tsx` | Loader slug+locale, render MDX | Plano original 0.8 |
| 3.8 | Proof of Fairness page | EN → PT → ZH | A4 §4 |
| 3.9 | Bug Bounty Program page | EN → PT → ZH | A4 §3 |

### Fase 4 — Whitepaper (5 tasks)

| # | Task | Detalhe |
|---|---|---|
| 4.1 | Compilar whitepaper | PRD.md + PRODUCT.md + SPEC.md + COMPLIANCE.md + ADRs |
| 4.2 | Traduzir EN → PT → ZH | Mesmo conteúdo, locale directory |
| 4.3 | `WhitepaperPage.tsx` | Layout TOC lateral, seções navegáveis |
| 4.4 | `scripts/generate-whitepaper-pdf.ts` | Gera PDF do markdown |
| 4.5 | Rota `/:lang/whitepaper` + `/whitepaper.pdf` | Download link |

### Fase 5 — Content Migration + Tutoriais (6 tasks)

| # | Task | Detalhe |
|---|---|---|
| 5.1 | Traduzir FAQ existente (4 itens) | PT → EN → ZH |
| 5.2 | Traduzir Blog existente (2 posts) | PT → EN → ZH |
| 5.3 | Settings: hero/features traduzidos | `home.json` field-based |
| 5.4 | TutorialsIndex.tsx + TutorialPost.tsx | Lista por order, render MDX |
| 5.5 | Pesquisar + escrever "Criar carteira WAX" | PT original, passo a passo |
| 5.6 | Traduzir tutorial EN + ZH | |

### Fase 6 — Deploy Polish + SEO (7 tasks)

| # | Task | Detalhe | Referência |
|---|---|---|---|
| 6.1 | Hreflang tags no Helmet | `<link rel="alternate" hreflang="en|pt|zh">` + x-default | A3 §3 |
| 6.2 | Self-referencing canonical tags | Cada URL canoniza a si mesma | R2 §1 gap 1 |
| 6.3 | Sitemap multilingue | Gerado dentro de `prerender()` com xhtml:link | R2 §2 conflito 2 resolvido |
| 6.4 | `og:locale` dinâmico | `pt_BR`, `en_US`, `zh_CN` | R2 §1 gap 2 |
| 6.5 | Structured data JSON-LD | FAQPage, Organization, WebSite, BreadcrumbList | R2 §1 gap 8 |
| 6.6 | 404 páginas por locale | Rota `*` com locale-aware error page | R2 §1 gap 4 |
| 6.7 | JS bundle audit: tree-shake | Verificar tinacms/lucide-react em deps | A5 §5.1 |

---

## 5. Sumário de mudanças vs plano original

| Item | Plano original | Plano final (consolidado) |
|---|---|---|
| Fases | 6 | **7** (nova Fase 0.5 — Legal Pipeline) |
| Tasks | 38 | **42+** (tasks adicionadas: 0.5, 0.6, R2 gaps: canonical, CSP, 404, bundle audit) |
| TinaCMS collections | 13 (3 por tipo × locale + 3 settings) | **5-6** (directory-based, 1 por tipo) |
| Settings i18n | Directory-based (`home.en.json`) | Field-based (`{ en:{} }` no mesmo JSON) |
| Legal content | locale JSON i18next | **TinaCMS** directory-based (bundle-safe) |
| Content dir structure | `content/{locale}/{type}/` | `content/{type}/{locale}/` |
| Routing | `flatMap` explícito | `prefix(":locale", [...])` nativo |
| Redirect | SWA 301 só | SWA 301 + client-side detection opcional |
| Hreflang priority | P2 (Fase 5) | **P1** (Fase 1-2, junto com routing) |
| Canonical tags | Não previsto | Obrigatório (Fase 6) |
| CSP headers | Não previsto | Obrigatório (Fase 0) |
| Bundle audit | Não previsto | Obrigatório (Fase 6) |
| Sitemap | Script separado | Dentro do `prerender()` + xhtml:link |
| Riscos trackeados | 0 | **11 riscos** com severidade e mitigação |

---

## 6. Dependências entre fases

```
Fase 0 (CI, SWA, Cache)
  │
  ├──► Fase 0.5 (Legal pipeline decision) — define TinaCMS estrutura
  │         │
  │         ▼
  ├──► Fase 1 (i18n) — locale files, UI strings
  │         │
  │         ▼
  ├──► Fase 2 (TinaCMS + Routing) — collections, loaders, rotas, prerender
  │         │
  │         ├──► Fase 3 (Legal + Trust) — 9 páginas
  │         ├──► Fase 4 (Whitepaper)
  │         ├──► Fase 5 (Content + Tutoriais)
  │         │
  │         └──► Fase 6 (SEO + Polish)
  │                   │
  │                   ▼
               Deploy (já funciona, só melhora)
```

---

## 7. Processo de implementação (por task)

1. **RED:** Escrever teste que falha (vitest)
2. **GREEN:** Código mínimo para passar
3. **REFACTOR:** Clean + SonarQube (0 BLOCKER/CRITICAL/MAJOR)
4. **VERIFY:** `pnpm --filter @cryptobingo/landing-page test` + `npx tsc --noEmit`
5. **COMMIT:** Conventional commit PT-BR, `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## 8. Como este documento é mantido

- Fonte de verdade para execução
- Cada fase completa → marcar `✅` aqui e criar ADR se mudança estrutural
- Conflitos não resolvidos → escalar para este documento (não criar decisão avulsa)
- Próxima atualização: após Fase 0.5 (confirmar legal pipeline)
