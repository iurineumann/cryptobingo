# Landing Page — Polish, Deploy & E2E Spec

**Versão:** 1.0
**Data:** 2026-07-04
**Tag inicial:** `v0.1.0`
**Release testnet:** `v0.2.0` (develop→master + deploy)
**Release major:** `v1.0.0` (futuro)

---

## Visão Geral

Completar a landing page `www.cryptobingo.bet` com polish visual/de qualidade, deploy em produção, e testes E2E de UI. Três fases sequenciais, cada uma em branch independente, com PR para develop e tag preview.

---

## Versionamento

```
v0.1.0 ─── tag inicial (atual)
  │
  ├── Fase 5: feature/landing-polish → PR → develop → tag v0.1.1
  ├── Fase 6: feature/landing-deploy  → PR → develop → tag v0.1.2
  ├── E2E:    feature/landing-e2e     → PR → develop → tag v0.1.3
  │
  └── develop → PR → master (deploy testnet) → v0.2.0
  └── Release major futuro → v1.0.0
```

Cada fase depende da develop atualizada (com merge da fase anterior).

---

## Fase 5: Polish (`feature/landing-polish`)

### 5.1 Grill with docs (`grill-with-docs`)

Confrontar identidade visual atual contra:
- ADR-037 (Sistema de Conteúdo Unificado)
- ADR-039 (Landing API)
- Design tokens em `apps/frontend/src/styles/globals.css`
- `docs/MASTER-PROMPT.md` (metodologia)
- `CLAUDE.md` (convenções)

**Output:** Atualizações em docs/ADRs se inconsistências encontradas.

### 5.2 Impeccable Review (`impeccable`)

Audit visual completo da landing page:
- **Cores:** consistência com `@theme` do frontend principal
- **Tipografia:** Geist Variable, escala, hierarquia, leading
- **Layout:** spacing grid, alinhamento, consistência entre páginas
- **Motion:** transições propositais, micro-interações (hover, focus, page transitions)
- **Dark mode:** já é dark-first, verificar contraste
- **Componentes:** Header, Hero, Features, Roadmap, StatsBar, Newsletter, Footer, Ideas, Admin

### 5.3 Design Tokens

- Sincronizar `apps/landing-page/src/styles/globals.css` com o `@theme` do frontend
- Garantir que `tailwind.config.ts` (se existir) ou CSS nativo use mesmas cores/sombras/radii

### 5.4 i18n Consistency

- Verificar todos componentes usam `useTranslation()` em vez de texto hardcoded
- Verificar 3 locales (en/pt/zh) preenchidos para TODAS as chaves
- Tratar fallback locale (en como default)

### 5.5 Acessibilidade

- ARIA labels em interactive elements (buttons, links, inputs)
- Contraste WCAG AA (4.5:1 texto normal, 3:1 texto grande)
- Foco visível (`:focus-visible`) em todos interactive elements
- Tab order lógico
- Headings hierarchy (h1→h2→h3 sem saltos)
- Alt text em imagens/decorative SVGs com `aria-hidden`

### 5.6 Performance

- Bundle audit com `vite build --report` ou similar
- lucide-react (~90KB): importação seletiva (arvored shake já deve funcionar, verificar)
- tinacms (~150KB): lazy loading no admin, não no bundle principal
- Code splitting dinâmico para páginas pesadas (Admin com TinaCMS)
- Lighthouse score alvo: Performance ≥ 90, A11y ≥ 95

### 5.7 Testes Vitest

Expandir cobertura atual (19 testes) para incluir:

| Componente | Testes | Descrição |
|---|---|---|
| `IdeasPage` | 3 | render com dados, render vazio, erro API |
| `AdminPage` | 2 | render logged out (login), render logged in (dashboard) |
| `AdminDashboard` | 3 | render stats, ideas table, status update |
| `AdminLogin` | 2 | email step, code step, success |
| `IdeaCard` | 2 | render com dados, votação |
| `IdeaList` | 2 | render cards, loading skeleton, empty state |
| `IdeaSubmitForm` | 3 | render, validação, submit sucesso |
| `StatsBar` | 1 | render stats |
| `api.ts` | 2 | chamadas básicas (getIdeas, subscribe) |

**Total estimado:** +20 testes (39 total)

### 5.8 Responsive

- Breakpoints: mobile (320px), tablet (768px), desktop (1280px)
- Verificar: nav colapso, hero texto, features grid, roadmaps timeline, footer links
- Touch targets ≥ 44px
- Overflow horizontal em qualquer viewport

### 5.9 SonarQube

- Rodar `sonarqube_analyze_code_snippet` em cada .ts/.tsx modificado
- Zero BLOCKER/CRITICAL/MAJOR
- MINOR aceitável com justificativa

---

## Fase 6: Deploy (`feature/landing-deploy`)

### 6.1 CSP Review

- `staticwebapp.config.json`: garantir CSP permite TinaCMS admin (`identity.tinajs.io`, `content.tinajs.io`)
- Testar navegação entre páginas legais não quebra CSP

### 6.2 Deploy Manual (Azure SWA)

GitHub Actions não disponível (sem minutos). Deploy manual com Azure CLI:

```bash
# 1. Build
pnpm --filter @cryptobingo/landing-page build

# 2. Deploy (SWA CLI)
npx @azure/static-web-apps-cli deploy \
  --deployment-token "$AZURE_SWA_TOKEN_LANDING" \
  --app-location apps/landing-page \
  --output-location build/client

# ALT: via Azure CLI
az staticwebapp appsettings set \
  --name cryptobingo-landing \
  --setting VITE_API_URL=https://landing-api.cryptobingo.bet/api
```

Token SWA em `AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING` (1Password/vault).

### 6.3 Verificação

- https://www.cryptobingo.bet — páginas carregando, CSP OK
- https://www.cryptobingo.bet/en/terms — páginas legais
- https://www.cryptobingo.bet/en/ideas — ideias funcionando
- Admin TinaCMS acessível em /admin

### 6.4 DNS/SSL

- Cloudflare DNS já aponta (NS registrado na Namecheap)
- SSL Full (strict) via Cloudflare
- Verificar redirect `/` → `/en/` no SWA config

---

## E2E Cypress (`feature/landing-e2e`)

### Escopo

Tier 1 (determinístico, PR-gate):
- `cy.intercept` + fixtures
- Build local do SSG
- Roda em CI via `pnpm --filter @cryptobingo/e2e-ui e2e`

### Fixtures

- `landing-home.json` — dados da homepage (stats)
- `landing-ideas.json` — lista de ideias mock
- `landing-stats.json` — stats do site

### Spec: `landing-journey.cy.ts`

| Teste | Descrição |
|---|---|
| Home carrega | Hero, Features, Roadmap visíveis |
| FAQ navegação | /en/faq lista perguntas |
| Ideas flow | /en/ideas → lista → clicar vote → modal email step |
| Admin flow | /en/admin → login email → code → dashboard |
| Newsletter | Subscribe com email, verifica sucesso |
| 404 fallback | Rota inexistente → fallback |

### Comandos

- `cy.visitByLocale(path, locale)` — visita com locale prefix
- `cy.devLogin(role)` — admin login via intercept (Tier 1)
- `cy.dataCy(name)` — wrapper para `[data-testid]`

### Data Attributes

Adicionar `data-testid` nos componentes da landing page conforme necessário.

---

## Critérios de Sucesso

1. Build SSG limpo (0 erros)
2. SonarQube sem BLOCKER/CRITICAL/MAJOR
3. 39+ testes vitest verdes
4. E2E Tier 1 spec passando
5. Deploy Azure SWA funcionando
6. Tags `v0.1.1`, `v0.1.2`, `v0.1.3` na develop (cada fase)
7. Tag `v0.2.0` na master (deploy testnet)
8. Release notes no GitHub cobrindo as 3 fases
