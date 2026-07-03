---
name: e2e-ui-cypress
description: >
  Como escrever e rodar os testes E2E de UI do CryptoBingo (Cypress, apps/e2e-ui) que validam a
  jornada visual do usuário (player/admin/sponsor) no navegador. Modelo em camadas: Tier 1
  determinístico (cy.intercept + fixtures, PR-gate) e Tier 2 real (stack on-chain, nightly). Use ao
  criar/alterar specs Cypress, fixtures, comandos de suporte, ou ao instrumentar data-testid no
  frontend para E2E. Ref: ADR-017.
---

# E2E de UI — Cypress (apps/e2e-ui)

Pacote `@cryptobingo/e2e-ui`. Valida a UX renderizada ponta a ponta. **Não** substitui o
`apps/harness` (E2E de contrato/FSM on-chain) nem os testes vitest/jest. Fonte de verdade da
decisão: **ADR-017**.

## Leitura obrigatória antes de agir (Protocolo de Onboarding)

Antes de escrever qualquer linha: `CLAUDE.md` → `docs/MASTER-PROMPT.md` → `docs/SPEC.md` (§4
WebSocket, §5 Frontend) → ADRs **017** (este E2E), **006** (auth), **007** (slow reveal), **010**
(pricePaid), **016** (combos) → esta skill → os **arquivos-alvo completos**. Se mexer em
`apps/frontend/src/**`, leia também a skill `frontend-feature`. **Se não leu o arquivo, não edita o
arquivo.**

## Modelo em camadas

- **Tier 1 (determinístico, PR-gate):** `cy.intercept` + fixtures estabilizam API (`/api/v1/*`), RPC
  (`/v1/chain/get_table_rows`) e WebSocket (via `mock-socket`). Roda **sem WAX**. Specs em
  `cypress/e2e/tier1/{player,admin,sponsor}/`.
- **Tier 2 (real, nightly/manual):** stack completo (`docker compose` + `init_dev_env.sh`). Specs em
  `cypress/e2e/tier2/`. Tolera o slow-reveal real (~285s).

## Regras obrigatórias

1. **Seletores por `data-testid` SEMPRE.** Nunca selecione por texto traduzido (i18n pt/en/zh quebra
   o seletor). Convenção: `data-testid="area-elemento[-id]"` (ex.: `lobby-card-12`,
   `buy-confirm`, `admin-nav-vault`). Classes `cb-*`/`gr-*` são fallback secundário.
2. **Auth via `cy.devLogin(role)`.** Dirige o dev-login real (assina `SHA256(nonce)` localmente, sem
   popup) com `/auth/challenge`, `/auth/verify`, `/profile` interceptados. `role` ∈
   `player | admin | sponsor` define o perfil dev e o `profile.role` da fixture (guards). O JWT vai
   para `sessionStorage.cb_jwt` pelo próprio `services/api.ts` — não grave à mão.
3. **Sem espera por tempo fixo.** Nada de `cy.wait(3000)`. Use a retry-ability nativa do Cypress
   (`cy.get(...).should(...)`) sobre estado/DOM. Para o slow-reveal use `cy.emitBall(n)` (controle
   manual via socket mock), não timers reais.
4. **Determinismo no Tier 1.** Toda chamada de rede é interceptada via `cy.stubBackend(scenario)`
   antes do `visit`. Cenários canônicos: `funding` (sala vendável), `archived-combo-win` (jogo
   encerrado com vitória de combinação — valida ADR-010/016 no `gameroom-static`).
5. **Reuso, não reimplementação.** Fixtures espelham shapes de `packages/shared-types` e o padrão de
   mocks de `apps/frontend/src/components/BuyTicketModal.test.tsx`. Não recalcule lógica de
   padrões/combos no teste — asserte o **render** (a lógica é testada em vitest/`ticketUtils`).

## Comandos

> **Rodar local = via Docker.** O Cypress nativo **não** sobe neste host (Ubuntu 24.04/WSL2):
> a restrição de user-namespaces do AppArmor quebra o sandbox do Electron
> (`bad option: --no-sandbox`). Use a imagem oficial `cypress/included` (script `run-docker.sh`,
> com `--network host` para alcançar o `vite dev` da 5173). Em CI (ubuntu-latest) o nativo funciona
> via `cypress-io/github-action`.

- **Rodar Tier 1 (local, sem WAX):**
  ```bash
  pnpm --filter @cryptobingo/frontend dev      # vite na 5173 (DEV=true → dev-login presente) — deixe rodando
  pnpm --filter @cryptobingo/e2e-ui e2e:docker # cypress/included via Docker (tier=1)
  # 1 spec só: pnpm --filter @cryptobingo/e2e-ui e2e:docker --spec 'cypress/e2e/tier1/player/lobby.cy.ts'
  ```
- **Rodar Tier 2 (exige WAX + oracle):**
  ```bash
  docker compose up -d postgres mongodb redis rabbitmq api-gateway worker-game-loop
  bash init_dev_env.sh                          # nodeos + deploy + oracle daemon
  pnpm --filter @cryptobingo/frontend dev
  pnpm --filter @cryptobingo/e2e-ui e2e:docker:tier2
  ```
- **Scripts nativos** (`e2e`, `e2e:open`, `e2e:tier2`) existem para CI/ambientes onde o Electron sobe;
  localmente prefira os `:docker`.
- **Pré-PR (CoVe):** se tocou `apps/frontend/src/**`, `npx tsc --noEmit` (no frontend) limpo +
  `pnpm --filter @cryptobingo/frontend test` (vitest) verde — instrumentar `data-testid` **não pode**
  regredir os testes existentes. Tier 1 verde.

## Gotchas (não-óbvios)

- **`vite dev` é obrigatório** para o dev-login aparecer (`import.meta.env.DEV`). Cypress contra build
  de produção **não** tem os 5 perfis dev.
- **`mock-socket`** substitui o `io()` do `useSlowReveal`; injete o mock **antes** do `visit` que monta
  a `GameRoom`. Os eventos espelham o broadcaster: `ball_drawn`, `winner_found`, `game_locked`,
  `game_ended`, `golden_ball`, `stage_cleared` (SPEC §4).
- **Sala estática vs ao vivo:** `gameroom-static` (jogo `archived`, sem socket — caminho
  `isStaticFinalState`/`fallbackBalls` do `GameRoom.tsx`) cobre a maior parte da UX. `gameroom-live`
  isola só a animação via socket mock.
- **RBAC:** valide redirecionamentos dos guards — perfil não-admin em `/admin/*` → `/lobby`;
  não-sponsor em `/sponsor/*` → `/lobby` (`AdminGuard`/`SponsorGuard` em `App.tsx`).
- **NftAdmin/TokenAdmin** usam `session.transact()` direto (atomicassets/bingogametkn) — **não**
  stubáveis no Tier 1 → SMOKE (só listagem). Ação real só no Tier 2 (`admin-onchain`).
- **`turbo` task `e2e`** é `cache:false` e **não** entra no `pnpm test` default (é disparada
  explicitamente / no job de CI próprio).

## SonarQube (obrigatório antes de cada commit)

- Rode `sonarqube_analyze_code_snippet` em cada `.ts`/`.tsx` modificado
- Corrija BLOCKER/CRITICAL/MAJOR — zero tolerância antes do commit
- MINOR aceitável com justificativa inline
- NOSONAR só com comentário explicando o motivo
- Varredura só após testes verdes

## Checklist

- [ ] Onboarding lido (CLAUDE.md → MASTER-PROMPT → SPEC §4/§5 → ADRs → skill → arquivos).
- [ ] Seletores só por `data-testid`; zero seleção por texto i18n.
- [ ] Auth via `cy.devLogin(role)`; rede via `cy.stubBackend(scenario)` (Tier 1).
- [ ] Sem `cy.wait(tempo)`; slow-reveal via `cy.emitBall`.
- [ ] Fixtures reusam shapes de `shared-types`; nada de lógica de domínio reimplementada.
- [ ] Tier 1 verde; se tocou frontend, `tsc --noEmit` + vitest verdes (sem regressão).
- [ ] Revisão pré-PR delegada a `e2e-reviewer` (+ `frontend-reviewer` se tocou o frontend).
