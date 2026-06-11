# CryptoBingo

Plataforma de BINGO GameFi on-chain na rede **WAX/Antelope**. Modelo Web2.5: UX de Web2 com liquidação financeira on-chain, sorteio verificável por oráculo e token nativo BINGO.

**Economia:** RTP 85% / GGR 15% · **Contratos:** `bingogamectr` · `bingogametkn` · `bingogameswp`

---

## Apps

| App | Porta | Descrição |
|---|---|---|
| `apps/frontend` | 5173 | Interface do jogador — Lobby, salas ao vivo, replay, histórico |
| `apps/swap-ui` | 5174 | DEX público `bingogameswp` — swap, liquidez, analytics |
| `apps/api-gateway` | 3000 | REST API — auth JWT, tickets, salas, estatísticas, vault |
| `apps/worker-game-loop` | — | Worker autônomo — orquestração do ciclo de vida dos jogos |
| `apps/harness` | — | Testes E2E on-chain contra nodeos real |
| `apps/e2e-ui` | — | Testes E2E de UI com Cypress (Tier 1 determinístico + Tier 2 real) |

## Packages

| Pacote | Descrição |
|---|---|
| `packages/shared-types` | Tipos TypeScript espelhando structs do contrato |
| `packages/blockchain-core` | Cliente RPC Wharfkit compartilhado |

## Contratos

| Conta | Contrato | Descrição |
|---|---|---|
| `bingogamectr` | `contracts/bingo/` | Contrato principal — FSM de jogo, tickets, prêmios |
| `bingogametkn` | — | Token BINGO (eosio.token padrão) |
| `bingogameswp` | `contracts/swap/` | DEX AMM x·y=k com taxa de serviço por pool |

---

## Início Rápido

### Pré-requisitos

- Docker + Docker Compose
- Node.js ≥ 20 · pnpm ≥ 9
- (opcional para harness) container `bingo_waxdev` com `cdt-cpp`

### 1. Subir o ambiente local

```bash
./init_dev_env.sh
```

Isso cria o container WAX, deploya os contratos, cria as contas de teste, sobe todos os serviços Docker (MongoDB, PostgreSQL, RabbitMQ, Redis, Prometheus, Grafana) e inicia o oracle daemon.

Para reset completo (zera a chain):

```bash
./init_dev_env.sh --reset
```

### 2. Instalar dependências

```bash
pnpm install
```

### 3. Rodar os apps em desenvolvimento

```bash
# Game frontend (porta 5173)
pnpm --filter @cryptobingo/frontend dev

# Swap DEX (porta 5174)
pnpm --filter @cryptobingo/swap-ui dev

# API Gateway
pnpm --filter @cryptobingo/api-gateway dev

# Worker
pnpm --filter @cryptobingo/worker-game-loop dev
```

### 4. Testes

```bash
# Todos os pacotes
pnpm test

# Por pacote
pnpm --filter @cryptobingo/frontend test
pnpm --filter @cryptobingo/swap-ui test
pnpm --filter @cryptobingo/api-gateway test
pnpm --filter @cryptobingo/worker-game-loop test

# E2E on-chain (requer nodeos + oracle daemon vivos)
cd apps/harness && node run-tests.js

# E2E de UI — Tier 1 (determinístico, sem WAX)
pnpm --filter @cryptobingo/e2e-ui e2e
```

### 5. Typecheck

```bash
# Frontend / swap-ui
npx tsc --noEmit  # (dentro do app)

# API Gateway / Worker
npx tsc --project tsconfig.build.json --noEmit
```

---

## Arquitetura

```
WAX Blockchain  ←──────────────────────────────────────────────┐
bingogamectr               Worker (RabbitMQ consumer)           │
bingogameswp               ├─ lockgame / startdraw / claimwin   │
bingogametkn               └─ evaluator O(1) + payouts          │
     ↑                                                           │
     │  Wharfkit                API Gateway (Express/JWT)        │
     │                         ├─ /auth (challenge-response)     │
Frontend ←── WebSocket ───────── /tickets/generate (ECDSA)      │
(React)       Broadcaster        /rooms · /swap · /vault ────────┘
Swap UI ──── REST ──────────────  MongoDB · PostgreSQL · Redis
```

Decisões arquiteturais completas em [`docs/adr/`](docs/adr/).
Spec técnica em [`docs/SPEC.md`](docs/SPEC.md).
Topologia Kubernetes em [`docs/architecture.md`](docs/architecture.md).

---

## ADRs Principais

| ADR | Decisão |
|---|---|
| [ADR-001](docs/adr/ADR-001-assinatura-contextual.md) | Assinatura ECDSA contextual anti-replay em tickets |
| [ADR-005](docs/adr/ADR-005-fixed-odds-treasury.md) | RTP 85% / GGR 15% com `max_weight` |
| [ADR-006](docs/adr/ADR-006-jwt-auth-assinatura-carteira.md) | Auth JWT com challenge assinado pela carteira WAX |
| [ADR-010](docs/adr/ADR-010-rooms-salas.md) | Salas persistentes com agendamento automático |
| [ADR-012](docs/adr/ADR-012-draw-modes.md) | Draw modes: standard / fixed / firstfull / goldenball / multimatch |
| [ADR-016](docs/adr/ADR-016-combinacoes-onchain.md) | Combinações on-chain com `binary_extension` |
| [ADR-018](docs/adr/ADR-018-bingo-swap.md) | AMM DEX `bingogameswp` (x·y=k, allowlist de tokens) |
| [ADR-021](docs/adr/ADR-021-multicurrency-checkout.md) | Checkout multi-moeda via swap na compra de tickets |
| [ADR-022](docs/adr/ADR-022-swap-ui.md) | App React DEX público (`apps/swap-ui`) |
| [ADR-023](docs/adr/ADR-023-contas-mainnet.md) | Mapeamento de contas WAX mainnet |

---

## Variáveis de Ambiente

Copie e ajuste:

```bash
cp apps/frontend/.env.example        apps/frontend/.env
cp apps/swap-ui/.env.example         apps/swap-ui/.env
cp apps/api-gateway/.env.example     apps/api-gateway/.env
cp apps/worker-game-loop/.env.example apps/worker-game-loop/.env
```

Variáveis críticas:

| Variável | Descrição |
|---|---|
| `VITE_WAX_RPC_URL` | Endpoint nodeos (dev: `http://127.0.0.1:8888`) |
| `VITE_CHAIN_ID` | Chain ID WAX (mainnet ou devnet) |
| `CONTRACT_ACCOUNT` | Conta do contrato de jogo (`bingogamectr`) |
| `CONTRACT_PRIVATE_KEY` | Chave ativa de `bingogamectr` |
| `VITE_SWAP_URL` | URL do app swap (liga bidirecional frontend ↔ swap-ui) |
| `VITE_GAME_URL` | URL do game app (liga bidirecional swap-ui ↔ frontend) |

---

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

Proprietário. Todos os direitos reservados.
