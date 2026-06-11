# WORKSPACES.md — Contextos de Desenvolvimento

> Mapeamento dos workspaces do monorepo e seus contextos.
> Baseado em `pnpm-workspace.yaml` e estrutura de diretórios.

---

## Workspaces de Aplicação (`apps/*`)

### `@cryptobingo/api-gateway`
**Path:** `apps/api-gateway/`
**Porta:** 8083
**Tecnologia:** Express, Mongoose, pg, TypeScript
**Propósito:** API REST — auth JWT/RBAC, geração de cartelas assinadas (ECDSA ADR-001), rotas de rooms/vault/swap/statistics/monteCarlo, WebSocket broadcaster
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/api-gateway dev    # ts-node-dev com hot-reload
pnpm --filter @cryptobingo/api-gateway build  # compilar para dist/
pnpm --filter @cryptobingo/api-gateway test   # 171 testes Jest
```

### `@cryptobingo/frontend`
**Path:** `apps/frontend/`
**Porta:** 5173
**Tecnologia:** React 18, Vite, Tailwind v4, WharfKit, i18next, TypeScript
**Propósito:** Interface do jogador — login, lobby, GameRoom, ReplayRoom, histórico, admin, sponsor
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Link externo:** `VITE_SWAP_URL` → `apps/swap-ui` (bidirectional)
**Scripts:**
```bash
pnpm --filter @cryptobingo/frontend dev    # Vite dev server
pnpm --filter @cryptobingo/frontend build
pnpm --filter @cryptobingo/frontend test   # 89 testes Vitest
```

### `@cryptobingo/swap-ui`
**Path:** `apps/swap-ui/`
**Porta:** 5174
**Tecnologia:** React 18, Vite, Tailwind v4, WharfKit, i18next, TypeScript
**Propósito:** DEX público `bingogameswp` — SwapPage (x·y=k quote), PoolPage (add/remove liquidity), AnalyticsPage (TVL, volume, APR)
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Link externo:** `VITE_GAME_URL` → `apps/frontend` (bidirectional)
**Scripts:**
```bash
pnpm --filter @cryptobingo/swap-ui dev    # Vite dev server
pnpm --filter @cryptobingo/swap-ui build
pnpm --filter @cryptobingo/swap-ui test   # 14 testes Vitest (swapService)
```

### `@cryptobingo/worker-game-loop`
**Path:** `apps/worker-game-loop/`
**Tecnologia:** Node.js, amqplib, WharfKit, Redis, TypeScript
**Propósito:** Worker autônomo — lockgame, startdraw, claimwin, evaluator O(1), draw modes, dropWorker, patternCache
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/worker-game-loop dev    # ts-node-dev
pnpm --filter @cryptobingo/worker-game-loop start  # produção
pnpm --filter @cryptobingo/worker-game-loop test   # 118 testes Jest
```

### `@cryptobingo/harness`
**Path:** `apps/harness/`
**Tecnologia:** Node.js, Jest, ts-jest, TypeScript
**Propósito:** Testes E2E on-chain contra nodeos real + oracle daemon — FSM (20 testes), swap Suite 9
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
cd apps/harness && node run-tests.js          # todas as suites
cd apps/harness && npx jest tests/fsm.test.ts # suite específica
```

### `@cryptobingo/e2e-ui`
**Path:** `apps/e2e-ui/`
**Tecnologia:** Cypress, TypeScript
**Propósito:** Testes E2E de UI — Tier 1 determinístico (PR-gate, cy.intercept + fixtures) e Tier 2 real (nightly)
**Scripts:**
```bash
pnpm --filter @cryptobingo/e2e-ui e2e        # Tier 1 (requer frontend dev server)
pnpm --filter @cryptobingo/e2e-ui e2e:tier2  # Tier 2 (requer stack completo)
```

---

## Workspaces de Pacotes (`packages/*`)

### `@cryptobingo/shared-types`
**Path:** `packages/shared-types/`
**Tecnologia:** TypeScript (apenas tipos)
**Propósito:** Tipos compartilhados — structs on-chain (BlockchainGameState, BlockchainTicketRecord, BlockchainBalance, BlockchainDrop*), modelos PostgreSQL, modelos MongoDB, SwapPoolSummary, SwapQuote
**Dependências internas:** Nenhuma
**Importante:** Fonte única da verdade para tipos — alterar ABI ou schema → atualizar aqui na mesma iteração

### `@cryptobingo/blockchain-core`
**Path:** `packages/blockchain-core/`
**Tecnologia:** TypeScript, @wharfkit/antelope
**Propósito:** Cliente RPC Antelope encapsulado — `fetchGame()`, `fetchPlayerTickets()`, `fetchPlayerBalance()`, `rpcClient` singleton
**Dependências internas:** `@cryptobingo/shared-types`

---

## Contratos (`contracts/*`)

### `bingogamectr` — `contracts/bingo/`
Contrato principal do jogo. FSM de jogo (funding → locked → drawing → drawn → archived/aborted), tickets, patterns, gametypes, rooms, Drop Vault, combinações.
- `include/bingo.hpp` — structs e tabelas
- `src/bingo.cpp` — implementação
- `bingo.abi` — **mantido à mão** (fonte de verdade)
- `bingo.wasm` — artifact compilado

### `bingogameswp` — `contracts/swap/`
DEX AMM x·y=k. Allowlist de tokens, taxa de serviço por pool (`service_fee_bps`).
- `bingo.swap.abi` — **mantido à mão**
- `bingo.swap.wasm` — artifact compilado

### Oracle — `contracts/orng/`
Oráculo RSA-SHA256 + daemon `scripts/orng-oracle.ts`.
- `orng.abi` — **mantido à mão** (bug CDT: tabela `reqs` ausente no ABI gerado)

---

## Contextos Transversais

### Infraestrutura
**Path:** `infra/`
**Subdiretórios:** `k8s/` (overlays dev/prod via Kustomize), `prometheus/`
**Docker Compose:** PostgreSQL, MongoDB, RabbitMQ, Redis, Prometheus, Grafana, cAdvisor, pgAdmin
```bash
docker compose up -d
docker compose down -v  # destrói volumes (cuidado)
```

### Documentação
**Path:** `docs/`
- `MASTER-PROMPT.md` — metodologia da Célula de Engenharia de Elite
- `SPEC.md` — especificação mestre
- `openapi.yaml` — contrato REST (36+ endpoints)
- `asyncapi.yaml` — contrato de eventos
- `architecture.md` — diagramas Mermaid
- `adr/` — Architecture Decision Records (ADR-001 a ADR-023)
- `governance/` — AGENTS, SKILLS, WORKSPACES, STORIES, EPICS

### Raiz do Monorepo
- `CLAUDE.md` — instruções primárias para o agente (source of truth)
- `README.md` — overview público do projeto
- `CONTRIBUTING.md` — guia de contribuição (git flow, skills, invariantes)
- `turbo.json` — orquestração de build
- `pnpm-workspace.yaml` — definição dos workspaces
- `init_dev_env.sh` — setup/reset do ambiente local

---

## Mapa de Dependências entre Workspaces

```
@cryptobingo/shared-types (tipos base)
    ↑
@cryptobingo/blockchain-core (cliente RPC)
    ↑
    ├── @cryptobingo/api-gateway      (Express REST + WebSocket)
    ├── @cryptobingo/frontend         (React game app — porta 5173)
    ├── @cryptobingo/swap-ui          (React DEX app — porta 5174)
    ├── @cryptobingo/worker-game-loop (Worker RabbitMQ)
    └── @cryptobingo/harness          (E2E on-chain)

@cryptobingo/e2e-ui (Cypress) → depende do frontend em runtime (sem import pnpm)
```

**Regra de dependência:** `turbo.json` garante que `build` de dependências executa antes do `build` do dependente.
