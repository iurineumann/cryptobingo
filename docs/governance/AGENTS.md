# AGENTS.md — Agents Revisores do CryptoBingo

> Agents de revisão pré-PR (`subagent_type` no Agent tool).
> São especializados por camada: leem arquivos reais, identificam bugs, inconsistências de domínio
> e violações de invariantes. Não editam código — relatam o que está errado.
>
> Ao tocar uma camada, use a **skill** correspondente para desenvolver e delegue a revisão
> ao **agent** correspondente antes do PR. Ver tabela completa em `CLAUDE.md`.

---

## Agent: `cryptobingo-reviewer`

**Papel:** Revisor cross-cutting do domínio — contrato C++, economia on-chain, invariantes de negócio

**Quando usar:** Sempre que o contrato C++ for alterado. Também útil como segunda opinião em mudanças
de worker ou API que tocam lógica on-chain (pesos, payouts, FSM, combinações).

**Escopo de revisão:**
- `contracts/bingo/include/bingo.hpp` + `src/bingo.cpp` + `bingo.abi`
- `contracts/swap/` (bingogameswp)
- Invariantes de domínio: `max_weight` (ADR-005), `binary_extension` em migrações (ADR-016), pesos em hundredths, FREE SPACE bit 12, FSM estritamente linear
- Autenticação on-chain: `require_auth(get_self())` (admin) vs `require_auth("bingogamesvc"_n)` (jogo)
- Validação de pesos on-chain (anti-inflação de prêmio)
- ABI manual vs ABI gerado (nunca usar bingo_generated.abi para deploy)

**Skill complementar:** `wax-contract`

---

## Agent: `worker-reviewer`

**Papel:** Revisor do worker de resolução de jogos e payouts

**Quando usar:** Mudanças em `apps/worker-game-loop/` — evaluator, orchestrator, draw modes, payouts, RabbitMQ, Redis cache.

**Escopo de revisão:**
- `apps/worker-game-loop/src/services/evaluator.ts` — bitmasking O(1), `findAllWinners` paginado, draw modes
- `apps/worker-game-loop/src/services/gameOrchestrator.ts` — FSM, auto-advance
- `apps/worker-game-loop/src/services/rabbitmq.ts` — at-least-once delivery, DLQ, prefetch(1)
- `apps/worker-game-loop/src/services/dropWorker.ts` — 3 fases, Fisher-Yates
- `apps/worker-game-loop/src/services/patternCache.ts` — Redis TTL, fail-open
- Conformidade com `pricePaid` (ADR-010) e `max_weight` (ADR-005)
- Cobertura de testes Jest

**Skill complementar:** `worker-game-resolution`

---

## Agent: `api-reviewer`

**Papel:** Revisor do API Gateway (Express, JWT/RBAC, on-chain, MongoDB, PostgreSQL, cache)

**Quando usar:** Mudanças em `apps/api-gateway/` — controllers, rotas, auth, middleware, specs.

**Escopo de revisão:**
- Spec-Driven: toda rota existe em `docs/openapi.yaml` antes da implementação
- JWT challenge-response (ADR-006), RBAC por role
- Rate limiting, Helmet, CORS restrito
- Controllers: auth, tickets (ECDSA ADR-001), rooms, swap, vault, statistics, monteCarlo
- Tipos espelham `@cryptobingo/shared-types` e o ABI on-chain
- Cobertura de testes Jest (unit + security)

**Skill complementar:** `api-endpoint`

---

## Agent: `frontend-reviewer`

**Papel:** Revisor do frontend React (i18n, design system, Wharfkit, serviços)

**Quando usar:** Mudanças em `apps/frontend/` ou `apps/swap-ui/` — componentes, hooks, serviços, locales, Cypress fixtures.

**Escopo de revisão:**
- i18n: 3 locales (pt-BR, en-US, zh-CN); nenhum texto hardcoded
- Seletores Cypress: somente `data-testid` (nunca texto i18n)
- WharfKit SessionKit: sem custódia de chaves, `WalletPluginPrivateKey` apenas em `DEV`
- `swapService.ts`: executeSwap/addLiquidity/removeLiquidity via `session.transact()`
- Design system Tailwind v4: variáveis CSS em `globals.design.css`
- Cobertura Vitest

**Skill complementar:** `frontend-feature`

---

## Agent: `e2e-reviewer`

**Papel:** Revisor dos testes E2E de UI (Cypress, Tier 1 / Tier 2)

**Quando usar:** Mudanças em `apps/e2e-ui/` ou alterações de `data-testid` no frontend.

**Escopo de revisão:**
- Tier 1 (PR-gate, determinístico): `cy.intercept` + fixtures; sem WAX real; `cy.devLogin(role)`
- Tier 2 (nightly/manual): stack completo real
- Estratégia em camadas (ADR-017): seletores só por `data-testid`
- CI gating: Tier 1 obrigatório no pipeline; Tier 2 apenas nightly
- Fixtures alinhadas com contratos OpenAPI/AsyncAPI

**Skill complementar:** `e2e-ui-cypress`

---

## Agent: `platform-reviewer`

**Papel:** Revisor de harness E2E on-chain, DevOps/infra e economia (Monte Carlo RTP/GGR)

**Quando usar:** Mudanças em `apps/harness/`, `scripts/`, `init_dev_env.sh`, `infra/k8s/`, `docker-compose.yml`, ou simulação Monte Carlo.

**Escopo de revisão:**
- Harness: testes reais contra nodeos + oracle daemon; oracle precisa estar vivo durante jest
- `init_dev_env.sh`: criação de contas (bingogamectr/bingogametkn/bingogameswp/bingogamesvc), deploy, env vars, token distribution
- K8s: namespace, RBAC, NetworkPolicies, securityContext, HPA, PDB, Ingress TLS, ServiceMonitor
- Monte Carlo: `monteCarloController.ts`; RTP alvo 85% / GGR 15%; pesos em hundredths
- `orng.abi` mantido à mão (bug CDT: tabela `reqs` ausente no ABI gerado)

**Skills complementares:** `harness-e2e`, `weights-calibration`
