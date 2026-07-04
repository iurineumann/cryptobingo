# A3 — i18n + SEO Research (Jul 2026)

**Persona: Internationalization Specialist**
**Project: CryptoBingo Landing Page (React Router v7 SSG)**
**Date: 2026-07-04**

---

## 1. react-i18next v5 / i18next v26 — estado atual

### Versões no ecossistema CryptoBingo

Frontend (`apps/frontend/package.json`) já usa:
- `i18next`: ^26.3.1
- `react-i18next`: ^17.0.8

Estas são as versões correntes para o ecossistema Jul 2026.

### Selector API (TypeScript-first)

Introduzida no i18next v25.4 (PR #2322) com `enableSelector: true` na config. A partir de i18next v26.0.10 / react-i18next v17.0.7, o selector funciona **out-of-the-box** sem flag, e o primeiro segmento do selector resolve contra a lista de namespaces do hook:

```tsx
// Antes (string key — sem autocomplete em recursos grandes)
t('hero.title')

// Depois (selector function — autocomplete por nível)
t($ => $.hero.title)

// Namespace prefix no selector
t($ => $.ns1.key)        // busca em ns1
t($ => $.ns2.deep.key)   // busca em ns2
```

**Importante:** `t('key')` (string) continua isolado ao **primary namespace** sob `nsMode: 'default'`. Apenas selector function resolve contra secondary namespaces. Para fallback em string keys, usar `nsMode: 'fallback'`.

### TypeScript augmentation

O frontend já tem `react-i18next.d.ts` declarando `returnNull: false`. Para Selector API com type safety completa, o resource type precisa ser declarado:

```ts
// react-i18next.d.ts
import 'i18next';
import en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
    returnNull: false;
  }
}
```

### Conclusão

Selector API é estável e recomendada. Landing page pode adotar o mesmo pattern do frontend, compartilhando inclusive os mesmos locale files (se houver overlap de chaves) ou criando um conjunto próprio.

---

## 2. Estrutura de locale files para landing page

### Locales necessários

Os mesmos 3 do frontend:
- `en-US` (default / fallback)
- `pt-BR`
- `zh-CN`

Códigos ISO 639-1 + região seguem RFC 5646 (BCP 47). Google recomenda `en`/`pt`/`zh` para hreflang (sem região), mas as tags de idioma internas do i18next podem usar `en-US`, `pt-BR`, `zh-CN` para resolução mais granular.

### Organização das chaves

Landing page tem conteúdo **estático + CMS-driven**. Chaves se dividem em:

```json
{
  "nav": {
    "ideas": "Ideias",
    "testnet": "Testnet",
    "github": "GitHub",
    "telegram": "Telegram",
    "twitter": "X/Twitter"
  },
  "hero": {
    "badge": "BINGO GameFi on WAX",
    "title": "Provably Fair BINGO on the Blockchain",
    "subtitle": "CryptoBingo brings the classic game of BINGO to Web3...",
    "cta": "Play Now",
    "learn": "Learn More"
  },
  "features": {
    "section_title": "Built for Trust, Designed for Fun",
    "section_tag": "Why CryptoBingo",
    "provably_fair_title": "Provably Fair",
    "provably_fair_desc": "Every draw is verified on-chain...",
    "wax_title": "Built on WAX",
    "wax_desc": "Lightning-fast transactions, zero gas fees...",
    "prizes_title": "Real Prizes",
    "prizes_desc": "Win crypto tokens and NFT rewards..."
  },
  "footer": {
    "product": "Product",
    "community": "Community",
    "legal": "Legal",
    "copyright": "© 2026 CryptoBingo. All rights reserved."
  },
  "faq": {
    "title": "Perguntas Frequentes",
    "q1": "...",
    ...
  },
  "seo": {
    "home_title": "Bingo On-Chain na WAX",
    "home_desc": "Jogue Bingo descentralizado na blockchain WAX...",
    "faq_title": "FAQ — CryptoBingo",
    "faq_desc": "..."
  }
}
```

### Lazy loading

Para SSG com React Router v7 (ssr: false + pre-render), as translations podem ser **importadas estaticamente** no módulo i18n (como o frontend faz), já que o bundle é gerado em build time. Não há necessidade de `i18next-http-backend` ou lazy loading — todo o conteúdo é pré-renderizado.

Alternativa: usar `i18next-resources-to-backend` se quiser separar locale files por rota.

### Recomendação

Adotar o pattern do frontend: `import en from './locales/en.json'` com importação estática. Landing page tem volume de chaves pequeno (~100-200), sem necessidade de code splitting de translations.

---

## 3. Hreflang implementation

### Método: HTML tags no `<head>`

Para SSG (páginas estáticas pré-renderizadas), o método mais confiável é **injetar `<link rel="alternate" hreflang="">` tags no HTML de cada página durante o build**.

React Router v7 + Helmet permite fazer isso via componente de layout:

```tsx
// app/root.tsx
function HreflangTags() {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/(en|pt|zh)/, '') || '/';
  const baseUrl = 'https://www.cryptobingo.bet';

  const locales = [
    { code: 'en', hreflang: 'en' },
    { code: 'pt', hreflang: 'pt' },
    { code: 'zh', hreflang: 'zh' },
  ];

  return (
    <Helmet>
      {locales.map(locale => (
        <link
          key={locale.hreflang}
          rel="alternate"
          hrefLang={locale.hreflang}
          href={`${baseUrl}/${locale.code}${currentPath}`}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`${baseUrl}/en${currentPath}`}
      />
    </Helmet>
  );
}
```

### Regras de ouro (Google 2026)

| Regra | Descrição |
|-------|-----------|
| Self-reference | Cada página inclui a si mesma no set hreflang |
| Reciprocidade | Se página A linka B, B deve linkar A |
| Absoluto | URLs absolutas, nunca relativas |
| x-default | Obrigatório em **todas** as páginas |
| Um método só | HTML tags **OU** sitemap, nunca ambos |
| Códigos BCP 47 | `en`, `pt`, `zh` (não `en-uk` ou `zh-Hans`) |

### x-default

Aponta para a versão EN (default locale). Google usa quando:
- Usuário não tem preferência de idioma detectável
- Nenhum locale corresponde ao Accept-Language do usuário

Pattern recomendado para CryptoBingo: `x-default → /en/<path>` (Apple/Airbnb pattern: global English como fallback universal).

### Importante para SSG

Como as páginas são **HTML estáticos pré-renderizados**, as hreflang tags precisam ser geradas em **build time**, via Helmet. React Router v7 com `ssr: false` ainda faz server-render da root route em build time — Helmet funciona durante esse processo, e as tags são incluídas no HTML final.

---

## 4. Sitemap multilingue

### Formato com xhtml:link

O sitemap XML deve incluir annotations `xhtml:link` para cada alternate locale:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.cryptobingo.bet/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.cryptobingo.bet/en/" />
    <xhtml:link rel="alternate" hreflang="pt" href="https://www.cryptobingo.bet/pt/" />
    <xhtml:link rel="alternate" hreflang="zh" href="https://www.cryptobingo.bet/zh/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.cryptobingo.bet/en/" />
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.cryptobingo.bet/pt/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.cryptobingo.bet/en/" />
    <xhtml:link rel="alternate" hreflang="pt" href="https://www.cryptobingo.bet/pt/" />
    <xhtml:link rel="alternate" hreflang="zh" href="https://www.cryptobingo.bet/zh/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.cryptobingo.bet/en/" />
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  ...
</urlset>
```

### Geração programática

Criar script `scripts/generate-sitemap.mjs` que:

1. Lista todas as páginas estáticas (`/`, `/faq`, `/blog`, etc.)
2. Para cada página, gera uma entrada por locale + x-default
3. Inclui blog slugs dinâmicos (já existe `getBlogSlugs()` em `react-router.config.ts`)
4. Escreve `build/client/sitemap.xml` após o build

### Alternativa: Google Search Console

Se as hreflang tags HTML estiverem corretas em todas as páginas, o sitemap com xhtml:link é **redundante mas recomendado** como fallback para crawlers que não executam JS.

---

## 5. `<html lang>` + locale detection

### `<html lang>` dinâmico

Em `app/root.tsx`, o atributo `lang` deve vir do locale ativo:

```tsx
export default function Root() {
  const { i18n } = useTranslation();
  const locale = i18n.language; // 'en-US', 'pt-BR', 'zh-CN'

  return (
    <HelmetProvider>
      <html lang={localeToHtmlLang(locale)}>
        ...
      </html>
    </HelmetProvider>
  );
}

function localeToHtmlLang(locale: string): string {
  return locale.split('-')[0]; // 'en-US' → 'en'
}
```

### Locale detection em SSG

Como React Router v7 com `ssr: false` gera HTML estático, não há server-side locale detection. Estratégias:

| Estratégia | Prós | Contras |
|------------|------|---------|
| **URL subdirectory** (`/en/`, `/pt/`, `/zh/`) | Melhor para SEO, crawler vê locale direto | Requer redirect ou prefixo default |
| **Accept-Language no client** | Experiência personalizada | Só funciona após hidratação JS, não para crawlers |
| **LocalStorage + cookie** | Persistência | Não funciona no primeiro acesso sem JS |

**Recomendação:** Subdirectory URL + client-side redirect no primeiro acesso:

1. Crawler vê `/en/`, `/pt/`, `/zh/` como URLs distintas → hreflang funciona
2. No primeiro acesso a `/`, detectar Accept-Language e redirect para melhor locale
3. Salvar preferência em cookie/localStorage para próximos acessos

### Implementação do locale-aware router

Em `react-router.config.ts`, gerar rotas para cada locale:

```ts
const locales = ['en', 'pt', 'zh'];

export default {
  ssr: false,
  prerender: locales.flatMap(locale => [
    `/${locale}`,
    `/${locale}/faq`,
    `/${locale}/blog`,
    ...getBlogSlugs().map(s => `/${locale}/blog/${s}`),
  ]),
} satisfies Config;
```

Em `app/routes.ts`, criar rotas prefixadas:

```ts
import type { RouteConfig } from '@react-router/dev/routes';

const locales = ['en', 'pt', 'zh'];

const localizedRoutes = locales.flatMap(locale => [
  { path: `/${locale}`, file: '../src/pages/HomePage.tsx', id: `home-${locale}` },
  { path: `/${locale}/faq`, file: '../src/pages/FaqPage.tsx', id: `faq-${locale}` },
  { path: `/${locale}/blog`, file: '../src/pages/BlogIndex.tsx', id: `blog-index-${locale}` },
  { path: `/${locale}/blog/:slug`, file: '../src/pages/BlogPost.tsx', id: `blog-post-${locale}` },
]);

export default [
  ...localizedRoutes,
  { path: '/ideas', file: '../src/pages/IdeasPage.tsx', id: 'ideas' },
  { path: '/admin', file: '../src/pages/AdminPage.tsx', id: 'admin' },
  { path: '/ref/:code', file: '../src/pages/ReferralRedirect.tsx', id: 'referral-redirect' },
  // Redirect root to detected locale
  { path: '/', file: '../src/pages/LocaleRedirect.tsx', id: 'locale-redirect' },
] satisfies RouteConfig;
```

---

## 6. Recomendações finais para CryptoBingo

### Stack

| Componente | Biblioteca | Versão |
|------------|-----------|--------|
| Core i18n | i18next | ^26.3.1 (já no monorepo) |
| React binding | react-i18next | ^17.0.8 (já no monorepo) |
| Head management | react-helmet-async | ^3.0.0 (já instalado) |
| Locale detection | i18next-browser-languagedetector | opcional |

### Plano de implementação (ordem sugerida)

1. **Criar locale files:** `apps/landing-page/src/locales/{en,pt,zh}.json` com todas as chaves da landing page
2. **Configurar i18n:** `apps/landing-page/src/i18n.ts` — importação estática, `lng: 'en-US'`, `fallbackLng: 'en-US'`
3. **Criar componente LocaleRedirect:** detecta Accept-Language, redireciona / → /{locale}/
4. **Refatorar app/root.tsx:** `<html lang>` dinâmico, hreflang tags, import i18n
5. **Refatorar app/routes.ts:** rotas prefixadas por locale (/en/, /pt/, /zh/)
6. **Refatorar react-router.config.ts:** prerender por locale
7. **Substituir strings hardcoded:** Header, Hero, Features, Footer, FaqPage — usar `useTranslation` com Selector API
8. **Criar Seo multilingue:** título/descrição por locale, og:locale dinâmico
9. **Criar LocaleSwitcher:** componente no Header para trocar idioma
10. **Gerar sitemap multilingue:** script de build com xhtml:link alternates
11. **Atualizar robots.txt:** referenciar sitemap.xml

### Testes

- Cada locale gera HTML estático separado
- Testar hreflang com [Google Search Console hreflang report](https://search.google.com/search-console)
- Validar sitemap com ferramenta de validação XML
- Testar locale switcher + persistência (cookie/localStorage)

### Azure Static Web Apps

Configurar em `staticwebapp.config.json` para servir locale prefixado corretamente. Como a SPA Mode gera `index.html` por rota, cada `/{locale}/` terá seu próprio `index.html` pré-renderizado. O `navigationFallback` deve excluir as rotas localizadas:

```json
{
  "navigationFallback": {
    "rewrite": "/en/index.html",
    "exclude": ["/api/*", "/assets/*", "/en/*", "/pt/*", "/zh/*"]
  }
}
```

---

## 7. Referências

- [i18next Selector API (PR #2322)](https://github.com/i18next/i18next/pull/2322)
- [i18next TypeScript docs](https://www.i18next.com/overview/typescript)
- [react-i18next useTranslation hook](https://react.i18next.com/latest/usetranslation-hook)
- [Google hreflang documentation](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google hreflang report in Search Console](https://support.google.com/webmasters/answer/9370250)
- [IETF BCP 47 language tags (RFC 5646)](https://www.rfc-editor.org/rfc/rfc5646)
- [React Router v7 SPA Mode](https://reactrouter.com/7.6.1/how-to/spa)
- [Hreflang tags guide for SPAs (tanstackship.com)](https://tanstackship.com/blog/hreflang-tags-ultimate-guide)
- [lingui-react-router (locale-aware React Router i18n)](https://github.com/mdvorak/lingui-react-router)
- [React Internationalization Guide 2026 (DEV)](https://dev.to/feidou/react-internationalization-complete-guide-2026-from-zero-to-production-ready-multilingual-apps-4pen)
- [International SEO 2026 (Search Engine Land)](https://searchengineland.com/international-seo-in-2026-what-still-works-what-no-longer-does-and-why-467712)
- [Hreflang for 20+ markets (Crawlix)](https://crawlix.app/blog/hreflang-multi-region/)
- [i18n SEO Complete Guide (better-i18n.com)](https://better-i18n.com/en/blog/i18n-seo-hreflang-locale-urls-guide/)
- [International SEO and hreflang Guide 2026 (SEOcopus)](https://seoctopus.io/en/blog/international-seo-and-hreflang-guide-2026)
