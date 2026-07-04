# A1 — SSG + Routing Research (Jul 2026)
**Persona: Systems Architect**

## Versões e dependências atuais no projeto

| Pacote | Versão | Papel |
|---|---|---|
| `react-router` / `react-router-dom` | ^7.18.1 | Framework routing + SSG |
| `@react-router/dev` | ^7 | Build toolchain (Vite plugin) |
| `@react-router/node` | ^7 | Runtime (necessário p/ build mesmo com `ssr:false`) |
| `vite` | ^8.0.16 | Bundler |
| `react` / `react-dom` | ^19.2.7 | UI |
| `react-helmet-async` | ^3.0.0 | Head management (SEO meta) |

**Config atual:**
- `ssr: false` — SPA Mode com prerender
- `prerender: ["/", "/faq", "/ideas", "/admin", "/blog", ...blogSlugs]`
- Rotas em `app/routes.ts` — flat, SEM prefixo de locale
- `<html lang="pt-BR">` hardcoded em `app/root.tsx`
- `og:locale` hardcoded como `pt_BR` em `src/components/Seo.tsx`
- Deploy: Azure Static Web Apps (Consumption)
- Redirect `/api/*` → anonymous; fallback: `/index.html`

---

## 1. React Router v7 prerender() dinâmico

### API estável (desde v7.12+)

`react-router.config.ts` aceita `prerender` como:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,

  // Array estático
  prerender: ["/", "/about"],

  // OU: função assíncrona (recomendado para caminhos dinâmicos)
  async prerender({ getStaticPaths }) {
    const staticPaths = getStaticPaths(); // paths sem segments dinâmicos
    const posts = await getBlogSlugs();
    return [
      ...staticPaths,
      ...posts.map(s => `/blog/${s}`),
    ];
  },

  // OU: objeto com concorrência
  prerender: {
    paths: ["/", ...slugs.map(s => `/blog/${s}`)],
    concurrency: 4,
    // retryCount e retryDelay disponíveis (mintlify docs)
  },
} satisfies Config;
```

### `getStaticPaths()` helper

Retorna automaticamente todos os caminhos estáticos definidos em `routes.ts` (sem segments dinâmicos). Evita duplicação manual.

### Concorrência

`concurrency: 4` acelera build para muitos paths. Disponível via `prerender.paths + prerender.concurrency`. Em versões anteriores (`v7.9-7.12`) chamava-se `unstable_concurrency`.

### Restrições com `ssr: false`

- `actions`/`headers` **proibidos** em todas as rotas (sem runtime server)
- `loader` só funciona em paths incluídos no `prerender`
- Se loader está em rota pai com filhos, TODOS os filhos precisam estar no prerender (senão `loaderData` indeterminado) — ou usar `clientLoader` nos filhos

### SPA Fallback

Com `ssr: false` + `prerender`, se houver path não-prerenderizado, RR gera SPA fallback (`__spa-fallback.html`). Se `/` estiver no prerender, fallback vai para `index.html`.

---

## 2. Rotas /:lang prefix — padrões

### Padrão 1: Optional locale prefix (Paraglide JS)

```ts
// app/routes.ts
import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  // Optional locale — matches /, /en, /pt, /zh
  ...prefix(":locale?", [
    index("../src/pages/HomePage.tsx"),
    route("faq", "../src/pages/FaqPage.tsx"),
    route("blog", "../src/pages/BlogIndex.tsx"),
    route("blog/:slug", "../src/pages/BlogPost.tsx"),
    route("ideas", "../src/pages/IdeasPage.tsx"),
    route("admin", "../src/pages/AdminPage.tsx"),
    route("ref/:code", "../src/pages/ReferralRedirect.tsx"),
  ]),
] satisfies RouteConfig;
```

**Problema:** `:locale?` é opcional. React Router match: `/blog` (sem locale) e `/en/blog` (com locale). Ambos renderizam o mesmo componente, mas `useParams()` retorna `{ locale: undefined }` vs `{ locale: 'en' }`.

### Padrão 2: Required locale prefix (mais limpo para SSG)

```ts
// app/routes.ts
import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

const locales = ['en', 'pt', 'zh'];

export default [
  // Sem prefixo: redirect (tratado via SWA config)
  index("../src/pages/HomePage.tsx", { id: "home-root" }),

  // Com prefixo obrigatório :locale
  ...prefix(":locale", [
    index("../src/pages/HomePage.tsx", { id: "home-locale" }),
    route("faq", "../src/pages/FaqPage.tsx", { id: "faq-locale" }),
    route("blog", "../src/pages/BlogIndex.tsx", { id: "blog-index-locale" }),
    route("blog/:slug", "../src/pages/BlogPost.tsx", { id: "blog-post-locale" }),
    route("ideas", "../src/pages/IdeasPage.tsx", { id: "ideas-locale" }),
    route("admin", "../src/pages/AdminPage.tsx", { id: "admin-locale" }),
    route("ref/:code", "../src/pages/ReferralRedirect.tsx", { id: "ref-locale" }),
  ]),
] satisfies RouteConfig;
```

**Nota:** múltiplas entradas com mesmo `file` precisam de `id` único (senão conflito de types).

### Padrão 3: Layout route para locale context

```ts
// app/routes.ts
import { type RouteConfig, layout, index, route } from "@react-router/dev/routes";

export default [
  layout("../src/locale-layout.tsx", [
    index("../src/pages/HomePage.tsx"),
    route("faq", "../src/pages/FaqPage.tsx"),
    route("blog", "../src/pages/BlogIndex.tsx"),
    route("blog/:slug", "../src/pages/BlogPost.tsx"),
    route("ideas", "../src/pages/IdeasPage.tsx"),
    route("admin", "../src/pages/AdminPage.tsx"),
  ]),
] satisfies RouteConfig;
```

Com layout em `app/locale-layout.tsx` que extrai `:locale` e fornece contexto. Problema: layout não adiciona segmento na URL — precisaria de prefix.

### Pathnames traduzidos

Se diferentes idiomas usarem slugs diferentes (ex: `/en/blog` → `/pt/blog` mas também `/en/pricing` → `/pt/precos`):

```ts
// Múltiplas entradas via i18n-routes.ts
export default [
  route("en/pricing", "../src/pages/PricingPage.tsx", { id: "pricing-en" }),
  route("pt/precos", "../src/pages/PricingPage.tsx", { id: "pricing-pt" }),
  route("zh/pricing", "../src/pages/PricingPage.tsx", { id: "pricing-zh" }),
];
```

Simplificação: usar `/:locale/blog/:slug` sempre — slug é o mesmo, varia só o locale.

---

## 3. Redirect / → /en em SSG

### Opção A: staticwebapp.config.json (recomendado)

```json
{
  "routes": [
    {
      "route": "/",
      "redirect": "/en/",
      "statusCode": 301
    }
  ],
  "navigationFallback": {
    "rewrite": "/en/index.html",
    "exclude": ["/api/*", "/assets/*"]
  }
}
```

**Vantagens:** sem JavaScript, sem flash, SEO-friendly (Google entende 301).
**Limitação:** SWA não suporta redirect baseado em `Accept-Language` header nativamente. Para locale detection + redirect, precisa de Azure Function.

### Opção B: Azure Function como navigationFallback (regex redirects — Jun 2026)

```csharp
// staticwebapp.config.json
{
  "navigationFallback": {
    "rewrite": "/api/redirect"
  }
}
```

Azure Function lê `x-ms-original-url` header, aplica regex redirects (JSON config), retorna 301. Padrão documentado em Jun 2026 para SWA + redirects complexos.

Aplicação para locale: function checa `Accept-Language`, redireciona para `/${locale}/`.

**Problema:** cold start (Consumption Plan) adiciona latência.

### Opção C: Client-side redirect (SPA)

No componente da rota `/` (root):

```tsx
// app/root.tsx — efeito colateral
useEffect(() => {
  const locale = detectLocale(); // navigator.language → en|pt|zh
  if (window.location.pathname === '/') {
    window.history.replaceState(null, '', `/${locale}`);
    // ou navigate(`/${locale}`, { replace: true });
  }
}, []);
```

**Problema:** flash de conteúdo (renderiza default locale, depois redirect). Contornável com loader flash oculto até locale ser determinado.

### Opção D: clientLoader com hydrate

React Router v7 + SPA Mode: `clientLoader` com `hydrate: true` na root route, executando antes da hidratação. Mas depende de `HydrateFallback` — mais complexo.

### Recomendação CryptoBingo

Usar **Opção A** (SWA 301 redirect / → /en). Simples. Zero latência. Para locale detection, fazer client-side após hidratação (dentro do app). Google recomenda evitar auto-redirect baseado em idioma detectado — serve conteúdo no locale padrão e deixa usuário trocar. SWA redirect `/` → `/en` + seletor de idioma no header é a abordagem mais correta para SEO.

---

## 4. Loaders com locale param

### Com `ssr: false` + prerender

Loaders rodam em build time para cada path no prerender. O `params.locale` está disponível:

```ts
// HomePage.tsx (route module)
export async function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale || 'en';
  const settings = loadSettings(locale); // loadSettings('en') vs loadSettings('pt')
  return { settings, locale };
}

export default function HomePage({ loaderData }: Route.ComponentProps) {
  const { settings, locale } = loaderData;
  return <Seo locale={locale} ... />;
}
```

**Importante:** loader só executa durante prerender. Navegação client-side entre paths pré-renderizados usa os `.data` files gerados no build. Navegação para path NÃO pré-renderizado cai no SPA fallback — loader NÃO roda.

### clientLoader como alternativa

Para paths que não estão no prerender (ou para fallback):

```ts
export async function loader({ params }: Route.LoaderArgs) {
  // Roda no build (prerender)
  return loadSettings(params.locale || 'en');
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  // Roda no browser (client-side navigation)
  return loadSettings(params.locale || 'en');
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <div>Loading...</div>;
}
```

### Abordagem mais simples: useParams no componente

Como `ssr: false` e dados vêm de arquivos locais (não API), dá para ler locale direto do `useParams`:

```tsx
export default function HomePage() {
  const { locale } = useParams();
  const lang = locale || 'en'; // fallback
  const settings = loadSettings(lang);

  return (
    <Seo locale={lang} ... />
  );
}
```

Mas `loadSettings` executa client-side nesse caso — OK se for síncrono e leve. Para dados pesados, preferir `loader`.

### Validação de locale

```ts
const VALID_LOCALES = ['en', 'pt', 'zh'] as const;
type Locale = typeof VALID_LOCALES[number];

function assertLocale(locale?: string): Locale {
  if (locale && VALID_LOCALES.includes(locale as Locale)) {
    return locale as Locale;
  }
  return 'en'; // fallback
}
```

Usar em cada loader/componente. Pode virar helper em `lib/locale.ts`.

---

## 5. Recomendações específicas para CryptoBingo

### Arquitetura proposta

```
/:locale?/:path
├── / → 301 redirect → /en (via SWA config)
├── /en/ → HomePage (inglês)
├── /pt/ → HomePage (português)
├── /zh/ → HomePage (chinês)
├── /en/faq → FaqPage (inglês)
├── /pt/faq → FaqPage (português)
├── /en/blog → BlogIndex
├── /pt/blog → BlogIndex
├── /en/blog/:slug → BlogPost
├── /pt/blog/:slug → BlogPost
└── ...
```

### Mudanças necessárias

| Arquivo | O que muda |
|---|---|
| `app/routes.ts` | Adicionar `prefix(":locale", [...])` com todas as rotas |
| `react-router.config.ts` | `prerender()` gera paths para todas as combinações locale+slug |
| `app/root.tsx` | `<html lang={locale}>` dinâmico (via loaderData ou contexto) |
| `src/components/Seo.tsx` | `og:locale` dinâmico, canonical com locale |
| `staticwebapp.config.json` | Redirect `/` → `/en/`, ajustar navigationFallback |
| `lib/content.ts` | Aceitar parâmetro `locale` para ler de `content/{locale}/...` |
| Páginas | Extrair `params.locale`, passar para content loaders |
| Componentes i18n | Adicionar locale context + traduções pt/en/zh |

### react-router.config.ts (novo prerender)

```ts
import type { Config } from "@react-router/dev/config";

const LOCALES = ['en', 'pt', 'zh'];
const STATIC_ROUTES = ['', '/faq', '/blog', '/ideas', '/admin'];

function getBlogSlugs(): string[] {
  // ... existing code
}

export default {
  ssr: false,
  async prerender() {
    const slugs = getBlogSlugs();

    return [
      // Root (sem locale — SPA fallback)
      '/',

      // Todas as combinações locale + rota
      ...LOCALES.flatMap(locale =>
        STATIC_ROUTES.flatMap(route => {
          const path = route === '' ? '' : route;
          return [`/${locale}${path}`];
        })
      ),

      // Blog posts em cada locale
      ...LOCALES.flatMap(locale =>
        slugs.map(slug => `/${locale}/blog/${slug}`)
      ),
    ];
  },
} satisfies Config;
```

### app/routes.ts (novo)

```ts
import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

// Rotas sem locale (root — redirect tratado via SWA)
const rootRoutes = [
  index("../src/pages/HomePage.tsx", { id: "home-root" }),
];

// Rotas com locale prefix
const localeRoutes = [
  index("../src/pages/HomePage.tsx", { id: "home-locale" }),
  route("faq", "../src/pages/FaqPage.tsx", { id: "faq-locale" }),
  route("blog", "../src/pages/BlogIndex.tsx", { id: "blog-index-locale" }),
  route("blog/:slug", "../src/pages/BlogPost.tsx", { id: "blog-post-locale" }),
  route("ideas", "../src/pages/IdeasPage.tsx", { id: "ideas-locale" }),
  route("admin", "../src/pages/AdminPage.tsx", { id: "admin-locale" }),
  route("ref/:code", "../src/pages/ReferralRedirect.tsx", { id: "ref-locale" }),
];

export default [
  ...rootRoutes,
  ...prefix(":locale", localeRoutes),
] satisfies RouteConfig;
```

### staticwebapp.config.json (ajustado)

```json
{
  "routes": [
    {
      "route": "/",
      "redirect": "/en/",
      "statusCode": 301
    },
    {
      "route": "/api/*",
      "allowedRoles": ["anonymous"]
    }
  ],
  "navigationFallback": {
    "rewrite": "/en/index.html",
    "exclude": ["/api/*", "/assets/*"]
  },
  "responseOverrides": {
    "404": {
      "rewrite": "/en/index.html"
    }
  }
}
```

### Content loading com locale

```ts
// lib/content.ts
function contentDir(locale?: string): string {
  const base = path.resolve(process.cwd(), 'content');
  if (locale && ['en', 'pt', 'zh'].includes(locale)) {
    return path.join(base, locale);
  }
  return path.join(base, 'en'); // default
}

export function loadFAQItems(locale?: string): FAQItem[] {
  const faqDir = path.join(contentDir(locale), 'faq');
  // ... rest same
}

export function loadBlogPosts(locale?: string): BlogPost[] {
  const blogDir = path.join(contentDir(locale), 'blog');
  // ... rest same
}
```

Estrutura de diretórios:
```
content/
  en/
    blog/
    faq/
    settings/
  pt/
    blog/
    faq/
    settings/
  zh/
    blog/
    faq/
    settings/
```

### Locale Context para componentes

```tsx
// src/lib/locale-context.tsx
import { createContext, useContext } from 'react';
import type { Locale } from './locale';

const LocaleContext = createContext<Locale>('en');
export const useLocale = () => useContext(LocaleContext);
export const LocaleProvider = LocaleContext.Provider;
```

Envolver `<Outlet />` em `app/root.tsx` com `LocaleProvider` — valor vindo do `loaderData` da root route.

### i18n das páginas

Cada página usa `useLocale()` para traduzir conteúdo estático e carregar dados localizados. Para textos inline (títulos, CTAs, descrições), criar `src/locales/{locale}.json` com chaves, similar ao já feito no frontend.

---

## 6. Referências

### React Router v7 docs
- [Pre-Rendering (SSG) — reactrouter.com/how-to/pre-rendering](https://reactrouter.com/how-to/pre-rendering)
- [Rendering Strategies — reactrouter.com/start/framework/rendering](https://reactrouter.com/start/framework/rendering)
- [Data Loading — reactrouter.com/start/framework/data-loading](https://reactrouter.com/start/framework/data-loading)
- [SPA Mode — reactrouter.com/how-to/spa](https://reactrouter.com/how-to/spa)
- [Route Module API — reactrouter.com/start/framework/route-module](https://reactrouter.com/start/framework/route-module)
- [Routing — reactrouter.com/start/framework/routing](https://reactrouter.com/start/framework/routing)
- [Middleware — reactrouter.com/how-to/middleware](https://reactrouter.com/how-to/middleware)
- [react-router.config.ts reference — v7.16.0](https://reactrouter.com/7.16.0/api/framework-conventions/react-router.config.ts)
- [Prerender advanced config (mintlify)](https://remix-run-react-router.mintlify.app/guides/pre-rendering)

### CSS / examples
- [Implementing basic i18n in React Router v7 (discussion #14681)](https://github.com/remix-run/react-router/discussions/14681)
- [SSG, React Router v7, refactor (blog)](https://drewbs.dev/blog/ssg-react-router-v7-refactor/)
- [i18n routing with i18next and React Router v7](https://stn-dts.github.io/2025/09/05/i18n-rr7.html)

### i18n libraries
- [Paraglide JS + React Router v7](https://paraglidejs.com/react-router) — URL strategy, type-safe, prefix pattern
- [Intlayer + React Router v7](https://intlayer.org/doc/environment/vite-and-react/react-router-v7) — i18n com locale-aware routing

### Azure Static Web Apps
- [Configure SWA — Microsoft Learn](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration)
- [The staticwebapp.config.json (Apr 2026)](https://gabrielmongeon.ca/en/2026/04/azure-swa-blazor-configuration/)
- [Regex based redirects for SWA (Jun 2026)](https://www.damirscorner.com/blog/posts/20260612-RegexBasedRedirectsForStaticWebApps.html)
- [SWA multi-language issues (#721)](https://github.com/Azure/static-web-apps/issues/721)
- [Angular i18n on SWA (Stack Overflow)](https://stackoverflow.com/questions/77115644/how-to-properly-deploy-an-angular-i18n-app-on-azure-static-web-application)
- [SWA redirect by language (issue #282)](https://github.com/Azure/static-web-apps/issues/282)
- [Dynamic redirects with Functions](https://johnnyreilly.com/azure-static-web-apps-dynamic-redirects-azure-functions)
