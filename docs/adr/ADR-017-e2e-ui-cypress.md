# ADR-017: Testes E2E de UI com Cypress (estratégia em camadas)

**Data:** 2026-06-08
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O projeto tem cobertura sólida de unidade/integração (vitest no frontend; jest no api-gateway e
worker) e **E2E de backend on-chain** no `apps/harness` (FSM contra `nodeos` real). Faltava validar a
**jornada visual do usuário** — a UX renderizada no navegador, como o usuário de fato experimenta:
Landing → login → lobby → compra de cartela → sala ao vivo (slow reveal, marcação de cartelas,
padrões, banner de encerramento), além das jornadas de **admin** (salas, gametypes/combinações,
vault/drops, patterns) e **sponsor** (salas próprias, alocação de drops).

Restrição de design central: um jogo ao vivo leva **~285s** (60s de funding + 75 bolas × 3s de
slow-reveal) e depende do oracle daemon + `nodeos`. Rodar isso como E2E "de verdade" a cada PR seria
lento e instável — inadequado para um gate de merge.

---

## Decisões

### 1. Ferramenta: Cypress

Cypress roda no navegador real contra o `vite dev` server, com bom DX (time-travel, retry-ability de
asserts) e suporte a `cy.intercept` para estabilizar a borda de rede. Fica isolado num workspace
próprio **`apps/e2e-ui` (`@cryptobingo/e2e-ui`)**, espelhando o padrão do `apps/harness` (E2E como
pacote dedicado), sem poluir o `apps/frontend` (vitest/jsdom).

### 2. Estratégia em camadas (Tier 1 determinístico / Tier 2 real)

- **Tier 1 — determinístico (PR-gate).** `cy.intercept` + fixtures estabilizam API
  (`/api/v1/*`), RPC (`/v1/chain/get_table_rows`) e, via `mock-socket`, o WebSocket de slow-reveal.
  Roda **sem WAX**, rápido e reprodutível. Cobre a maior parte da UX.
- **Tier 2 — integração real (nightly/manual).** Contra o stack completo
  (`docker compose` + `init_dev_env.sh`: api-gateway, worker, `nodeos`, oracle). Valida fidelidade
  ponta a ponta (compra real, slow-reveal real de ~285s, fluxo de drop ADR-011, ações assinadas).

A maior parte da UX da sala é validada **sem WebSocket** no Tier 1, explorando o caminho
`isStaticFinalState`/`fallbackBalls` (`GameRoom.tsx`): um jogo `archived` renderiza as bolas de
`game.drawn_balls` direto da fixture RPC — cartelas marcadas, padrões, banner de encerramento e
prêmio de combinação (ADR-010/ADR-016) de forma 100% determinística. Só a **animação** slow-reveal
precisa do socket mock (`gameroom-live`).

### 3. Autenticação: o fluxo real de dev-login, com a rede interceptada

`cy.devLogin(role)` dirige o **dev-login real** (`App.tsx` + `useAuth.ts`), que usa
`WalletPluginPrivateKey` para assinar `SHA256(nonce)` **localmente** (sem popup de carteira). As
chamadas `/auth/challenge`, `/auth/verify` e `/profile` são interceptadas com fixtures; o JWT é
gravado em `sessionStorage.cb_jwt` pelo próprio `services/api.ts`. Assim o **código de auth real é
exercitado** (ADR-006) e só a borda de rede é estável. Requer `import.meta.env.DEV === true` — sempre
verdadeiro sob `vite dev`, onde a UI de dev-login (5 perfis) está presente.

### 4. Seletores: `data-testid` first, **nunca** por texto i18n

O frontend é i18n em 3 locales (pt/en/zh). Selecionar por texto é frágil e quebra entre idiomas.
A suíte usa exclusivamente `data-testid` (convenção `area-elemento[-id]`), adicionados aos
componentes críticos sem alterar comportamento/estilo/i18n. Classes do design system (`cb-*`/`gr-*`)
são fallback secundário; texto traduzido é proibido como seletor.

### 5. Borda de stub no Tier 1: o que dá e o que não dá

- **REST do gateway** (rooms, gametypes, vault, sponsor) passa por `services/api.ts` → fácil de
  `cy.intercept`. Cobre admin/sponsor CRÍTICOS de forma determinística.
- **`session.transact()` direto** (NftAdmin→`atomicassets`, TokenAdmin→`bingo.token`) não é stubável
  de forma confiável → tratado como **SMOKE** no Tier 1 (só listagem) e exercido de verdade no
  **Tier 2** (`admin-onchain`).

### 6. CI: Tier 1 bloqueia PR; Tier 2 nightly

- Job `e2e-ui` em `pull_request`: sobe services + api-gateway/worker + `vite dev`, roda
  `cypress run --env tier=1`. **Obrigatório** (bloqueia merge). Artefatos (vídeo/screenshot) em falha.
- Job `e2e-ui-real` em `schedule` (nightly) + `workflow_dispatch`: `init_dev_env.sh` + stack +
  `cypress run --env tier=2`. Espelha o `e2e-harness`; **não** bloqueia PR.

---

## Governança de execução (anti-retrabalho)

Esta camada nasce com **skill** (`.claude/skills/e2e-ui-cypress`) e **revisor**
(`.claude/agents/e2e-reviewer.md`) dedicados. Toda tarefa de implementação (inclusive a delegada a
agents) segue o **Protocolo de Onboarding Obrigatório**: ler `CLAUDE.md` → `docs/MASTER-PROMPT.md` →
`docs/SPEC.md` (§4/§5) → ADRs pertinentes (017/006/007/010/016) → a skill da camada → os
arquivos-alvo, **antes** de editar. Motivação: execuções que pularam as fontes-de-verdade já
causaram retrabalho (ex.: duplicação de schema em vez de reuso do model). Regra dura: *se não leu o
arquivo, não edita o arquivo*; não duplicar utilitários/tipos (reusar `ticketUtils.ts`,
`services/api.ts`, `shared-types`).

---

## Consequências

**Positivas:** valida a UX como o usuário a vive; PR-gate rápido e determinístico; fidelidade real
preservada no nightly; auth fiel sem popup; seletores estáveis a i18n; governança embutida reduz
retrabalho.

**Trade-offs:** fixtures do Tier 1 precisam acompanhar mudanças de contrato de API/RPC (mitigado
reusando shapes de `shared-types` e o padrão de mocks já existente em `BuyTicketModal.test.tsx`); o
Tier 2 herda a lentidão/instabilidade inerente ao slow-reveal real — por isso fora do caminho de PR.

---

## Referências

- ADR-006 (auth JWT challenge-response), ADR-007 (slow reveal/WebSocket), ADR-010 (pricePaid),
  ADR-015 (routing), ADR-016 (combinações), ADR-011 (drop vault).
- SPEC §4 (WebSocket) e §5 (Frontend).
- Pacote: `apps/e2e-ui/**`; skill `.claude/skills/e2e-ui-cypress/SKILL.md`; revisor
  `.claude/agents/e2e-reviewer.md`.
- Reuso: `apps/frontend/src/{hooks/useAuth.ts,services/api.ts,services/wharfkit.ts,components/ticketUtils.ts}`.
