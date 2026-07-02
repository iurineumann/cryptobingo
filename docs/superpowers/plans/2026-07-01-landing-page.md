# CryptoBingo Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Marketing landing page em `www.cryptobingo.bet` com ideas forum, newsletter autogerenciada, voting com confirmação email, admin dashboard.

**Architecture:** Novo `apps/landing-page/` no monorepo. React 19 + Vite 8 + Tailwind v4 + Geist. Azure Functions (SWA api/) backend. Neon PostgreSQL. Azure Communication Services email.

**Tech Stack:** React 19, Vite 8, Tailwind v4, Geist Variable, Lucide, React Router 7, `pg` (Neon), ACS Email SDK, Azure SWA Deploy CLI

## Global Constraints

- Monorepo pnpm: `@cryptobingo/landing-page`, zero deps em shared-types/blockchain-core
- `pnpm-workspace.yaml` já inclui `apps/*` — 0 alterações no workspace
- `turbo.json` unchanged — landing não depende de shared-types nem blockchain-core
- Versões React/Vite/Tailwind/TS iguais `apps/frontend/package.json`
- TDD: vitest + jsdom + @testing-library/react
- Fonte: Geist Variable apenas (`@fontsource-variable/geist`) — monocromático
- **Sem shadcn/ui** — landing não precisa. Copia só tokens + componentes custom leves.
- **Anti-padrões (impeccable brand register):** sem eyebrow labels, gradient text, glassmorphism decorativo, grid cards idênticos. Com imagery real + motion proposital.
- Cores: copiadas do `@theme` em `apps/frontend/src/styles/globals.css`
- i18n: só inglês, estrutura preparada
- SonarQube: zero BLOCKER/CRITICAL/MAJOR pre-commit
- Git: conventional commits PT-BR, branch `feature/landing-page`, PR → `develop`

## Impact Map

```
Phase 0: Setup (1x manual)
  0.1 Neon DB + migration SQL
  0.2 ACS + DNS (SPF/DKIM)
  0.3 Azure SWA + deploy token

Phase 1: Foundation (paralelizável)
  1.1 Scaffold (package.json, tsconfig, vite.config, index.html)
  1.2 Design tokens (globals.css com @theme)
  1.3 Lib utils (api.ts, store.ts, utils.ts)

Phase 2: API Backend (após 1.1, 0.1, 0.2)
  2.1 DB models + pg connection
  2.2 Email service (ACS)
  2.3 Stats + ideas CRUD endpoints
  2.4 Vote flow (request + confirm)
  2.5 Admin auth (login + confirm + status)
  2.6 Subscribe + unsubscribe

Phase 3: Static UI (após 1.1+1.2)
  3.1 Header + Hero + Footer
  3.2 Features + Roadmap
  3.3 StatsBar + Newsletter
  3.4 Router + Pages (HomePage, IdeasPage, AdminPage)

Phase 4: Interactive UI (após Phase 2 + Phase 3)
  4.1 IdeaList + IdeaCard
  4.2 IdeaSubmitForm + VoteModal
  4.3 AdminLogin + AdminDashboard
  4.4 Newsletter full flow

Phase 5: Polish
  5.1 Screenshots
  5.2 Responsive + motion
  5.3 SonarQube + i18n prep

Phase 6: Deploy
  6.1 CI/CD workflow
  6.2 Cloudflare DNS
  6.3 Deploy + verify
```

## File Structure

```
apps/landing-page/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/globals.css
│   ├── components/
│   │   ├── Header.tsx | Hero.tsx | Features.tsx | Roadmap.tsx
│   │   ├── Newsletter.tsx | Footer.tsx | StatsBar.tsx
│   │   ├── IdeaCard.tsx | IdeaList.tsx | IdeaSubmitForm.tsx | VoteModal.tsx
│   │   └── AdminLogin.tsx | AdminDashboard.tsx
│   ├── pages/HomePage.tsx | IdeasPage.tsx | AdminPage.tsx
│   └── lib/api.ts | store.ts | utils.ts
├── api/
│   ├── _lib/db.ts | models.ts | email.ts
│   ├── stats.ts
│   ├── ideas.ts
│   ├── ideaVote.ts
│   ├── votesConfirm.ts
│   ├── subscribe.ts
│   ├── adminLogin.ts
│   ├── adminConfirm.ts
│   ├── adminIdeaStatus.ts
│   └── adminNewsletter.ts
└── staticwebapp.config.json
```

## Tasks

### Task 1.1: Scaffold
- Create `apps/landing-page/package.json` (name @cryptobingo/landing-page, type module, scripts dev/build/test)
- Create `tsconfig.json` (extends none — standalone, strict, jsx react-jsx, bundler)
- Create `vite.config.ts` (react + tailwindcss plugins, @ alias to src, vitest jsdom)
- Create `index.html` (dark class on html, title "CryptoBingo — BINGO GameFi on WAX", meta theme-color #6d28d9)
- Create `public/favicon.svg` (violet B letter)
- Verify: `pnpm build` gera dist/

### Task 1.2: Design Tokens
- Create `src/styles/globals.css`
- `@import "tailwindcss"` + `@import "@fontsource-variable/geist"`
- `@theme` block copiado do frontend (brand/accent/surface/semantic/bingo colors)
- Typography: `--font-sans: 'Geist Variable', sans-serif; --font-display: var(--font-sans)`
- Fluid type scale do frontend
- Shadows do frontend (glow-brand, glow-accent, card, card-hover, modal)
- Base layer: html font-sans bg-surface-900 text-primary

### Task 1.3: Lib Utils
- `utils.ts`: cn(clsx+twMerge), validateEmail(regex)
- `api.ts`: fetch wrappers p/ stats/ideas/vote/subscribe/admin com tipos
- `store.ts`: localStorage p/ admin token (get/set/clear/isAdminLoggedIn)

### Task 2.1: DB Layer
- `api/_lib/db.ts`: pg Pool, query() helper
- `api/_lib/models.ts`: funções tipadas getAllIdeas, createIdea, insertVote, getStats, etc.
- SQL migration em comentário (6 tabelas: subscribers, ideas, votes, confirmations, admin_sessions, email_log)

### Task 2.2: Email Service
- `api/_lib/email.ts`: ACS EmailClient, sendEmail(to, subject, body), generateCode()

### Task 2.3-2.6: Endpoints (flat structure — SWA Functions v2)
- stats.ts: GET → COUNT queries, by_status, top_idea
- ideas.ts: GET list (sort query param), POST create (valida title/description/author_name)
- ideaVote.ts: POST → valida email, gera código 6 dígitos (TTL 15min), salva confirmation, envia email
- votesConfirm.ts: POST → valida código, UPSERT vote, UPDATE idea counts
- adminLogin.ts: POST → se email == ADMIN_EMAIL, gera código, envia email
- adminConfirm.ts: POST → valida código, gera token UUID, salva session, retorna token
- adminIdeaStatus.ts: PUT autenticado (Bearer) → UPDATE ideas.status
- subscribe.ts: POST → INSERT subscriber, envia welcome email
- adminNewsletter.ts: POST autenticado → SELECT active subscribers, batch send
- staticwebapp.config.json: rotas SWA, CORS, auth rules

### Task 3.1: Header + Hero + Footer
- Header.tsx: sticky, backdrop-blur, logo "CryptoBingo" + nav (Testnet, GitHub, Ideas, Telegram/Discord placeholders)
- Hero.tsx: full-viewport, h1 "BINGO GameFi on WAX", p "Provably fair...", CTA gold → test.cryptobingo.bet
- Footer.tsx: logo + links + copyright

### Task 3.2: Features + Roadmap
- Features.tsx: grid auto-fit minmax(280px, 1fr), 3 cards com screenshots
- Roadmap.tsx: timeline vertical: July (MVP) → August (Beta) → September (Mainnet)

### Task 3.3: StatsBar + Newsletter
- StatsBar.tsx: fetch /api/stats, display counts
- Newsletter.tsx: email input, validação, submit, feedback

### Task 3.4: Router + Pages
- main.tsx: BrowserRouter
- App.tsx: Routes (/ → Home, /ideas → Ideas, /admin → Admin)
- HomePage: Header+Hero+Features+Roadmap+StatsBar+Newsletter+Footer
- IdeasPage: Header+StatsBar+IdeaList+IdeaSubmitForm+Footer
- AdminPage: if not authed→AdminLogin else AdminDashboard

### Task 4.1-4.4: Interactive Components
- IdeaCard: title, desc, author, status badge, upvote/downvote buttons
- IdeaList: fetch + sort + map IdeaCards + loading + empty
- IdeaSubmitForm: name, email, title, desc → POST /api/ideas
- VoteModal: 3-step (email → code → confirmed), TDD testado
- AdminLogin: email → code → token (store.ts)
- AdminDashboard: stats + ideas table (status dropdown) + newsletter compose
- Newsletter full flow: admin compose → batch send → unsubscribe link

### Task 5.1: Screenshots
- Capturar prints de test.cryptobingo.bet (game room, tickets, prizes)
- Salvar em public/screenshots/ como webp

### Task 5.2: Responsive + Motion
- Mobile-first, breakpoints tailwind (sm/md/lg)
- Hero entrance animation (fade+translate)
- Features stagger reveal (IntersectionObserver)
- reduced-motion fallback

### Task 5.3: SonarQube + i18n
- SonarQube analyze em cada arquivo novo
- Correção de issues BLOCKER/CRITICAL/MAJOR
- i18n placeholder structure (src/lib/i18n.ts, src/locales/en.json)

### Task 6.1: CI/CD
- .github/workflows/deploy-landing.yml
- push develop alterando apps/landing-page/** → build → Azure SWA deploy
- Action: `Azure/static-web-apps-deploy@v1` com app_location, output_location
- Sem Docker — deploy direto do build output pra SWA

### Task 6.2: DNS
- CNAME www → SWA URL
- SPF/DKIM TXT records
- 301 redirect cryptobingo.bet → www

### Task 6.3: Deploy + Verify
- Push → workflow roda
- Verificar https://www.cryptobingo.bet
- Verificar /api/stats
- Testar full flow: submit idea → vote → confirm → admin → newsletter

## Fase 0: Setup Manual (1x, pelo dev)

- Neon DB: criar projeto, rodar migration SQL (6 tabelas), salvar DATABASE_URL
- ACS: criar Email Communication Service, verificar domínio (SPF/DKIM no Cloudflare)
- Azure SWA: criar Static Web App Free, salvar deployment token no GitHub secret

## Execution Order (Parallel)

1. **Agent A** — Tasks 1.1 + 1.2 + 1.3 (scaffold + design tokens + lib utils)
2. **Agent B** — Tasks 2.1 + 2.2 (DB + email) [após 1.1]
3. **Agent C** — Tasks 3.1 + 3.2 + 3.3 (static UI components) [após 1.1+1.2]
4. **Agent D** — Tasks 2.3 + 2.4 + 2.5 + 2.6 (endpoints) [após A+B]
5. **Agent E** — Task 3.4 (router + pages) [após C]
6. **Agent F** — Tasks 4.1 + 4.2 + 4.3 + 4.4 (interactive UI) [após D+E]
7. **Agent G** — Tasks 5.1 + 5.2 + 5.3 (polish) [após F]
8. **Agent H** — Tasks 6.1 + 6.2 + 6.3 (deploy) [após G]

## Git Flow

```bash
gh issue create --repo iurineumann/cryptobingo \
  --title "feat(landing): landing page institucional + ideas forum" \
  --label "enhancement"
gh project item-add 4 --owner iurineumann --url <issue-url>
git checkout -b feature/landing-page
```
