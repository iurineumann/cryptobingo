# A5 — Build + Performance Research (Jul 2026)
**Persona: DevOps Engineer**

## 1. Dependências atuais e versões no projeto

```json
// apps/landing-page/package.json (versões principais)
- tailwindcss: ^4.3.1
- @tailwindcss/vite: ^4.3.1
- vite: ^8.0.16
- react-router: ^7.18.1
- @react-router/dev: ^7
- @react-router/node: ^7
- @fontsource-variable/geist: ^5.2.9
- typescript: ^6.0.3
- @vitejs/plugin-react: ^6.0.2
```

**Infra estrutural:**
- `react-router.config.ts`: `ssr: false` + `prerender` array (SSG puro)
- `vite.config.ts`: `@tailwindcss/vite` + `@react-router/dev/vite` + `build.target: 'es2022'`
- `turbo.json`: `tasks.build.dependsOn: ["^build"]`, `outputs: ["dist/**"]`
- `deploy-landing.yml`: Azure SWA v1, skip_app_build: true, sem submodules

**Build output atual:**
```
dist/  → 500K total
  assets/ → 432K
    index-*.js       → 317KB (JS bundle)
    index-*.css      → 28KB
    geist-*.woff2    → 5 fontes (7K–29K cada)
  index.html         → 24KB (SSG prerendered)
  og-image.png       → 32KB (PNG)
  favicon.svg        → 4K
  robots.txt/sitemap.xml → 4K cada
```

## 2. Tailwind CSS v4 — estado e otimizações

**Já usando v4 (4.3.1) com Oxide Engine.** Config está em CSS via `@theme` em `globals.css` — zero `tailwind.config.js`. Zero PostCSS plugins (Autoprefixer, cssnano eliminados — tudo no Oxide).

**Benefícios já ativos:**
- Full build ~3.5× mais rápido que v3 (Rust)
- Incremental ~100× mais rápido
- Lightning CSS built-in (prefixing + minificação num passo só)
- Content scanning automático (sem `content: []`)
- CSS ~35% menor que v3 (28KB atual → já otimizado)
- Container queries nativas

**Sem ação necessária.** Tailwind v4 já está no estado ideal. O `@theme` em `globals.css` já define design tokens (brand, accent, surface, spacing, font-size fluid via `clamp()`). Dark mode via `@custom-variant dark`.

**Único ponto de atenção:** `@fontsource-variable/geist` importado com `@import` no CSS — correto, mas verificar tree-shaking (Geist Variable tem ~5 subsets, todos aparecem no dist).

## 3. Azure Static Web Apps — configuração ideal

**Brotli compression:** Auto-habilitado pelo Azure SWA para tipos MIME suportados (JS, CSS, HTML, JSON, SVG). Não precisa configurar. Verificado em issues do GitHub — SWA serve Brotli quando `accept-encoding: br` está no request. Se Enterprise-grade CDN estiver ativo, verificar comportamento (há reports de compressão quebrada com enterprise edge).

**staticwebapp.config.json — melhorias recomendadas:**

```json
{
  "routes": [
    {
      "route": "/index.html",
      "headers": {
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    },
    {
      "route": "/assets/*",
      "headers": {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    },
    {
      "route": "/favicon.svg",
      "headers": {
        "Cache-Control": "public, max-age=86400"
      }
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": [
      "/api/*",
      "/assets/*",
      "/favicon.svg",
      "/robots.txt",
      "/sitemap.xml",
      "/og-image.png"
    ]
  }
}
```

**Cache strategy:**
- `index.html` → `no-cache, no-store, must-revalidate` (sempre fresh — SPA/SSG entry point)
- `assets/*` → `public, max-age=31536000, immutable` (hash no filename = cache forever)
- `og-image.png`, `favicon.svg` → cache curto (sem hash, muda manualmente)

## 4. CI/CD — GitHub Actions com submodules

**Problemas no deploy-landing.yml atual:**

### 4.1 Submodules não checkout
Conteúdo TinaCMS vem de submódulo `cryptobingo-tina`. `actions/checkout@v4` sem `submodules: true` = build usa conteúdo vazio/antigo.

**Fix:**
```yaml
- uses: actions/checkout@v4
  with:
    submodules: true
    fetch-depth: 1
```

### 4.2 Falta cache pnpm store
`actions/setup-node@v4` com `cache: 'pnpm'` funciona mas não suporta `restore-keys`. Para evitar cold cache when lockfile muda:

```yaml
- name: Get pnpm store path
  id: pnpm-cache
  run: |
    echo "store-path=$(pnpm store path --silent)" >> $GITHUB_OUTPUT

- name: Cache pnpm store
  uses: actions/cache@v4
  with:
    path: ${{ steps.pnpm-cache.outputs.store-path }}
    key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      pnpm-store-${{ runner.os }}-
```

### 4.3 Falta Turbo remote cache
Se tiver Vercel Remote Cache configurado:
```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

Senão, cache local via actions/cache:
```yaml
- name: Cache Turbo
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ hashFiles('turbo.json', 'pnpm-lock.yaml') }}
    restore-keys: |
      turbo-${{ runner.os }}-
```

### 4.4 Falta close_pull_request_job
Para preview environments com PR:
```yaml
close_pull_request_job:
  if: github.event_name == 'pull_request' && github.event.action == 'closed'
  runs-on: ubuntu-latest
  steps:
    - uses: Azure/static-web-apps-deploy@v1
      with:
        azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING }}
        action: close
```

### 4.5 Workflow completo (recomendado)
```yaml
name: Deploy Landing Page

on:
  push:
    branches: [develop, master]
    paths:
      - 'apps/landing-page/**'
      - '.github/workflows/deploy-landing.yml'
  pull_request:
    branches: [master]
    paths:
      - 'apps/landing-page/**'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  VITE_API_URL: 'https://landing-api.cryptobingo.bet/api'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 1

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Get pnpm store path
        id: pnpm-cache
        run: echo "store-path=$(pnpm store path --silent)" >> $GITHUB_OUTPUT

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.store-path }}
          key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-store-${{ runner.os }}-

      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('turbo.json', 'pnpm-lock.yaml') }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - run: pnpm install --frozen-lockfile

      - run: pnpm --filter @cryptobingo/landing-page build

      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING }}
          action: upload
          app_location: apps/landing-page
          output_location: dist
          skip_app_build: true

  close-preview:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING }}
          action: close
```

## 5. Core Web Vitals — checklist para SSG

**Estado atual do site (SSG puro, 500KB dist):**

| Métrica | Target | Projeção | Risco |
|---------|--------|----------|-------|
| LCP | < 2.5s | ~1.2s | Baixo — sem hero images, CSS 28KB, font preloaded |
| INP | < 200ms | ~50ms | Baixo — JS bundle 317KB, mas é SSR/hydration |
| CLS | < 0.1 | ~0.02 | Baixo — sem imagens dinâmicas, font-display: swap |
| TTFB | < 800ms | ~30ms | Muito baixo — CDN edge, SSG puro |
| FCP | < 1.8s | ~0.6s | Baixo — font Geist preloaded via @fontsource |

**Pontos de melhoria:**

### 5.1 JS Bundle (317KB)
É o maior peso. `react-router`, `react-helmet-async`, `lucide-react`, `tinacms` (build-time apenas? verificar tree-shaking).

**Verificar:**
- `tinacms`/`@tinacms/cli` estão em `dependencies` (não devDependencies) — podem estar no bundle client-side
- `lucide-react` importação seletiva vs barrel import
- Code splitting automático do React Router v7 (cada rota gera chunk separado?)

### 5.2 Imagens
- `og-image.png` (32KB PNG) → converter para WebP/AVIF via `vite-imagetools` ou `vite-plugin-image-optimizer`
- Hero não usa imagens (só CSS gradients) — bom
- Nenhuma outra imagem no site

### 5.3 Font loading
Geist Variable já carregada via @fontsource (auto-preaload via link tags no build). Verificar:
- `font-display: swap` ativo? (default do @fontsource)
- Subset latim suficiente? 5 subsets carregados (ext, cyrillic, vietnamese) desnecessários

### 5.4 Sitemap
Atual: estático com 2 URLs. React Router v7 permite gerar dinamicamente no `prerender()`:

```ts
// react-router.config.ts
export default {
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths = ["/", "/faq", "/ideas", "/admin", "/blog"];
    // blog slugs dinâmicos
    const slugs = fs.readdirSync("content/blog")
      .filter(f => f.endsWith(".md"))
      .map(f => `/blog/${f.replace(/\.md$/, "")}`);
    const all = [...paths, ...slugs];
    // Gerar sitemap
    writeFileSync("public/sitemap.xml", generateSitemap(all));
    return all;
  }
}
```

### 5.5 Hreflang
Site é multi-idioma (pt/en/zh via TinaCMS + API). Adicionar tags `hreflang` no `<head>`:
```html
<link rel="alternate" hreflang="pt" href="https://www.cryptobingo.bet/pt" />
<link rel="alternate" hreflang="en" href="https://www.cryptobingo.bet/en" />
<link rel="alternate" hreflang="zh" href="https://www.cryptobingo.bet/zh" />
<link rel="alternate" hreflang="x-default" href="https://www.cryptobingo.bet" />
```

### 5.6 Third-party scripts (peso no Lighthouse)
- GTM (carrega GA4 + Clarity)
- CookieConsent CDN
- Cloudflare Insights

**Recomendação:** Usar `loading="lazy"` e `fetchpriority="low"` on non-critical third-party scripts. GTM já carrega async (padrão). CookieConsent tem `defer`. Está ok.

## 6. Recomendações finais para CryptoBingo

**Prioridade (P0 → imediato, P1 → curto prazo, P2 → médio):**

### P0 — Crítico (corrigir agora)
1. **Submodules no checkout** — `deploy-landing.yml` precisa de `submodules: true`
2. **Cache pnpm store** — substituir `cache: 'pnpm'` por `actions/cache@v4` explícito

### P1 — Performance direta
3. **Cache-Control headers** — `index.html` com `no-cache`, `assets/*` com `immutable`
4. **Sitemap dinâmico** — gerar no `prerender()` com blog slugs
5. **JS Bundle audit** — verificar tree-shaking de `tinacms`/`lucide-react`

### P2 — Otimização
6. **og-image.png → WebP/AVIF** — reduzir de 32KB para ~10KB
7. **Font subset trimming** — remover subsets não usados (cyrillic, vietnamese)
8. **Hreflang tags** — adicionar alternates multilingue no `<head>`
9. **PR preview environments** — adicionar `close_pull_request_job` no workflow

### Não necessário
- Tailwind v4 já ótimo (não migrar)
- Image optimization build-time (sem imagens no site além do og-image)
- ISR/SSR (SSG puro já atende — TTFB ~30ms)
- Brotli (auto Azure SWA)

## 7. Referências

- [Tailwind CSS v4 — Oxide Engine deep dive](https://www.youngju.dev/blog/culture/2026-05-14-tailwind-css-4-vite-first-engine-config-as-css-migration-deep-dive-2026.en)
- [Azure SWA build configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration?tabs=github-actions)
- [Azure SWA submodules support](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration#submodules)
- [SWA Brotli compression FAQ](https://learn.microsoft.com/en-us/azure/static-web-apps/faq#how-do-i-enable-gzip-or-brotli-compression-)
- [SWA cache-control for index.html](https://edi.wang/post/2026/5/5/avoiding-stale-angular-builds-with-azure-static-web-apps)
- [pnpm CI cache best practices](https://daksh.be/blog/2026/05/03/why-my-github-actions-cache-was-always-cold/)
- [Turborepo 2.x remote cache](https://pristren.com/blog/turborepo-monorepo-guide/)
- [React Router v7 SSG + sitemap generation](https://remix-run-react-router.mintlify.app/guides/pre-rendering)
- [Core Web Vitals — static vs SSR](https://webvitals.tools/blog/static-vs-ssr-performance/)
- [Lighthouse 100 on Next.js 2026](https://www.designkey.studio/post/lighthouse-100-on-nextjs)
- [vite-imagetools](https://www.npmjs.com/package/vite-imagetools)
- [vite-image-react — perceptual image optimization](https://github.com/ezitounioussama/vite-image-react)
