# Documentação de Arquitetura e Fluxos do Sistema

**Domínio:** Plataforma Descentralizada de Bingo GameFi
**Padrão de Diagramação:** Mermaid.js (Diagrams-as-Code)

Este documento centraliza a representação visual dos fluxos de dados, da infraestrutura e da máquina de estados do Smart Contract. Serve como mapa de navegação entre On-chain (Antelope/WAX) e Off-chain (Node.js/React monorepo).

---

## 1. Topologia Macro e Infraestrutura Híbrida (CQRS)

O sistema utiliza CQRS. Operações financeiras ocorrem on-chain (Command). Leitura, resolução algébrica e eventos em tempo real ocorrem off-chain (Query/Stream).

```mermaid
graph TD
    %% Atores e Clientes
    Player[📱 Frontend React]
    CloudWallet[☁️ WAX Cloud Wallet]

    %% Camada Off-chain (Monorepo pnpm)
    subgraph "Off-chain (Monorepo pnpm)"
        APIGateway[🌐 api-gateway\nExpress + TS + JWT]
        Worker[⚙️ worker-game-loop\nResolução + Orquestração]
        Broadcaster[📡 Broadcaster\nSocket.io WS Events]
        Redis[(🗄️ Redis\nÍndice Invertido + Cache)]
        Mongo[(🗄️ MongoDB\nEdge Data + PrizeTx)]
    end

    %% Camada Blockchain (Antelope/WAX)
    subgraph "Blockchain WAX (Imutável)"
        Contract[📜 Smart Contract\nbingo.cpp]
        Oracle[🎲 orng.wax\nOráculo RNG]
    end

    %% Conexões
    Player <-->|JWT Auth + API REST| APIGateway
    Player <-->|Socket.io Slow Reveal| Broadcaster
    Player -->|RPC get_table_rows| Contract

    APIGateway <-->|Leitura/Escrita| Mongo
    Worker <-->|Leitura| Mongo
    Worker <-->|Índice Invertido| Redis
    Broadcaster <-->|Pub/Sub| Redis

    Worker -->|Transações Wharfkit| Contract
    Oracle -->|Callback RNG| Contract
```

---

## 2. Máquina de Estados Finita (FSM) do Smart Contract

A FSM do contrato C++ é estritamente linear e bloqueante. Validações de estado impedem ações fora de ordem temporal.

```mermaid
stateDiagram-v2
    [*] --> CREATED: creategame()\n[Admin]

    CREATED --> FUNDING: fundgame()\n[bingogamesvc]
    note right of FUNDING
        buytickets() liberado.
        Cartelas alocadas em lote na RAM.
    end note

    FUNDING --> LOCKED: lockgame()\n[bingogamesvc]
    note left of LOCKED
        Vendas encerradas.
        Worker indexa Redis (Índice Invertido).
    end note

    LOCKED --> DRAWING: startdraw()\n[bingogamesvc → orng.wax]
    note right of DRAWING
        Requisição de entropia enviada.
        Aguardando receiverand().
    end note

    DRAWING --> DRAWN: receiverand()\n[orng.wax Oracle]
    note right of DRAWN
        75 dezenas recebidas.
        Worker inicia Slow Reveal.
    end note

    DRAWN --> PAYING: claimwin()\n[bingogamesvc - first call]
    PAYING --> ARCHIVED: closegame()\n[bingogamesvc]

    LOCKED --> ABORTED: abortgame()\n[bingogamesvc / Admin]
    DRAWING --> ABORTED: abortgame()\n[timeout orng.wax]

    ARCHIVED --> [*]: cleargame()\n[após 24h — libera RAM]
    ABORTED --> [*]: cleargame()\n[imediato — após refundall]
```

---

## 3. Diagrama de Sequência: Jogo Completo + Prize Pipeline

Fluxo do início da partida ao painel de premiação com 3 estados de pagamento.

```mermaid
sequenceDiagram
    autonumber
    actor Player as 📱 Frontend (React)
    participant APIGateway as 🌐 API Gateway
    participant Worker as ⚙️ Worker Game Loop
    participant Redis as 🗄️ Redis
    participant Mongo as 🗄️ MongoDB
    participant Contract as 📜 Smart Contract
    participant Oracle as 🎲 WAX Oracle

    Note over Player, Contract: Fase 1: Compra de Cartelas
    Player->>APIGateway: POST /games/{id}/tickets/generate
    APIGateway-->>Player: Matrizes + Assinaturas ECDSA
    Player->>Contract: buytickets(matrices, signatures)
    Contract-->>Contract: Debita wallet interna, emplace tickets

    Note over Worker, Oracle: Fase 2: Sorteio e Entropia
    Worker->>Contract: lockgame()
    Worker->>Redis: Constrói Índice Invertido (ball→tickets)
    Worker->>Contract: startdraw()
    Contract->>Oracle: request_random()
    Oracle-->>Contract: receiverand(75 dezenas)

    Note over Player, Worker: Fase 3: Slow Reveal (3s/bola)
    loop A cada ~3 segundos
        Worker->>Redis: PUBLISH ball_drawn
        Redis-->>Player: WS Event ball_drawn
    end

    Note over Worker, Mongo: Fase 4: Prize Pipeline (ADR-038)
    Worker->>Worker: Evaluator detecta vencedores
    Worker->>Redis: PUBLISH winner_found{winType, winLabel}
    Redis-->>Player: WS Event → status "preparing"

    Worker->>Contract: claimwin/claimstage/claimcombo
    Worker->>Redis: PUBLISH prize_tx_sent{ticketId, winLabel}
    Redis-->>Player: WS Event → status "confirming"

    Worker->>Mongo: savePrizeTx{gameId, ticketId, txHash, amount}
    Worker->>Redis: PUBLISH prize_confirmed{ticketId, txHash, amount, currency}
    Redis-->>Player: WS Event → status "confirmed"

    Note over Player, Worker: Fase 5: Replay / Arquivo
    Player->>APIGateway: GET /games/{id}/prizes (se archived)
    APIGateway->>Mongo: Busca prizetxs do jogo
    APIGateway-->>Player: PrizeTx[] → hydratePrizeStatuses
```

---

## 4. Arquitetura Off-Chain (Monorepo)

### 4.1. Serviços

| Serviço | Diretório | Stack | Responsabilidade |
|---------|-----------|-------|------------------|
| **Frontend** | `apps/frontend/` | React 19 + Vite + TS + Vitest | UI do jogador/admin/sponsor. Slow Reveal, GameRoom, ReplayRoom. i18n pt/en/zh. |
| **API Gateway** | `apps/api-gateway/` | Express 5 + TS + Jest | REST API: auth JWT, tickets, rooms, admin, prizes. MongoDB leitura. |
| **Worker Game Loop** | `apps/worker-game-loop/` | Node + Wharfkit + Jest | Orquestração FSM, evaluator bitmask, payouts, prize persistence, RabbitMQ consumer. Redis inverted index. |
| **Broadcaster** | `apps/worker-game-loop/` (mesmo processo) | Socket.io + Redis Pub/Sub | Eventos WS em tempo real (ball_drawn, winner_found, prize_tx_sent, prize_confirmed). |
| **Harness E2E** | `apps/harness/` | Jest + Wharfkit | Testes on-chain contra nodeos real + oracle daemon. |
| **Landing Page** | `apps/landing-page/` | React Router v7 (SSG) + Vite | Landing page pública com SEO. API Functions em `api/`. |
| **Landing API** | `apps/landing-page/api/` | Azure Functions v4 (CJS) + Aiven PG | API serverless: stats, subscribe, ideas, votes. |
| **swap-ui (DEX)** | `apps/swap-ui/` | React + Vite + TS | DEX público BINGOGAMESWP: swap, liquidez, analytics. |
| **E2E UI** | `apps/e2e-ui/` | Cypress | Testes E2E visuais, Tier 1 (intercept) e Tier 2 (real). |
| **Chat** | `apps/chat/` | Serviço segregado | Chat em tempo real por sala. |

### 4.2. Persistência e Mensageria

| Sistema | Uso |
|---------|-----|
| **Redis** | Índice Invertido (game→ball→tickets), Cache de queries, Pub/Sub do Broadcaster |
| **MongoDB** | Dados off-chain: profiles, rooms_metadata, chat_messages, gametypes_metadata, prizetxs (ADR-038), buyintxs, nfts_cache |
| **RabbitMQ** | Filas assíncronas para drops (dropWorker), notificações |

### 4.3. Prize Pipeline (ADR-038)

Cadeia de 3 eventos WS + persistência MongoDB + API REST:

```
winner_found ──────► Frontend: "preparing"
    ↓ (executa tx on-chain)
prize_tx_sent ──────► Frontend: "confirming"
    ↓ (savePrizeTx MongoDB)
prize_confirmed ────► Frontend: "confirmed"  {txHash, amount, currency}
```

**Collections MongoDB:**

`prizetxs` — índice único `{gameId, ticketId, winLabel}`. Idempotência garantida.
`buyintxs` — índice único `{gameId, ticketId}`.

**API pública:** `GET /api/v1/games/{gameId}/prizes` → `{items: PrizeTx[], total, gameId}`

**Frontend:** `hydratePrizeStatuses` injeta dados da API em jogos arquivados (`isStaticFinalState`). Chave composta `ticket_id:winLabel`. Nunca sobrescreve WS ativo.

### 4.4. Observabilidade (Prometheus + Grafana)

Métricas do worker em `infra/grafana/dashboards/worker-game-loop.json`:
- `prize_payments_total`, `prize_payments_amount_total`
- `prize_pipeline_duration` (prepare/send/confirm)
- `prize_persist_total` (success/duplicate/error)
- `buyin_persisted_total`, `prize_rtp_ratio`

---

## 5. Modelo de Entidades — MongoDB

### Coleção: `profiles`

```json
{
  "_id": "ObjectId",
  "wallet_address": "jogador1.wax",
  "nickname": "CryptoKing",
  "avatar_nft_asset_id": "1099511627776",
  "preferences": {
    "locale": "pt-BR",
    "sound_enabled": true
  },
  "progression": {
    "xp": 4500,
    "tier": "Gold",
    "games_played": 142
  }
}
```

### Coleção: `chat_messages`

Índice TTL 7 dias.

```json
{
  "_id": "ObjectId",
  "room_id": "12345",
  "wallet_address": "jogador1.wax",
  "message": "Bingo!!",
  "is_sponsor_drop": false,
  "timestamp": "ISODate"
}
```

### Coleção: `prizetxs` (ADR-038)

Índice único composto: `{ gameId, ticketId, winLabel }`.

```json
{
  "_id": "ObjectId",
  "game_id": "1780000000001",
  "ticket_id": "abc123def456",
  "win_type": "stage",
  "win_label": "stage_1",
  "account": "jogador1",
  "transaction_id": "abc123...",
  "amount": "125.0000",
  "currency": "WAX",
  "status": "confirmed"
}
```

### Coleção: `buyintxs` (ADR-038)

Índice único composto: `{ gameId, ticketId }`.

```json
{
  "_id": "ObjectId",
  "game_id": "1780000000001",
  "ticket_id": "abc123def456",
  "account": "jogador1",
  "amount": "10.0000",
  "currency": "WAX"
}
```

### Coleção: `rooms_metadata`

```json
{
  "_id": "12345",
  "name": "Sala Platinum",
  "description": "Sala VIP com prêmios maiores",
  "chat_enabled": true,
  "auto_start_delay_sec": 30,
  "drops": [],
  "cover_image_url": "https://..."
}
```

### Coleção: `gametypes_metadata`

```json
{
  "_id": "ObjectId",
  "gametype_id": "1",
  "combinations": [...],
  "rules": [...]
}
```

### Coleção: `content` (ADR-037)

Índice composto: `{ type, slug }` — único.

```json
{
  "_id": "ObjectId",
  "type": "faq | howitworks | sponsors | tutorials | news",
  "slug": "como-jogar",
  "title": "Como Jogar",
  "format": "text | blocks",
  "content": "Conteúdo markdown ou BlockNote JSON",
  "locales": {
    "pt": { "title": "...", "content": "..." },
    "en": { "title": "...", "content": "..." },
    "zh": { "title": "...", "content": "..." }
  },
  "order": 1,
  "published": true,
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

### Coleção: `nfts_cache`

```json
{
  "_id": "ObjectId",
  "wallet_address": "jogador1.wax",
  "assets": [{
    "asset_id": "1099511627776",
    "schema_name": "credit_packs",
    "name": "Whale Pack",
    "backed_tokens": "10000.0000 BINGO"
  }],
  "last_synced": "ISODate"
}
```

---

## 6. Referências

| Documento | Descrição |
|-----------|-----------|
| `CLAUDE.md` | Guia do projeto, comandos, git flow |
| `docs/adr/ADR-038-prize-pipeline.md` | Prize pipeline completo |
| `docs/adr/ADR-013-multi-match.md` | Multi-match + seções de cartela |
| `docs/adr/ADR-014-game-orchestration.md` | Orquestração FSM |
| `docs/asyncapi.yaml` | Eventos WS (prize_tx_sent, prize_confirmed) |
| `docs/openapi.yaml` | API REST (GET /games/:gameId/prizes) |
| `docs/SPEC.md` | Especificação mestre (§1.8 Prize Pipeline, §7–14) |
| `docs/adr/ADR-037-content-crud.md` | Sistema de Conteúdo Unificado |
| `docs/adr/ADR-036-permission-system.md` | RBAC hierárquico |
| `docs/adr/ADR-028-gamification.md` | Gamificação (achievements, XP/level, tiers) |
| `docs/adr/ADR-039-landing-api.md` | Landing API (Azure Functions + Aiven PG) |

---

## 7. Sistema de Conteúdo Unificado (ADR-037)

### 7.1. API

`apps/api-gateway/src/controllers/contentController.ts` — CRUD genérico por tipo de conteúdo:

```mermaid
sequenceDiagram
    participant Admin as 👤 Admin
    participant API as 🌐 API Gateway
    participant Redis as 🗄️ Redis
    participant Mongo as 🗄️ MongoDB

    Admin->>API: POST /content/faq {title, content, locale}
    API->>Mongo: Insert + auto-translate pt/en/zh
    API->>Redis: DEL cache:content:faq
    API-->>Admin: 201 Created

    Note over Admin, Mongo: Leitura pública (cache 2min)
    Player->>API: GET /content/tutorials
    API->>Redis: Cache hit? → return | miss → Mongo
    API-->>Player: ContentItem[]
```

### 7.2. Frontend

| Componente | Caminho | Função |
|------------|---------|--------|
| `ContentPage.tsx` | `apps/frontend/src/pages/` | Renderiza conteúdo por tipo (rota `/tutorials`, `/how-it-works`, `/faq`) |
| `BlockContent.tsx` | `apps/frontend/src/components/` | Renderiza BlockNote blocks em modo leitura |
| `ContentAdmin.tsx` | `apps/frontend/src/admin/` | CRUD com BlockNote editor, translation review UI |

---

## 8. Sistema de Permissões / RBAC (ADR-036)

### 8.1. Hierarquia

Wildcard-based: `admin.*` > `admin.content.*` > `admin.content.<type>.*`.

### 8.2. Controllers

| Controller | Função |
|------------|--------|
| `permissionController.ts` | CRUD de permissões por usuário |
| `sponsorPermissionController.ts` | Delegações sponsor com prevenção de escalação |

### 8.3. Modelos MongoDB

- `SponsorOrg` — organizações sponsor com membros e papéis
- `SponsorDelegation` — delegações de ações entre contas

### 8.4. Auditoria

`utils/audit.ts` — toda mudança de permissão registrada com actor, timestamp e diff.

---

## 9. Gamificação (ADR-028)

### 9.1. Arquitetura

```mermaid
graph LR
    Worker[⚙️ Worker] -->|achievementEngine.ts| Mongo[(🗄️ MongoDB)]
    Worker -->|xpEngine.ts| Mongo
    API[🌐 API Gateway] -->|GET /profile/achievements| Mongo
    Frontend[📱 Frontend] -->|AchievementModal.tsx| API
    Frontend -->|XP Bar| API
```

### 9.2. Componentes

| Componente | Stack | Função |
|------------|-------|--------|
| `achievementEngine.ts` | Worker | Detecta e desbloqueia achievements (29) |
| `xpEngine.ts` | Worker | Calcula XP, levels, tiers, daily streak |
| `AchievementModal.tsx` | Frontend | Modal de achievements do jogador |
| `GET /profile/achievements` | API | Lista achievements + progresso |
| `GET /profile/xp` | API | XP atual, level, tier, streak |

### 9.3. Categorias de Achievement

`first_win` · `win_10/50/100` · combos · compras · partidas · `streak_7/14/30` · burns · golden_win · stage_win · tiers

### 9.4. XP / Level

Fórmula Fibonacci (`PHI = 1.618034`, `BASE_XP = 906`, `MAX_LEVEL = 225`). 9 tiers: Cobre → Bronze → Prata → Ouro → Platina → Esmeralda → Safira → Rubi → Diamante.

### 9.5. Streak

`xpEngine.ensureDailyStreak()` — tracking dias consecutivos. Bônus = `streakCount × 2`. Reset se pular 1 dia.

---

## 10. Landing API (ADR-039 — Azure Functions)

### 10.1. Stack

| Componente | Detalhe |
|------------|---------|
| Runtime | Azure Functions v4 (Consumption, Node 22) |
| Código | `apps/landing-page/api/` |
| Banco | Aiven PostgreSQL (free tier, Frankfurt) |
| Domínio | `landing-api.cryptobingo.bet` (Cloudflare proxy) |

### 10.2. Endpoints

`GET /api/stats` · `POST /api/subscribe` · `POST /api/ideas` · `POST /api/votes` · Admin CRUD

### 10.3. Problemas Conhecidos

- **ESM não funciona** no Functions v4 — CJS obrigatório
- **pnpm symlinks** corrompem deploy — npm install limpo no `/tmp/fa-prod`
- **Aiven SSL:** configurar `ssl: { rejectUnauthorized: false }` no Pool (não `sslmode=require` na URL)

---

## 11. swap-ui — DEX BingoGameSWP

`apps/swap-ui/` — React + Vite + TS. DEX público para o token BINGOGAMESWP.

| Funcionalidade | Descrição |
|---------------|-----------|
| Swap | Troca entre tokens (WAX ↔ BINGOGAMESWP) |
| Liquidez | Add/remove liquidez em pools |
| Analytics | Volume, TVL, preço histórico |

Deploy: Azure Static Web Apps, domínio `test-swap.cryptobingo.bet`. CI/CD incluso na matriz GHCR.

---

## 12. Chat em Tempo Real

Serviço segregado em `apps/chat/`. Componente frontend `RoomChat.tsx`.

### Eventos WS

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `chat:message` | S→C | Mensagem de texto |
| `chat:sponsor_drop` | S→C | Notificação de drop |
| `send_chat_message` | C→S | Envio de mensagem |

Persistência: MongoDB `chat_messages` com TTL 7 dias.

---

## 13. E2E de UI (Cypress — ADR-017)

`apps/e2e-ui/` — testes visuais em 2 tiers:

| Tier | Estratégia | Gatilho |
|------|-----------|---------|
| **Tier 1** | `cy.intercept` + fixtures (sem WAX) | PR-gate |
| **Tier 2** | Stack completo (`docker compose` + `init_dev_env.sh`) | Nightly/manual |

Auth via `cy.devLogin(role)`. Seletores exclusivamente por `data-testid`. Modelo em camadas: **Tier 1 → PR** · **Tier 2 → stack real**.
