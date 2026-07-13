# Fase 2 — TinaCMS Restructure + Routing

**Goal:** Migrar estrutura de conteúdo landing page para suportar i18n directory-based (TinaCMS) + routing com locale prefix.

**Architecture:** 5 collections (page, blog, faq, tutorial, settings) com directory-based i18n, `prefix(":locale")` routing, locale-aware loaders.

**Stack:** React Router v7 SSG, TinaCMS, gray-matter, react-i18next

---
### Task 2.1: content/faq/*.md → content/faq/pt/*.md

**Files:**
- Move: `content/faq/` → `content/faq/pt/` (submodule)

**Steps:**
- [ ] `mkdir -p content/faq/pt`
- [ ] `git mv content/faq/*.md content/faq/pt/` (dentro do submodule)

### Task 2.2: content/blog/*.md → content/blog/pt/*.md

**Files:**
- Move: `content/blog/` → `content/blog/pt/` (submodule)

**Steps:**
- [ ] `mkdir -p content/blog/pt`
- [ ] `git mv content/blog/*.md content/blog/pt/`

### Task 2.3: settings/home.json → field-based i18n

**Files:**
- Modify: `content/settings/home.json`

**Changes:**
- Wrap strings em objetos locale: `{ en, pt, zh }`

### Task 2.4: tina/config.ts — 5 collections + i18n

**Files:**
- Modify: `tina/config.ts`

**Changes:**
- Add `tutorial` collection
- Add locales to settings fields (object wrapper per locale)
- Keep existing collections with locale subdirectory paths

### Task 2.5: lib/content.ts — loaders com locale param

**Files:**
- Modify: `lib/content.ts`

**Changes:**
- `loadFAQItems(locale?)` → lê de `content/faq/{locale}/`
- `loadBlogPosts(locale?)` → lê de `content/blog/{locale}/`
- `loadBlogPost(slug, locale?)` → lê de `content/blog/{locale}/`
- `loadSettings(locale?)` → extrai locale do field-based JSON

### Task 2.6: app/routes.ts — prefix(":locale", [...])

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/root.tsx`
- Modify: `src/pages/FaqPage.tsx`
- Modify: `src/pages/BlogIndex.tsx`
- Modify: `src/pages/BlogPost.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `staticwebapp.config.json`

**Changes:**
- Routes wrap em `prefix(":locale", [...])`
- Loaders pass locale param
- StaticWebApp redirect `/` → `/en/`

### Task 2.7: react-router.config.ts — prerender dinâmico

**Files:**
- Modify: `react-router.config.ts`

**Changes:**
- `prerender()` function percorre locales + slugs
- Hreflang alternates + sitemap
