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
| `apps/landing-page` | — | Landing page institucional (SSG React Router v7) + API Functions |

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
| [ADR-002](docs/adr/ADR-002-arquitetura-offchain-tokenomics.md) | Arquitetura off-chain, persistência poliglota e tokenomics via INO |
| [ADR-003](docs/adr/ADR-003-oraculo-sorteio-rng.md) | Oráculo de sorteio e RNG (RSA-SHA256) |
| [ADR-004](docs/adr/ADR-004-dynamic-bitmask-rules.md) | Dynamic bitmasking para padrões de vitória |
| [ADR-005](docs/adr/ADR-005-fixed-odds-treasury.md) | RTP 85% / GGR 15% com `max_weight` |
| [ADR-006](docs/adr/ADR-006-jwt-auth-assinatura-carteira.md) | Auth JWT com challenge assinado pela carteira WAX |
| [ADR-007](docs/adr/ADR-007-slow-reveal-websocket-broadcaster.md) | Slow reveal — WebSocket broadcaster e protocolo de sincronização |
| [ADR-008](docs/adr/ADR-008-fsm-completa-campaigns-gc.md) | FSM completa — estado CREATED, campanhas B2B e garbage collection |
| [ADR-009](docs/adr/ADR-009-admin-panel.md) | Admin panel — arquitetura de interface administrativa |
| [ADR-010](docs/adr/ADR-010-rooms-salas.md) | Salas persistentes com agendamento automático |
| [ADR-011](docs/adr/ADR-011-drop-vault.md) | Drop vault — rastreamento on-chain de ativos para drops |
| [ADR-012](docs/adr/ADR-012-draw-modes.md) | Draw modes: standard / fixed / firstfull / goldenball / multimatch |
| [ADR-013](docs/adr/ADR-013-multi-match.md) | Modo de sorteio MULTI_MATCH — estágios progressivos |
| [ADR-014](docs/adr/ADR-014-game-orchestration.md) | Orquestração de partida — slow reveal como gate do avaliador |
| [ADR-015](docs/adr/ADR-015-client-side-routing.md) | Roteamento client-side baseado em URL |
| [ADR-016](docs/adr/ADR-016-combinacoes-onchain.md) | Combinações on-chain com `binary_extension` |
| [ADR-017](docs/adr/ADR-017-e2e-ui-cypress.md) | Testes E2E de UI com Cypress (estratégia em camadas) |
| [ADR-018](docs/adr/ADR-018-bingo-swap.md) | AMM DEX `bingogameswp` (x·y=k, allowlist de tokens) |
| [ADR-019](docs/adr/ADR-019-swap-service-fee.md) | Taxa de serviço por pool no swap (`service_fee_bps`) |
| [ADR-020](docs/adr/ADR-020-motor-calibracao-unificado.md) | Motor de calibração e sugestão unificado (backend) |
| [ADR-021](docs/adr/ADR-021-multicurrency-checkout.md) | Checkout multi-moeda via swap na compra de tickets |
| [ADR-022](docs/adr/ADR-022-swap-ui.md) | App React DEX público (`apps/swap-ui`) |
| [ADR-023](docs/adr/ADR-023-contas-mainnet.md) | Mapeamento de contas WAX mainnet |
| [ADR-024](docs/adr/ADR-024-rankings-conteudo.md) | Rankings & conteúdo (leaderboard, FAQ, news) |
| [ADR-025](docs/adr/ADR-025-traducao-hibrida.md) | Serviço de tradução automática híbrido |
| [ADR-026](docs/adr/ADR-026-modelo-permissoes-eosio.md) | Modelo de permissões EOSIO: `bingogamectr@admin` |
| [ADR-027](docs/adr/ADR-027-atomicassets-dev-local.md) | Ambiente local AtomicAssets para dev/harness |
| [ADR-028](docs/adr/ADR-028-nft-mechanics-engine.md) | Motor de mecânicas NFT (gamificação) |
| [ADR-029](docs/adr/ADR-029-shadcn-ui-adocao-frontend.md) | Adoção de ShadCN/ui no frontend |
| [ADR-030](docs/adr/ADR-030-arquitetura-componentes-gameroom.md) | Arquitetura de componentes da GameRoom |
| [ADR-031](docs/adr/ADR-031-ux-palco-sorteio.md) | UX do palco de sorteio (GameRoom fase 1) |
| [ADR-032](docs/adr/ADR-032-presenca-reacoes-socket.md) | Presença, reações e feed de eventos no Socket.IO |
| [ADR-033](docs/adr/ADR-033-refatoracao-replayroom-componentes.md) | Refatoração do ReplayRoom (componentes + TDD + estatísticas globais) |
| [ADR-034](docs/adr/ADR-034-auth-persistencia-deep-links.md) | Persistência JWT + re-auth silencioso para deep links |
| [ADR-035](docs/adr/ADR-035-infra-azure-cd-testnet.md) | Infraestrutura Azure (free tier) + CD pipeline para testnet |
| [ADR-036](docs/adr/ADR-036-permission-system.md) | RBAC+Perms: permissões granulares + delegação sponsor |
| [ADR-037](docs/adr/ADR-037-sistema-conteudo-unificado.md) | Sistema de conteúdo unificado + user settings |
| [ADR-038](docs/adr/ADR-038-prize-pipeline.md) | Prize pipeline: persistência, WebSocket e frontend |
| [ADR-039](docs/adr/ADR-039-landing-api-standalone.md) | Landing page API: migração para Function App standalone + Aiven |

---

## Features Implementadas (além do contrato principal)

- **Prize Pipeline (ADR-038):** Persistência de prêmios (PrizeTx, BuyInTx) + WebSocket (preparing/confirming/confirmed) + API REST
- **Content CRUD (ADR-037):** Sistema de conteúdo editorial unificado (FAQ, HowItWorks, Sponsors, Tutorials, News) com BlockNote editor e tradução automática
- **Permission System (ADR-036):** RBAC com sponsor orgs, delegações e prevenção de escalação
- **Gamificação (ADR-028):** 29 achievements, daily streak XP bonus, 9 tiers (Cobre→Diamante), 225 níveis
- **Chat em tempo real (`apps/chat/`):** Socket.io com @mentions, drag/resize e persistência
- **Landing Page (ADR-039):** SSG React Router v7 + TinaCMS (TinaCloud) + Azure Function App standalone
- **Admin UI:** 13 componentes (ContentAdmin com BlockNote, NftAdmin, GametypesAdmin, etc)

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
