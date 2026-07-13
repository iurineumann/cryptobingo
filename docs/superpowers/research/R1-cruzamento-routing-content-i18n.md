# R1 — Cross-Reference: SSG + TinaCMS + i18n (Jul 2026)

**Persona: Integration Architect**

**Fontes:**
- A1 — SSG + Routing (`docs/superpowers/research/A1-ssg-routing.md`)
- A2 — TinaCMS + Content (`docs/superpowers/research/A2-tinacms-content.md`)
- A3 — i18n + SEO (`docs/superpowers/research/A3-i18n-seo.md`)

---

## 1. Conflitos identificados

### Conflito 1: 13 collections vs 5-6 collections — impacto no routing e prerender

**A2 (linhas 108-137)** demonstra que 13 coleções (3 por tipo × locale) não é necessário — TinaCMS recomenda collection única por tipo com subdiretório de locale. **A1 (linhas 462-476)** porém assume `content/{locale}/` como primeiro nível — `content/en/blog/`, `content/pt/blog/` etc. **A1 e A2 divergem no layout de diretórios:**

| | A1 (SSG) | A2 (TinaCMS) |
|---|---|---|
| Estrutura | `content/{locale}/{type}/` | `content/{type}/{locale}/` |
| Exemplo | `content/en/blog/hello.mdx` | `content/blog/en/hello.mdx` |
| Prerender | `flatMap locale → flatMap type` | `flatMap type → flatMap locale` |

**Impacto:** A1 propõe `contentDir(locale)` que resolve para `content/{locale}/` (A1:442-448). A2 propõe `content/{type}/{locale}/` (A2:358-384). São estruturas mutualmente exclusivas — o loader `loadFAQItems(locale)` precisa saber a ordem: `content/faq/{locale}/` (A2) vs `content/{locale}/faq/` (A1).

**Recomendação:** Adotar A2 (`content/{type}/{locale}/`). Razões:
- É o padrão TinaCMS directory-based (A2:25-52)
- TinaCMS schema mapeia `path: 'content/faq'` e locale vira subdiretório natural — `relativePath` = `en/what-is-cryptobingo.md`
- A collection continua unitária — Tina admin mostra árvore `faq > en > ...`, `faq > pt > ...`
- A1 estrutura é válida para SSG puro, mas quebra com TinaCMS visual editing (path mapping não é `en/faq/...`)

**Mudança no plano Fase 2:**
- `tina/config.ts` usa `path: 'content/{type}'` (já proposto em A2:264-353)
- `lib/content.ts` — `loadFAQItems(locale)` resolve `content/faq/{locale}` (não `content/{locale}/faq`)
- `react-router.config.ts` — prerender continua `flatMap locale`, routing continua `prefix(":locale", [...])` — não muda
- **Nenhuma mudança no routing.** Só mudança na estrutura de diretórios do content repo e nos loaders.

### Conflito 2: Settings — field-based i18n vs directory-based

**A1 (linhas 462-476)** assume `content/en/settings/home.json`, `content/pt/settings/home.json` — um arquivo por locale, em diretório separado.

**A2 (linhas 314-353)** recomenda field-based i18n: um único `content/settings/home.json` com objeto aninhado `{ en: {...}, pt: {...}, zh: {...} }`.

**A3 (linhas 76-122)** não menciona settings — foca em locale files `locales/{en,pt,zh}.json` para i18next.

**Recomendação:** Adotar A2 (field-based para settings). Razões:
- Settings são strings curtas (hero title, subtitle, CTA) — A2:82-90 mostra que field-based é ideal para isso
- TinaCMS editor vê todos os locales lado a lado no mesmo formulário (A2:83)
- `lib/content.ts` precisa de um helper `loadSetting(key, locale)` que acessa `settings[key][locale]`
- i18next locale files (A3) continuam para conteúdo estático da UI (nav, footer, seções fixas)

**Mudança no plano Fase 2:**
- Settings migram de `content/{locale}/settings/home.json` → `content/settings/home.json` com field-based i18n
- `lib/settings.ts` ou similar: `getField(obj, locale)` — resolve `obj[locale] ?? obj.en`
- UI locale files (i18next) permanecem separados em `src/locales/{en,pt,zh}.json`

### Conflito 3: Routing pattern — `prefix(":locale", [...])` vs `flatMap` com paths explícitos

**A1 (linhas 106-127)** propõe `prefix(":locale", [...])` com `id` único em cada rota — padrão limpo do React Router v7.

**A3 (linhas 310-329)** propõe `locales.flatMap(locale => [{ path: `/${locale}/faq`, ... }])` — gera paths explícitos sem usar `prefix()`.

Ambos geram o mesmo resultado. **Não há conflito técnico**, mas diferença de manutenção:

| Aspecto | `prefix(":locale", [...])` (A1) | `flatMap` explícito (A3) |
|---|---|---|
| Adicionar rota | Adiciona 1 entrada no prefix | Adiciona 1 entrada × 3 locales |
| Legibilidade | Mais limpo | Mais verboso |
| `params.locale` | Automático via `useParams()` | Automático via `useParams()` |
| Rotas não-traduzidas (/ideas, /admin) | Fora do prefix | Fora do flatMap |

**Recomendação:** Usar **A1** (`prefix(":locale", [...])`). Razões:
- É o padrão nativo do React Router v7 para prefixo de URL
- `flatMap` manual é boilerplate desnecessário (A3 linha 315 tem 3× o mesmo arquivo para cada locale)
- Ambos geram `/:locale/faq` — idêntico em runtime
- A1 já inclui `id` único para evitar conflito de tipos (linha 129)

**Mudança no plano Fase 2:** Nenhuma. Routing segue A1.

### Conflito 4: Redirect / → /{locale} — SWA 301 vs client-side detection

**A1 (linhas 229-231)** recomenda Opção A: SWA 301 redirect `/` → `/en`. Locale detection client-side opcional após hidratação.

**A3 (linhas 286-288)** sugere subdirectory URL + client-side redirect com Accept-Language no primeiro acesso.

**Não é conflito — são complementares:**
- SWA 301 (A1) cobre crawlers e primeira visita sem JS — `/` → `/en/`
- Client-side detection (A3) roda após hidratação — detecta `navigator.language`, redireciona para `/pt/` ou `/zh/` se preferência detectada
- A1 linha 231 cita: "Google recomenda evitar auto-redirect baseado em idioma" — serve default locale, deixa usuário trocar

**Recomendação:**
1. SWA 301 `/` → `/en/` (A1 Opção A, linha 170-185) — **obrigatório** para crawlers e fallback
2. No cliente, opcionalmente detectar `navigator.language` e redirecionar para `/pt/` ou `/zh/` — sem flash (loader silencioso)
3. LocaleSwitcher no header permite troca manual — cobre casos onde detecção erra

**Mudança no plano Fase 0-1:** SWA redirect + componente LocaleRedirect opcional.

### Conflito 5: Content rendering — gray-matter SSG vs TinaMarkdown vs i18next

Cada agente recomenda renderização diferente:

| Camada | A1 | A2 | A3 |
|---|---|---|---|
| CMS content (blog MDX, FAQ MD) | `loadSettings(locale)` via gray-matter | gray-matter SSG + TinaMarkdown opcional (A2:197) | — |
| Static UI text (nav, hero, footer) | `src/locales/{locale}.json` (A1:494) | — | i18next Selector API (A3:20-33) |
| SEO meta (title, desc, og) | `Seo` component com locale (A1:340) | — | `useTranslation` + Helmet (A3:144-174, 254-271) |
| Settings CMS (hero title, CTA) | `content/{locale}/settings/` | field-based i18n (A2:94-103) | — |

**Não há conflito — são camadas diferentes.** O que importa é que as interfaces não se sobreponham:

- **i18next** controla UI text estática (nav, footer, FAQ title, seções fixas)
- **gray-matter/fs** controla CMS content (blog body, FAQ answer)
- **Settings field-based** controla hero, features, SEO defaults

**Problema potencial:** SEO meta pode vir de 2 fontes — i18next (A3:116-121, chaves `seo.home_title`) vs CMS settings (field-based, `settings.seo.title.en`). Se ambos existirem, qual prevalece?

**Recomendação:**
- CMS settings é a **fonte de verdade** para SEO meta de páginas CMS-driven (home, FAQ pages). Editores alteram via Tina.
- i18next locale files contêm **fallback only** — usado quando settings field não está preenchido
- `lib/settings.ts` implementa `seoTitle(locale)`: `settings?.seo?.title?.[locale] ?? i18n.t('seo.home_title')`

**Mudança no plano Fase 2-4:** Implementar `lib/settings.ts` com cascade fallback.

---

## 2. Pontos de alinhamento (sem conflito)

### 2.1 Locale files i18next

A1 (linha 494) e A3 (linhas 76-122, 347) concordam: `src/locales/{locale}.json` para UI text estática, importação estática, Selector API. Adotar mesmo pattern do frontend existente.

### 2.2 Hreflang + `og:locale`

A1 (linha 340) menciona `og:locale` dinâmico e canonical com locale. A3 (linhas 138-198) detalha implementação com Helmet, hreflang tags, x-default. **Completamente alinhados.** Seguir A3 implementação.

### 2.3 Sitemap multilingue

Só A3 aborda (linhas 203-245). A1 não menciona — sem conflito. A3 recomenda script `scripts/generate-sitemap.mjs` com xhtml:link alternates. Seguir A3.

### 2.4 gray-matter para SSG

A1 (linhas 278-294) e A2 (linhas 187-197) concordam: gray-matter + fs para build time SSG é suficiente. TinaMarkdown (visual editing) é opcional futuro. **Alinhados.**

### 2.5 Estrutura de diretórios para content loading

A1 (`lib/content.ts` linha 440-458) e A2 (linhas 387-401) propõem loaders que aceitam `locale` param. A1 resolve para `content/{locale}/type/`, A2 para `content/type/{locale}/` — o conflito já tratado acima. Fora isso, padrão de loader é idêntico.

### 2.6 Prerender com `flatMap` locale

A1 (linhas 347-382) e A3 (linhas 294-305) usam mesmo pattern: `LOCALES.flatMap(locale => ...)`. A1 é mais completo (inclui `concurrency`, `getStaticPaths`). **Alinhados** — seguir A1.

### 2.7 LocaleSwitcher

A1 (linha 231) e A3 (linha 355) mencionam seletor de idioma no header. Sem conflito.

### 2.8 `app/root.tsx` com `<html lang>` dinâmico

A1 (linha 339) e A3 (linhas 254-271) concordam. Seguir A3 implementação com `useTranslation` + `localeToHtmlLang`.

---

## 3. Estrutura final recomendada

### Diagrama de fluxo

```
URL: /pt/faq
        │
        ▼
react-router.config.ts
  prerender: [..., "/pt/faq", ...]
  │
  ├──► app/routes.ts
  │     prefix(":locale", [
  │       route("faq", "FaqPage.tsx")
  │     ])
  │     params.locale = "pt"
  │
  ├──► FaqPage.tsx (route module)
  │     │
  │     ├── 1. useTranslation() → i18n.language = "pt"
  │     │     chaves: faq.title, nav.*, footer.*
  │     │     fonte: src/locales/pt.json (i18next)
  │     │
  │     ├── 2. loadFAQItems("pt") → fs.readdir(content/faq/pt/)
  │     │     fonte: content/faq/pt/*.md (CMS, directory-based)
  │     │
  │     ├── 3. loadSettings("pt") → settings.home.json
  │     │     hero.title.pt → field-based i18n
  │     │     fonte: content/settings/home.json (CMS, field-based)
  │     │
  │     └── 4. SEO
  │           <html lang="pt">
  │           hreflang: en/pt/zh + x-default
  │           canonical: /pt/faq
  │           og:locale: pt_BR
  │
  └──► staticwebapp.config.json
        Redirect "/" → "/en/" (301)
        navigationFallback → "/en/index.html"
```

### Mapa de responsabilidades

| O quê | Biblioteca | Onde | Fonte de verdade |
|---|---|---|---|
| UI text (nav, footer) | i18next + Selector API | `src/locales/{locale}.json` | Devs (PRs) |
| CMS content (blog, faq) | gray-matter + fs | `content/{type}/{locale}/` | Editores (TinaCloud) |
| Settings (hero, features) | fs + JSON parse | `content/settings/home.json` | Editores (TinaCloud) |
| SEO meta | i18next + settings cascade | ambas, cascade | CMS > i18next fallback |
| Routing locale | React Router `params.locale` | `routes.ts` + loaders | URL |
| Hreflang + sitemap | Helmet + build script | `root.tsx` + `scripts/generate-sitemap.mjs` | Build time |

---

## 4. Recomendações consolidadas para o plano

### Fase 0 — Setup (redirect, infra)

| Tarefa | Origem | Detalhe |
|---|---|---|
| SWA redirect `/` → `/en/` | A1 Opção A | `staticwebapp.config.json`, 301 |
| navigationFallback `/en/index.html` | A1:426-436 | Excluir `/en/*`, `/pt/*`, `/zh/*` |
| LocaleRedirect opcional | A3:286-288 | Componente leve, client-side, sem flash |

### Fase 1 — Routing + prerender

| Tarefa | Origem | Detalhe |
|---|---|---|
| `prefix(":locale", [...])` em routes.ts | A1:386-409 | IDs únicos, locale obrigatório |
| `locales.flatMap` em prerender | A1:358-382 | `concurrency: 4`, slugs por locale |
| `lib/locale.ts` — `assertLocale()` | A1:298-308 | Helper de validação |
| LocaleContext + LocaleProvider | A1:480-490 | Contexto para componentes |

### Fase 2 — Content + i18n

| Tarefa | Origem | Detalhe | Mudança vs plano original |
|---|---|---|---|
| Estrutura `content/{type}/{locale}/` | A2:358-384 | Directory-based TinaCMS | **Muda** — era `content/{locale}/type/` |
| 5-6 collections TinaCMS | A2:122-131 | page/blog/faq/tutorial/settings | **Muda** — era 13 coleções |
| `lib/content.ts` com locale param | A2:387-401 | `loadFAQItems("pt")` | Nenhuma (já previsto) |
| `lib/settings.ts` field-based | A2:314-353 | `getField(obj, locale)` | **Muda** — era directory-based |
| i18next + Selector API | A3:20-55 | `src/locales/{locale}.json` | Nenhuma |
| Cascade SEO: CMS → i18next fallback | R1 §1 Conflito 5 | `lib/settings.ts` | **Nova** — não previsto em plano original |

### Fase 3 — SEO

| Tarefa | Origem | Detalhe |
|---|---|---|
| Hreflang tags + x-default | A3:140-198 | Helmet, build time |
| `og:locale` dinâmico | A1:340 | Por locale |
| Sitemap multilingue | A3:203-245 | Script build + xhtml:link |
| `<html lang>` dinâmico | A3:254-271 | `localeToHtmlLang` |

### Fase 4-5 — Content features

| Tarefa | Origem | Detalhe |
|---|---|---|
| TinaMarkdown (opcional) | A2:141-165 | Visual editing pós-lançamento |
| LocaleSwitcher | A1:231, A3:355 | Header, persiste cookie |
| Tradução slug (se necessário) | A1:151-163 | Pathnames traduzidos |

### Resumo de mudanças no plano original

1. **Estrutura de diretórios:** `content/{type}/{locale}/` em vez de `content/{locale}/{type}/` — afeta `lib/content.ts` e tina/config.ts
2. **Collections:** 5-6 em vez de 13 — simplifica schema TinaCMS dramaticamente
3. **Settings:** field-based i18n em vez de directory-based — afeta `lib/settings.ts` e estrutura de dados
4. **Cascade SEO:** nova camada de fallback CMS→i18next — afeta componentes SEO
5. **Routing:** `prefix(":locale", [...])` (A1) em vez de `flatMap` explícito (A3) — consistente com A1, mais limpo
6. **Redirect:** SWA 301 (A1) + client-side detection opcional (A3) — ambos, não conflito
