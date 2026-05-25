# WORKSPACES.md — Contextos de Desenvolvimento

> Mapeamento dos workspaces do monorepo e seus contextos.
> Baseado em `pnpm-workspace.yaml` e estrutura de diretórios.

---

## Workspaces de Aplicação (`apps/*`)

### `@cryptobingo/api-gateway`
**Path:** `apps/api-gateway/`
**Porta:** 8083
**Tecnologia:** Express, Mongoose, pg, TypeScript
**Propósito:** API REST para perfis, autenticação JWT, geração de cartelas assinadas, rotas administrativas
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/api-gateway dev   # ts-node-dev com hot-reload
pnpm --filter @cryptobingo/api-gateway build # compilar para dist/
```

### `@cryptobingo/frontend`
**Path:** `apps/frontend/`
**Porta:** 5173
**Tecnologia:** React 18, Vite, WharfKit, i18next, TypeScript
**Propósito:** Interface do jogador — login, lobby, dashboard, compra de cartelas
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/frontend dev  # Vite dev server
pnpm --filter @cryptobingo/frontend build
```

### `@cryptobingo/worker-game-loop`
**Path:** `apps/worker-game-loop/`
**Tecnologia:** Node.js, amqplib, WharfKit, TypeScript
**Propósito:** Worker autônomo que orquestra o ciclo de vida dos jogos — lockgame, startdraw, claimwin, bitmasking evaluator
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/worker-game-loop dev   # ts-node-dev
pnpm --filter @cryptobingo/worker-game-loop start # produção
```

### `@cryptobingo/harness`
**Path:** `apps/harness/`
**Tecnologia:** Node.js, Jest, ts-jest, TypeScript
**Propósito:** Scripts de bootstrap (deploy de contratos + tokens) e testes de integração FSM
**Dependências internas:** `@cryptobingo/shared-types`, `@cryptobingo/blockchain-core`
**Scripts:**
```bash
pnpm --filter @cryptobingo/harness bootstrap  # setup do ambiente local
pnpm --filter @cryptobingo/harness test       # testes de FSM
```

---

## Workspaces de Pacotes (`packages/*`)

### `@cryptobingo/shared-types`
**Path:** `packages/shared-types/`
**Tecnologia:** TypeScript (apenas tipos)
**Propósito:** Interfaces compartilhadas entre todos os workspaces — tipos on-chain (BlockchainGameState, BlockchainTicketRecord, BlockchainBalance), modelos PostgreSQL (User, TransactionLedger), modelos MongoDB (UserProfile, ChatMessage), tipos de suporte (GameStatus, ExtendedAsset, SupportedLocale)
**Dependências internas:** Nenhuma
**Importante:** Fonte única da verdade para tipos — qualquer alteração no ABI, tabelas C++ ou schemas de banco deve ser espelhada aqui

### `@cryptobingo/blockchain-core`
**Path:** `packages/blockchain-core/`
**Tecnologia:** TypeScript, @wharfkit/antelope
**Propósito:** Cliente RPC Antelope encapsulado — `fetchGame()`, `fetchPlayerTickets()`, `fetchPlayerBalance()`, `rpcClient` singleton
**Dependências internas:** `@cryptobingo/shared-types`

---

## Contextos Transversais

### Infraestrutura
**Path:** `infra/`
**Arquivos:** `prometheus/prometheus.yml`
**Propósito:** Configuração de serviços de observabilidade
**Comandos:**
```bash
docker compose up -d                    # sobe toda a infra
docker compose logs -f [service]        # logs de um serviço
docker compose down -v                  # destrói tudo (cuidado: perde dados)
```

### Smart Contracts
**Path:** `contracts/`
**Tecnologia:** C++ (EOSIO CDT)
**Contratos:**
- `bingo/` — contrato principal do jogo (bingo.hpp, bingo.cpp)
- `bingo/src/orng_mock.cpp` — mock do oráculo WAX
**Comandos:**
```bash
cd contracts/bingo
cdt-cpp -abigen -o bingo.wasm src/bingo.cpp -I include/
```

### Documentação
**Path:** `docs/`
**Arquivos principais:**
- `MASTER-PROMPT.md` — arquitetura cognitiva
- `PROJECT-DETAILS.md` — contexto do projeto
- `SPEC.md` — especificação mestre (fonte da verdade)
- `architecture.md` — diagramas Mermaid
- `COMPLIANCE.md` — conformidade legal
- `openapi.yaml` — contrato REST
- `asyncapi.yaml` — contrato de eventos
- `adr/` — Architecture Decision Records
- `governance/` — sistema multi-agente

### Raiz do Monorepo
**Arquivos de configuração:**
- `package.json` — scripts globais (`pnpm dev`, `pnpm build`, `pnpm test`)
- `turbo.json` — orquestração de build
- `pnpm-workspace.yaml` — definição dos workspaces
- `tsconfig.json` — base de TypeScript
- `docker-compose.yml` — infraestrutura completa
- `.env.infra` — credenciais de infraestrutura (não committed)
- `TASKS.md` — backlog do projeto
- `TODO.md` — tarefas imediatas em andamento
- `TRACE.md` — registro de atividades e debug

---

## Mapa de Dependências entre Workspaces

```
@cryptobingo/shared-types (tipos base)
    ↑
@cryptobingo/blockchain-core (cliente RPC)
    ↑
    ├── @cryptobingo/api-gateway (Express)
    ├── @cryptobingo/frontend (React)
    ├── @cryptobingo/worker-game-loop (Worker)
    └── @cryptobingo/harness (Testes)
```

**Regra de dependência:** `turbo.json` garante que `build` de dependências executa antes do `build` do dependente.
