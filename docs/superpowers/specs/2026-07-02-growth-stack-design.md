# CryptoBingo Growth Stack — Design Document

**Data:** 2026-07-02
**Status:** Final
**ADRs relacionados:** ADR-024 (Rankings + Conteúdo), ADR-025 (Tradução), ADR-029 (shadcn/ui), ADR-035 (CD testnet), ADR-037 (Conteúdo Unificado), ADR-038 (Prize Pipeline)

## 1. Visão Geral

Preparar CryptoBingo para SEO, gamificação, comunidade, analytics e growth. 5 tracks paralelas convergentes.

**Stack principal:**
- React 19 + Vite + React Router v7 (já existente)
- `react-helmet-async` — meta tags dinâmicas
- React Router v7 built-in SSG — páginas públicas estáticas
- TinaCMS (git-backed, visual editing) — gerenciamento de conteúdo
- GA4 (via GTM) + Measurement Protocol server proxy — analytics
- Microsoft Clarity — heatmaps + session recording
- Redis + MongoDB — gamificação (streaks, daily rewards, referral)
- Azure Communication Services Email — notificações (já configurado)

**Domínios:**
- `test.cryptobingo.bet` — game app (SWA frontend, destino final)
- `www.cryptobingo.bet` — landing institucional (temporária, até mainnet)

## 2. Track A — SEO Técnico

### 2.1 Meta Tags Dinâmicas

Componente `<Seo>` universal, usado em toda página (SSG + SPA):

```tsx
<Seo
  title="CryptoBingo — Bingo GameFi na WAX"
  description="Bingo on-chain, provably fair na blockchain WAX"
  ogImage="https://cryptobingo.bet/brand/og-image.svg"
  canonical="https://cryptobingo.bet/faq"
  hreflang={['pt_BR', 'en_US', 'zh_CN']}
/>
```

**Meta tags obrigatórias por página:**
- `title` único (50-60 chars)
- `meta description` único (120-158 chars)
- `og:title`, `og:description`, `og:image` (URL absoluta com https), `og:url`, `og:locale`, `og:site_name` ("CryptoBingo"), `og:type`
- `twitter:card` ("summary_large_image"), `twitter:title`, `twitter:description`, `twitter:image`
- `<link rel="canonical" href="...">`
- `<link rel="alternate" hreflang="pt_BR">`, `hreflang="en_US"`, `hreflang="zh_CN"`
- `<html lang="...">` dinâmico (reflete `i18n.language`)

### 2.2 JSON-LD Structured Data

Injetado via `<Seo>` no `<head>`:

**Organization** (todas as páginas):
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "CryptoBingo",
  "url": "https://cryptobingo.bet",
  "logo": "https://cryptobingo.bet/brand/icon.svg",
  "sameAs": [
    "https://t.me/cryptobingo_bet",
    "https://x.com/CryptoBingo_Bet",
    "https://discord.gg/EYYhdRWUnm",
    "https://github.com/iurineumann/cryptobingo"
  ]
}
```

**WebApplication** (home):
```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "CryptoBingo",
  "url": "https://cryptobingo.bet",
  "applicationCategory": "GameApplication",
  "operatingSystem": "Web",
  "browserRequirements": "Requires Web3 wallet"
}
```

**FAQPage** (rota `/faq`): Uma pergunta+resposta por FAQ item (TinaCMS collection).

**Article** (blog posts): Título, descrição, data, autor, imagem.

**BreadcrumbList** (páginas internas): Home → Categoria → Página.

### 2.3 SSG com React Router v7

React Router v7.18+ SSG nativo via `react-router.config.ts`:

```ts
export default {
  ssg: {
    paths: [
      '/',
      '/how-it-works',
      '/sponsors',
      '/tutorials',
      '/faq',
      '/news',
      '/leaderboard',
      '/blog',
    ],
    async paths() {
      const posts = await getAllPostSlugs(); // TinaCMS slugs at build time
      return posts.map(slug => `/blog/${slug}`);
    },
  },
};
```

**Páginas SSG (HTML estático no build):**

| Rota | Conteúdo | Fonte |
|---|---|---|
| `/` | Landing | TinaCMS (hero) + clientLoader (salas ao vivo) |
| `/how-it-works` | Como funciona | TinaCMS |
| `/sponsors` | Sponsors info | TinaCMS |
| `/tutorials` | Tutoriais | TinaCMS |
| `/faq` | FAQ | TinaCMS |
| `/news` | Notícias | TinaCMS |
| `/leaderboard` | Snapshot estático | MongoDB (no build) |
| `/blog` | Blog listing | TinaCMS |
| `/blog/:slug` | Post individual | TinaCMS |

**Dados dinâmicos no SSG:** `loader()` retorna conteúdo estático (TinaCMS). `clientLoader()` executa no cliente e busca dados ao vivo (salas, rankings). Componente mostra skeleton enquanto carrega.

**Páginas SPA (continuam CSR):** `/lobby`, `/room/:roomId/:gameId`, `/replay/:gameId`, `/admin/*`, `/sponsor/rooms`, `/sponsor/vault`, `/sponsor/delegations`, `/profile`, `/wallet`, `/settings`, `/history`

### 2.4 Sitemap + Robots + llms.txt

**`robots.txt`** (em `public/`):
```
User-agent: *
Allow: /
Allow: /how-it-works
Allow: /sponsors
Allow: /tutorials
Allow: /faq
Allow: /news
Allow: /leaderboard
Allow: /blog
Disallow: /lobby
Disallow: /room/
Disallow: /admin/
Disallow: /replay/
Disallow: /profile/
Disallow: /wallet/
Disallow: /settings/
Disallow: /history/

Sitemap: https://cryptobingo.bet/sitemap.xml
```

**`sitemap.xml`** — gerado via script no build. Inclui todas as URLs públicas com `lastmod`, `changefreq`, `priority`, `hreflang` alternates.

**`llms.txt`** (em `public/`):
```
# CryptoBingo — AI Guide
> Bingo on-chain, provably fair na blockchain WAX.

## Docs
- About: https://cryptobingo.bet/how-it-works
- FAQ: https://cryptobingo.bet/faq
- Blog: https://cryptobingo.bet/blog

## Social
- Telegram: https://t.me/cryptobingo_bet
- Discord: https://discord.gg/EYYhdRWUnm
- X: https://x.com/CryptoBingo_Bet
```

### 2.5 `<html lang>` Dinâmico

Atualmente `lang="pt-BR"` fixo. Mudar p/ reagir ao i18n:

```tsx
<html lang={i18n.language === 'en' ? 'en-US' : i18n.language}>
```

## 3. Track B — Social/Comunidade

### 3.1 Plataformas

| Plataforma | Handle | Link |
|---|---|---|
| Telegram | `@cryptobingo_bet` | https://t.me/cryptobingo_bet |
| Discord | CryptoBingo | https://discord.gg/EYYhdRWUnm |
| X/Twitter | `@CryptoBingo_Bet` | https://x.com/CryptoBingo_Bet |
| GitHub | iurineumann/cryptobingo | https://github.com/iurineumann/cryptobingo |

### 3.2 Frontend

**Footer:** Ícones + links para todas as 4 plataformas. Estilo consistente com o design system.

**Nav (PlayerShell + LandingPage):** Link "Comunidade" no menu principal. Submenu com cada plataforma.

**Landing Page:** Seção "Join the Community" com cards de cada plataforma, descrição do que encontrar em cada uma e CTA.

## 4. Track C — Analytics

### 4.1 Google Tag Manager

Snippet GTM-N88CZVJF no `index.html` (HEAD + BODY). GTM gerencia:
- GA4 tag
- Microsoft Clarity tag
- Eventos custom (via dataLayer)

### 4.2 Eventos de Negócio (dataLayer)

Hook `useAnalytics`:

```ts
const analytics = useAnalytics();
analytics.track('buyin', { gameId, ticketId, amount, currency: 'WAX' });
analytics.track('win', { gameId, ticketId, prizeAmount, prizeType });
analytics.track('streak_day', { streakCount, tier });
analytics.track('referral_signup', { referrerId });
analytics.track('referral_buyin', { referrerId, refereeId });
analytics.track('game_start', { gameId, roomId, gameType });
analytics.track('game_end', { gameId, roomId, result });
```

### 4.3 Server-Side Proxy

`POST /api/v1/analytics/event` no api-gateway:

```ts
// Recebe evento do frontend, encaminha ao GA4 Measurement Protocol
// Usa measurement_id + api_secret do env
// Só para eventos críticos: buyin, win, referral_signup, referral_buyin
// Fire-and-forget (sem await no response)
```

Contorna adblock blockers. GA4 Measurement Protocol endpoint: `https://www.google-analytics.com/mp/collect`.

### 4.4 Microsoft Clarity

Script no `index.html`. Projeto ID a configurar no dashboard Clarity.
- Heatmaps (onde clicam, até onde scrollam)
- Session recordings (como usuários navegam)
- Rage clicks / dead clicks / quick backs
- Dashboards de engajamento

## 5. Track D — Gamificação

### 5.1 Streaks (Daily Login)

| Propriedade | Valor |
|---|---|
| Engine | Redis (já existe no projeto) |
| Chave | `streak:{userId}` |
| Contagem | Dias consecutivos com login |
| Reset | 1 dia sem login = streak zerada |
| Tiers | 3 / 7 / 14 / 30 / 60 / 90 dias |
| Recompensa | XP multiplicado por tier (1×, 2×, 3×, 5×, 10×, 20×) |
| Evento GA4 | `streak_day` |
| Frontend | Toast no login + badge no perfil |

### 5.2 Daily Rewards

| Engine | MongoDB (collection `daily_rewards`) |
|---|---|
| Ciclo | 7 dias, reseta semanalmente |

| Dia | Recompensa |
|---|---|
| 1 | 50 XP |
| 2 | 50 XP |
| 3 | 100 XP |
| 4 | 100 XP + badge "Week Warrior" |
| 5 | 150 XP |
| 6 | 150 XP |
| 7 | 250 XP + 1 free ticket |

### 5.3 Referral Program

| Engine | MongoDB (collection `referrals`) |
|---|---|
| Link único | `/ref/:userId` |
| Bônus referrer | 10% XP da 1ª compra do indicado |
| Bônus referee | 1 free ticket no primeiro login |
| Tiers | 5/10/25/50/100 indicações → badges progressivos |
| Evento GA4 | `referral_signup`, `referral_buyin` |

### 5.4 Beta Test Rewards

| Engine | MongoDB (collection `beta_contributors`) |

| Tier | Critério | Recompensa no Launch |
|---|---|---|
| Bronze | Jogou 1+ partidas na testnet | Badge "Pioneer" + 1 free ticket |
| Prata | Reportou 1+ bugs (TG/Discord/GitHub) | Badge "Bug Hunter" + 3 tickets + 500 XP |
| Ouro | Participou ativamente (feedback, testes, comunidade) | Badge "OG Binger" + 10 tickets + NFT comemorativo |
| Diamante | Criou tutoriais, docs, organizou testes | Badge "Founder" + 25 tickets + NFT raro + menção no site |

**Nota:** Repositório privado — não há contribuição externa de código. Diamante é para contribuições não-código (tutoriais, docs, organização).

**Implementação:** Script de airdrop no launch lê a collection e executa distribuição.

## 6. Track E — Blog/Conteúdo (TinaCMS)

### 6.1 Estrutura de Conteúdo

```
/content/
  blog/           # Blog posts
    post-slug.md  # MDX + frontmatter
  pages/
    how-it-works.md
    sponsors.md
    tutorials.md
  faq/
    item-1.md     # Cada FAQ item é um arquivo
    item-2.md
  news/
    noticia-1.md
  authors/
    equipe.md
  sponsors/
    profile-acme.md  # Perfis editoriais de sponsor
  global/
    navigation.md    # Configuração do menu
    seo-defaults.md  # SEO defaults globais
```

### 6.2 Frontmatter Schema (Blog Post)

```yaml
---
title: "Título do Post"
date: 2026-07-02 10:00
updated: 2026-07-02 14:30
author: "Equipe CryptoBingo"
slug: "titulo-do-post"
locale: pt_BR
translations:
  en_US: /blog/post-title
  zh_CN: /blog/post-title-zh
tags: [wax, bingo, gamefi]
published: true
featured_image: /images/blog/post-image.jpg
description: "Resumo curto para SEO e preview"
---
```

### 6.3 TinaCMS Config

```ts
// tina/config.ts
export default defineConfig({
  branch: 'develop',
  clientId: process.env.TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,
  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  schema: {
    collections: [
      {
        name: 'blog',
        label: 'Blog Posts',
        path: 'content/blog',
        fields: [
          { type: 'string', name: 'title', label: 'Title', isTitle: true },
          { type: 'datetime', name: 'date', label: 'Date' },
          { type: 'rich-text', name: 'body', label: 'Body', isBody: true },
          { type: 'string', name: 'author', label: 'Author' },
          { type: 'string', name: 'tags', label: 'Tags', list: true },
          { type: 'boolean', name: 'published', label: 'Published' },
          { type: 'image', name: 'featured_image', label: 'Featured Image' },
          { type: 'string', name: 'description', label: 'Meta Description' },
        ],
      },
      {
        name: 'pages',
        label: 'Pages',
        path: 'content/pages',
        fields: [
          { type: 'string', name: 'title', label: 'Title', isTitle: true },
          { type: 'rich-text', name: 'body', label: 'Body', isBody: true },
        ],
      },
      // faq, news, authors, sponsors collections...
    ],
  },
});
```

### 6.4 Administração

- Rota `/cms` no game app (não conflita com `/admin` do jogo)
- TinaCMS admin UI gerada no build, servida como SPA
- Autenticação via Tina Cloud (GitHub OAuth)
- Acesso restrito a users autorizados

### 6.5 Fluxo de Publicação

```
Editor → /cms → Edita conteúdo → Salva (commit no GitHub)
  → GitHub Actions detecta push → Build SSG → Deploy SWA
  → Conteúdo publicado em produção
```

## 7. CI/CD

O workflow atual (`build-push.yml`) precisa de ajustes mínimos:
- Adicionar step `pnpm tina build` antes do deploy
- Garantir que conteúdo TinaCMS seja baixado no checkout (incluir `content/` no build)
- Deploy do `/admin` (TinaCMS UI) junto com o app

## 8. DNS + Segurança (Cloudflare)

### 8.1 Configurado (pelo usuário)

- ✅ SPF: `v=spf1 include:_spf.mx.cloudflare.net include:spf.protection.outlook.com ~all`
- ✅ DKIM: `cf2024-1._domainkey.cryptobingo.bet`
- ✅ DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@cryptobingo.bet; fo=1`
- ✅ MX: route1/2/3.mx.cloudflare.net (Email Routing)
- ✅ Page Rule: `cryptobingo.bet/*` 301 → `www.cryptobingo.bet/$1`

### 8.2 Pendente

- CAA record: `0 issue "letsencrypt.org"`, `0 issue "comodoca.com"`
- HSTS: enabled, max-age=31536000, includeSubdomains, preload
- Após 2-4 semanas: DMARC `p=none` → `p=quarantine`

## 9. Azure SWA Free Tier Capacity

| Recurso | SWA Free | Nosso uso |
|---|---|---|
| Bandwidth | 100 GB/mês | <5 GB (estimado) |
| Storage | 0.5 GB | <50 MB |
| Custom domains | 2 | `test.cryptobingo.bet` (1/2 usado) |
| Staging | 3 PR previews | Suficiente |
| SSL | Free managed | Já ativo |

Blog em `/blog` (subpath) não requer domínio extra.

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| TinaCMS incompatível c/ RRv7 SSG | Bloqueante | POC antes. Fallback: Decap CMS |
| GA4 server proxy latência | Baixo | Fire-and-forget, sem await |
| Streaks Redis perde dados | Baixo | Backup MongoDB |
| Rebuild necessário p/ publicar conteúdo | Médio | Aceitável. Fluxo PR/deploy automático |

## 11. Métricas de Sucesso

| KPI | Meta | Prazo | Medição |
|---|---|---|---|
| Páginas indexadas Google | >50 | 3 meses | Search Console |
| Rich snippets (JSON-LD) | 100% páginas públicas | Imediato | Rich Results Test |
| Lighthouse SEO score | >90 | Imediato | Lighthouse CI |
| Social followers (cada plataforma) | >100 | 3 meses | Contagem manual |
| Visitantes orgânicos | >500/mês | 6 meses | GA4 |
| Taxa conversão visitante→buyin | >2% | 6 meses | GA4 funnels |
| Streak retention D7 | >30% | 3 meses | MongoDB analytics |
| Referral conversion rate | >5% | 3 meses | MongoDB analytics |
