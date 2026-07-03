# SPEC.md: Especificação Mestre de Arquitetura e Regras de Negócios

**Domínio:** Plataforma Descentralizada de Bingo GameFi
**Rede Alvo:** Antelope (WAX)
**Padrões Arquiteturais:** Spec-Driven Development (SDD), CQRS, Event-Driven Architecture (EDA), Bitmasking Algébrico.
**Última revisão:** 2026-06-30 — ADR-010 (Rooms), ADR-011 (Drop Vault), ADR-012 (Draw Modes), ADR-013 (Multi-Match), ADR-014 (Orchestration), ADR-015 (Routing), ADR-038 (Prize Pipeline).

---

## 1. Topologia de Dados On-Chain (Smart Contract RAM)

A máquina de estados e o armazenamento financeiro utilizam os tipos primitivos estritos do C++ (CDT). O gerenciamento de múltiplas moedas exige obrigatoriamente `extended_asset` para proteção contra falsificação de contratos emissores.

### 1.1. Tabela: `balances` (Wallet Interna)

Gerencia custódia fracionada e multimoeda dos jogadores com complexidade $O(1)$.

* **Scope:** `account_name` (instanciada individualmente por usuário).
* **Primary Key:** `symbol_code` (ticker da moeda, ex: `WAX`, `BINGO`).

| Campo | Tipo CDT | Restrições / Notas |
|---|---|---|
| `balance` | `extended_asset` | Valor, símbolo e conta emissora. Rejeita assertivamente `amount < 0`. |

---

### 1.2. Tabela: `games` (Máquina de Estados — FSM)

Controla o ciclo de vida de cada rodada e o armazenamento da entropia (RNG).

* **Scope:** `_self` (Global do Contrato).
* **Primary Key:** `game_id` (`uint64_t`, auto-incremental, valor = timestamp Unix em ms).
* **Secondary Index:** `byroom` — filtro por `room_id` para `roomManager`.

**FSM de Estados (ADR-008, ADR-012):**

```
CREATED → FUNDING → LOCKED → DRAWING → DRAWN → PAYING → ARCHIVED
                                              ↘ ABORTED (fail-safe)
```

* `PAYING` — estado intermediário introduzido em ADR-012 para suportar múltiplos vencedores sem race condition. `claimwin` aceita `DRAWN | PAYING`; na primeira chamada (`DRAWN`) transita para `PAYING`.
* `closegame` (auth: `bingogamesvc`) — transita `PAYING | DRAWN → ARCHIVED`.

| Campo | Tipo CDT | Restrições / Notas |
|---|---|---|
| `game_id` | `uint64_t` | Identificador unívoco (timestamp ms). |
| `status` | `name` | FSM: `created`, `funding`, `locked`, `drawing`, `drawn`, `paying`, `archived`, `aborted`. |
| `ticket_price` | `extended_asset` | Valor unitário. Permite `0` para Free-to-Play. |
| `total_wagered` | `extended_asset` | Arrecadação total da venda de cartelas. |
| `sponsor_pool` | `vector<extended_asset>` | Array de N tokens patrocinados (B2B). |
| `drawn_balls` | `vector<uint8_t>` | 75 posições. Vazio até `receiverand`. |
| `end_time` | `time_point_sec` | Timestamp de encerramento. Base para TTL de 24h do GC. |
| `room_id` | `uint64_t` | FK para tabela `rooms`. `0` = jogo avulso (legado). |
| `gametype_id` | `uint64_t` | FK para tabela `gametypes`. `0` = legado RTP 85%. |
| `campaign_id` | `uint64_t` | FK para tabela `campaigns`. `0` = sem patrocínio B2B. |
| `golden_ball_num` | `uint8_t` | Número da bola dourada (modo `goldenball`, ADR-012). `0` = inativo. |
| `golden_multiplier` | `uint16_t` | Multiplicador da bola dourada (hundredths). |

---

### 1.3. Tabela: `tickets` (Índice de Cartelas)

* **Scope:** `game_id` (isolamento por rodada, facilita GC em lote).
* **Primary Key:** `ticket_id` (`uint64_t`, gerado pelo Backend off-chain, único por rodada).
* **Secondary Index:** `byowner` (`uint64_t` cast de `name`) — varredura $O(n)$ para refunds e histórico do jogador.

| Campo | Tipo CDT | Restrições / Notas |
|---|---|---|
| `ticket_id` | `uint64_t` | Hash SHA-256 truncado — funciona como anti-replay. |
| `owner` | `name` | Conta pagadora e beneficiária. |
| `matrix` | `vector<uint8_t>` | 24 posições (índices 0–24 pulando o 12 = FREE SPACE). Valores em `[1, 75]`. |
| `price` | `extended_asset` | Preço real pago (ADR-010 — variable pricing por sala). |

---

### 1.4. Tabela: `campaigns` (Patrocínio B2B)

* **Scope:** `_self`.
* **Primary Key:** `campaign_id` (`uint64_t`).
* **Secondary Index:** `bysponsor` — filtro por conta do sponsor.

| Campo | Tipo CDT | Restrições / Notas |
|---|---|---|
| `sponsor` | `name` | Autorizador e destino de estornos. |
| `total_budget` | `extended_asset` | Liquidez travada total. |
| `payout_per_game` | `extended_asset` | Fração deduzida por `linkgame()`. |
| `leftover_policy` | `name` | `REFUND` (devolve ao sponsor) ou `HOUSE` (tesouraria). |

---

### 1.5. Tabela: `rooms` (Salas Persistentes — ADR-010)

Sala persistente que mantém configuração estável e cria automaticamente novas partidas ao final de cada rodada.

* **Scope:** `_self`.
* **Primary Key:** `room_id` (`uint64_t`).
* **Secondary Indexes:** `bysponsor`, `bystatus`, `bygametype`.

**FSM de Sala:** `inactive → active ⇌ paused → closed`

| Campo | Tipo CDT | Restrições / Notas |
|---|---|---|
| `room_id` | `uint64_t` | Identificador único. |
| `sponsor` | `name` | Dono da sala (pode ser `_self` para salas do sistema). |
| `gametype_id` | `uint64_t` | Regras de padrões e modos de sorteio. |
| `currency` | `extended_asset` | Moeda base da sala. |
| `ticket_price_min` | `extended_asset` | Preço mínimo de cartela. |
| `ticket_price_max` | `extended_asset` | Preço máximo de cartela. |
| `ticket_price_default` | `extended_asset` | Preço sugerido. |
| `weight` | `uint64_t` | Multiplicador de prêmio da sala (×100). |
| `max_tickets_per_player` | `uint32_t` | Limite por jogador por partida. |
| `current_game_id` | `uint64_t` | Partida ativa. `0` = sem jogo. |
| `nft_template_allowlist` | `vector<int32_t>` | Templates NFT com acesso à sala. |
| `room_drop_chance_bps` | `uint16_t` | Pré-check global de drop por partida (0–10000). |
| `status` | `name` | FSM: `inactive`, `active`, `paused`, `closed`. |
| `created_at` | `time_point_sec` | Timestamp de criação. |

**Metadata off-chain (MongoDB — `rooms_metadata`):** nome, descrição, `chat_enabled`, `auto_start_delay_sec`, `drops` (configuração de drops), `cover_image_url`.

**Auto-scheduling (roomManager.ts):** ao final de cada partida (`ARCHIVED` ou `ABORTED`), o worker aguarda `auto_start_delay_sec` e cria automaticamente a próxima partida via `creategame + fundgame`.

---

### 1.6. Tabelas de Drop Vault (ADR-011)

Sistema trustless para sponsors depositarem tokens/NFTs que são distribuídos como drops ao final de partidas.

**Tabela `dropdeposits`** — Scope: `_self`.

| Campo | Tipo CDT | Notas |
|---|---|---|
| `deposit_id` | `uint64_t` | PK auto-incremental (via `dropstate`). |
| `owner` | `name` | Sponsor depositante. |
| `asset_type` | `name` | `token` ou `nft`. |
| `quantity_original` | `extended_asset` | Quantidade depositada inicialmente. |
| `quantity_remaining` | `extended_asset` | Saldo disponível para drops. |
| `nft_asset_id` | `uint64_t` | ID do NFT (apenas para `asset_type == nft`). |
| `nft_template_id` | `int32_t` | Template do NFT. |
| `nft_collection` | `name` | Coleção AtomicAssets. |
| `status` | `name` | `deposited`, `active`, `draining`, `exhausted`, `reclaimed`. |
| `deposited_at` | `time_point_sec` | Timestamp de depósito. |

**Tabela `dropallocs`** — Scope: `_self`. Vincula depósitos a salas específicas.

| Campo | Tipo CDT | Notas |
|---|---|---|
| `alloc_id` | `uint64_t` | PK auto-incremental. |
| `deposit_id` | `uint64_t` | FK para `dropdeposits`. |
| `owner` | `name` | Sponsor dono da alocação. |
| `room_id` | `uint64_t` | FK para `rooms`. |
| `quantity_per_drop` | `extended_asset` | Quantidade distribuída por drop (tokens). |
| `drop_chance_bps` | `uint16_t` | Chance de drop por partida (1–10000, 100=1%). |
| `drops_executed` | `uint32_t` | Contador de drops realizados. |
| `status` | `name` | `active`, `deallocated`, `exhausted`. |

**Singleton `dropstate`** — Scope: `_self`. Mantém contadores globais do vault.

| Campo | Tipo CDT | Notas |
|---|---|---|
| `next_deposit_id` | `uint64_t` | Próximo ID de depósito. |
| `next_alloc_id` | `uint64_t` | Próximo ID de alocação. |
| `player_base_chance_bps` | `uint16_t` | Chance base por jogador (default 5000 = 50%). |

**Fluxo de Drop (3 fases — `dropWorker.ts`):**
1. **Fase 0:** verifica `room.room_drop_chance_bps` (sorteio aleatório por partida).
2. **Fase 1A/1B:** seleciona NFT ou tokens elegíveis dentre as alocações ativas; Fisher-Yates para desempate.
3. **Fase 2:** seleciona vencedor dentre os winners da partida ponderado por `player_base_chance_bps`; executa `execdrop` on-chain.

---

### 1.7. Tabelas de Gametypes e Padrões (ADR-004)

**Tabela `patterns`** — Scope: `_self`. Padrões de vitória globais (bitmask 25 bits, column-major).

**Tabela `gametypes`** — Scope: `_self`. Configura regras de padrões, draw mode e máximo de bolas.

| Campo | Tipo CDT | Notas |
|---|---|---|
| `gametype_id` | `uint64_t` | PK. |
| `name` | `string` | Nome do game type. |
| `base_multiplier` | `uint64_t` | Multiplicador base de prêmio. |
| `max_balls` | `uint8_t` | Número máximo de bolas a sortear. |
| `draw_mode` | `name` | `standard`, `fixed`, `firstfull`, `goldenball`, `multimatch`. |
| `rules` | `vector<pattern_rule>` | Array de `{pattern_id, weight}` (weight em hundredths). |

**Modos de Sorteio (ADR-012):**

| Modo | Comportamento |
|---|---|
| `standard` | Sorteia até `max_balls`; paga max-weight. |
| `fixed` | Alias de `standard` com `max_balls` explicitamente configurado. |
| `firstfull` | Sorteia até que 1+ cartelas completem o MASTER (cartela cheia). |
| `goldenball` | `max_balls` normais + 1 bola extra com multiplicador aleatório. |
| `multimatch` | Estágios progressivos por número de padrões cumpridos (ADR-013). |

### 1.8. Prize Pipeline (Persistência MongoDB — ADR-038)

Transações de prêmio são persistidas em MongoDB para consulta via API REST.

**Coleção `prizetxs`** — transações de prêmio pagas.

| Campo | Tipo | Notas |
|-------|------|-------|
| `game_id` | string | FK para jogo on-chain. |
| `ticket_id` | string | FK para cartela. |
| `win_type` | string | `pattern`, `combo`, `stage` |
| `win_label` | string | Rótulo único da vitória. Chave composta com ticket_id. |
| `account` | string | Conta WAX do vencedor. |
| `transaction_id` | string | Hash da transação on-chain. |
| `amount` | string | Valor do prêmio. |
| `currency` | string | Símbolo da moeda. |
| `status` | string | `confirmed` |

Índice único composto: `{ game_id, ticket_id, win_label }` — garante idempotência.

**Coleção `buyintxs`** — transações de compra de cartela.

Índice único composto: `{ game_id, ticket_id }`.

**Três eventos WS (cadeia preparing → confirming → confirmed):**

| Evento | Frontend status | Momento |
|--------|----------------|---------|
| `winner_found` | `preparing` | Vencedor detectado pelo evaluator. |
| `prize_tx_sent` | `confirming` | Transação on-chain submetida. |
| `prize_confirmed` | `confirmed` | MongoDB persistiu o prêmio. |

`win_label` opcional nos eventos — usado como chave composta `ticket_id:winLabel` p/ MULTI_MATCH.

**API pública:** `GET /api/v1/games/{gameId}/prizes` → `{ items: PrizeTx[], total, gameId }`

---

## 2. Interface Binária de Aplicação (ABI) e Assinaturas

### 2.1. Compra de Cartelas

* **Assinatura:** `buytickets(name buyer, uint64_t game_id, bytes[] matrices, signature[] signatures, extended_asset requested_price, uint64_t nft_id)`
* **Auth Exigido:** `buyer@active`
* **Fluxo:**
  1. Valida `game.status == "funding"` e limites da sala (`max_tickets_per_player`).
  2. Verifica `requested_price` dentro do range `[room.ticket_price_min, room.ticket_price_max]`.
  3. Se `nft_id != 0`, aplica desconto via tabela `nftconfigs`.
  4. Deduz `matrices.size() × requested_price` de `balances[buyer]`.
  5. Para cada cartela: valida assinatura ECDSA K1 (`assert_recover_key`) contra `config.signer_key`.
  6. Hash SHA-256 da cartela = `ticket_id` (anti-replay).
  7. `emplace` em lote em `tickets` com o `price` real pago.

**Pré-requisito:** `setconfig(public_key)` com a chave pública do microserviço — executado pelo `init_dev_env.sh §8b`.

---

### 2.2. Liquidação de Prêmios (Max Weight Payout)

* **Assinatura:** `claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask, uint16_t golden_multiplier)`
* **Auth Exigido:** `bingogamesvc@active`
* **Estados aceitos:** `drawn | paying` — na primeira chamada (`drawn`), transita para `paying`.
* **Cálculo (gametype, `gametype_id > 0`):**

$$Prize = ticket\_price \times base\_multiplier \times \frac{win\_weight}{100} \times golden\_multiplier$$

* **Cálculo (legado, `gametype_id == 0`):**

$$Prize = \frac{prize\_pool \times 85}{100}$$

* **Distribuição:** credita em `balances[owner]`; itera `sponsor_pool` creditando integralmente cada `extended_asset` (multidrop B2B).

---

### 2.3. Encerramento e Estágios (ADR-012/013)

* **`closegame(uint64_t game_id)`** — Auth: `bingogamesvc@active`. Transita `paying | drawn → archived`. Chamado após todos os `claimwin`.

* **`setstages(uint64_t game_id, vector<stage_rule> stages)`** — Auth: `bingogamesvc@active`. Configura estágios para modo `multimatch`. Cada `stage_rule` define `{stage, patterns_required, weight}`.

* **`claimstage(uint64_t game_id, uint64_t ticket_id, uint8_t stage, uint64_t win_pattern_mask)`** — Auth: `bingogamesvc@active`. Paga vencedor de estágio específico em modo `multimatch`. O jogo permanece em `paying` até `closegame`.

---

### 2.4. Salas (ADR-010)

* `createroom(...)` — Auth: `admin@active`. Cria sala com configuração completa.
* `activateroom(uint64_t room_id)` — Auth: `admin | sponsor@active`. `inactive | paused → active`.
* `pauseroom(uint64_t room_id)` — Auth: `admin | sponsor@active`. `active → paused`.
* `closeroom(uint64_t room_id)` — Auth: `admin | sponsor@active`. Valida ausência de jogo ativo antes de fechar.
* `setroommeta(uint64_t room_id, uint16_t room_drop_chance_bps, uint32_t max_tickets_per_player)` — Atualiza configurações on-chain da sala.

---

### 2.5. Drop Vault (ADR-011)

Depósitos chegam via `on_notify` (sem action explícita do sponsor):

* **Tokens:** `deposit()` intercepta `*::transfer` com memo `"vault"` — cria linha em `dropdeposits`.
* **NFTs:** `onnfttransfer()` intercepta `atomicassets::transfer` com memo `"vault"` — cria linha por NFT.

Actions explícitas:

* `allocatedrop(name caller, uint64_t deposit_id, uint64_t room_id, extended_asset qty_per_drop, uint64_t nft_asset_id, uint16_t drop_chance_bps)` — Vincula depósito a uma sala.
* `deallocdrop(name caller, uint64_t alloc_id)` — Remove alocação; devolve depósito a `deposited`.
* `reclaimasset(name owner, uint64_t deposit_id)` — Saca ativo não alocado de volta ao owner via `eosio.token::transfer` ou `atomicassets::transfer`.
* `execdrop(uint64_t alloc_id, name winner, extended_asset quantity)` — Auth: `bingogamesvc`. Executa o drop para um vencedor específico. Credita token em `balances[winner]` ou transfere NFT diretamente.

---

## 3. Motor de Resolução Backend (CQRS & Algometria)

O microsserviço Node.js atua sob CQRS. A varredura $O(n^2)$ é substituída por indexação invertida e Álgebra Booleana em $O(1)$.

### 3.1. Inteligência de Geração Aleatória (RNG de Cartelas)

Permutação sem repetição (Arranjos), abandonando ordenação crescente clássica. Para a coluna "B" (1–15, 5 posições): $P(15,5) = 360.360$ variações via Fisher-Yates criptográfico. Unicidade por rodada garantida via `SADD` atômico no Redis.

### 3.2. Índice Invertido (Redis)

No milissegundo de transição `LOCKED`, o worker processa `tickets` e constrói:

* **Chave:** `game:{game_id}:ball:{numero}`
* **Valor:** Lista de tuplas `[{ticket_id, bit_index}]`, `bit_index ∈ [0, 24]`.

### 3.3. Máscaras Algébricas (Bitmasking — ADR-004)

$$M = \sum_{p \in P} 2^p$$

* **Estado inicial:** `estado = 0x00001000` (bit 12 = FREE SPACE pré-marcado).
* **Processamento atômico por bola:**

```typescript
estado[ticket_id] |= (1 << bit_index);
if ((estado[ticket_id] & MASK_PATTERN) === MASK_PATTERN) {
    // Winner Found — dispara claimwin
}
```

### 3.4. Orquestração Automática (ADR-014)

O worker-game-loop executa 3 funções de auto-avanço em polling (15–30s):

* `autoLockFundingGames()` — detecta jogos `funding` vencidos e executa `lockgame + buildInvertedIndex + startdraw`.
* `autoStartLockedGames()` — detecta `locked` pendentes e inicia sorteio.
* `autoClaimDrawnGames()` — detecta `drawn | paying`, executa pipeline `evaluator → claimwin → closegame → onGameResolved`.

`onGameResolved()` (roomManager.ts) — após `ARCHIVED | ABORTED`: aguarda `auto_start_delay_sec`, cria próxima partida na sala, dispara `processRoomDrops()`.

### 3.5. Motor de Simulação Monte Carlo (ADR-005)

`POST /api/v1/admin/simulate-weights` + `POST /api/v1/admin/calibrate-weights`

1. **Patterns individuais:** simula N rodadas, calcula `hit_rate` e `avg_balls_needed` por padrão.
2. **Combinações:** cláusulas `all_of`, `any_of`, `n_of_type` avaliadas com max-weight.
3. **Payout:** `ticket_price × base_multiplier × max_win_weight / 100`.
4. **Calibração iterativa (handleSuggest — GametypesAdmin):** 3 fases — medição, cálculo analítico de pesos por inverse hit_rate, calibração iterativa (máx. 6 rounds) até RTP ≈ 85% ± 2%.

---

## 4. Comunicação de Eventos (WebSocket — Socket.io)

O servidor não envia estados brutos; orquestra uma Máquina de Estados Reativa no cliente via Slow Reveal (ADR-007).

### 4.1. Canais e Eventos (asyncapi.yaml v2.0)

**Canal `game.{game_id}`** — eventos de jogo ao vivo:

| Evento | Direção | Descrição |
|---|---|---|
| `game_locked` | S→C | FSM `FUNDING → LOCKED`. Vendas bloqueadas. |
| `ball_drawn` | S→C | Bola revelada (intervalo ~3s). Campo `order` para reconciliação. |
| `winner_found` | S→C | Vencedores detectados com payouts. Campos `win_type`, `win_label`. |
| `prize_tx_sent` | S→C | Transação on-chain submetida. Frontend → "confirming". |
| `prize_confirmed` | S→C | Prêmio persistido no MongoDB. Frontend → "confirmed". |
| `game_aborted` | S→C | Fail-safe acionado — estornos em curso. |
| `game_ended` | S→C | Partida completamente encerrada (ADR-014). |
| `golden_ball` | S→C | Bola dourada sorteada com multiplicador (ADR-012). |
| `stage_cleared` | S→C | Estágio de multi-match completado. Campo `winning_ball`. |
| `sync_response` | S→C | Resposta a `sync_request` — histórico de bolas. |
| `subscribe_game` | C→S | Entra no canal da partida. |
| `sync_request` | C→S | Solicita reconciliação (pacote perdido). |

**Canal `room.{room_id}`** — chat e drops (ADR-010/011):

| Evento | Direção | Descrição |
|---|---|---|
| `chat:message` | S→C | Mensagem de texto de um jogador. |
| `chat:sponsor_drop` | S→C | Notificação de drop executado para um vencedor. |
| `send_chat_message` | C→S | Jogador envia mensagem de chat. |

### 4.2. Resiliência e Slow Reveal (ADR-007)

* `ball_drawn.payload.order` — identificador ordinal. Se o cliente detectar $\Delta > 1$ (pacote perdido), emite `sync_request` e aguarda `sync_response` antes de prosseguir a animação.
* O broadcaster emite 1 bola a cada ≈3.000ms a partir do array já resolvido em memória (`session.balls`). O `winner_found` é emitido sincronizado com a animação visual da bola vencedora — garantia psicológica de suspense.

---

## 5. Frontend (React + Vite — ADR-015)

### 5.1. Roteamento URL-Based (ADR-015)

React Router DOM v6 com `BrowserRouter`. Rotas principais:

| URL | Componente | Auth |
|---|---|---|
| `/` | Landing / redirect | — |
| `/lobby` | PlayerShell > Lobby | ✅ |
| `/room/:roomId/:gameId` | GameRoom (full-screen) | ✅ |
| `/replay/:gameId` | ReplayRoom | ✅ |
| `/room/:roomId/history` | RoomHistoryPanel | **Público** |
| `/admin/:section` | AdminLayout (auto-contido) | ✅ Admin |
| `/sponsor/rooms` | SponsorLayout > SponsorRooms | ✅ Sponsor |
| `/sponsor/vault` | SponsorLayout > SponsorVault | ✅ Sponsor |

**Guards:** `AuthGuard` (session+profile obrigatórios), `AdminGuard` (role `admin|contract_admin`), `SponsorGuard` (role `sponsor`).

### 5.2. Acesso Público sem Sessão

`utils/rpc.ts` — `fetchTableRows(params, session?)`:
- Com `session`: usa `session.client.v1.chain.get_table_rows`.
- Sem `session` (visitante): `fetch('/v1/chain/get_table_rows', ...)` via proxy Vite.

Usado por `useRoomHistory` e `RoomHistoryPanel` para acesso público ao histórico de salas.

---

## 6. Garbage Collection e Engenharia de Custos

### 6.1. Ciclo de Limpeza Positiva (Happy Path)

1. `closegame()` registra `end_time`.
2. Quarentena de 24h — Frontend permite auditoria cruzando `games` e `tickets`.
3. Após `T > end_time + 24h`: `cleargame()` desaloca `tickets` iterativamente, reembolsa RAM para a tesouraria. Action Log consolida o Audit Trail imutável.

### 6.2. Ciclo de Falha e Reembolso $O(1)$ (Fail-Safes)

Inatividade de `orng.wax` ou falta de quórum → `abortgame()` → status `ABORTED`.

`refundticket(game_id, ticket_id)` — estorno sem gargalos iterativos. O worker processa lotes no ritmo tolerado pelo limite de CPU do bloco WAX (~30ms), removendo a linha e devolvendo o saldo para `balances[owner]`. O jogador mantém autonomia de acionar o fail-safe independentemente da plataforma.

### 6.3. Compliance (Lei 14.790/2023)

O ledger PostgreSQL (`games_history` + `transactions_ledger`) registra toda movimentação financeira para auditoria pública:

* `GET /api/v1/statistics/rtp` — RTP/GGR agregado por período e moeda.
* `GET /api/v1/statistics/games` — histórico individual de jogos.
* `GET /api/v1/statistics/games/batch` — stats por game_id (público).
* `POST /api/v1/admin/ledger/sync` — sincronização retroativa de jogo on-chain.

---

## 7. Sistema de Conteúdo Unificado (ADR-037)

### 7.1. API Genérica de Conteúdo Editorial

API REST em `apps/api-gateway/src/controllers/contentController.ts`:

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| `GET` | `/api/v1/content/:type` | Lista pública (cache Redis 2min) | — |
| `POST` | `/api/v1/content/:type` | Criar item | Admin |
| `PATCH` | `/api/v1/content/:type/:id` | Atualizar item com auto-translate | Admin |
| `DELETE` | `/api/v1/content/:type/:id` | Remover item | Admin |

### 7.2. Formatos de Conteúdo

| Formato | Uso | Armazenamento |
|---------|-----|---------------|
| `text` | FAQ (perguntas curtas) | MongoDB `content` collection |
| `blocks` | BlockNote editor (news, tutorials, how-it-works) | BlockNote JSON blocks |

### 7.3. Locale Overrides

Cada conteúdo tem campo `locales: { pt, en, zh }`. Admin UI permite revisão lado a lado com tradução automática.

### 7.4. Frontend

| Componente | Arquivo | Função |
|------------|---------|--------|
| `ContentPage.tsx` | `apps/frontend/src/pages/` | Renderiza qualquer tipo de conteúdo |
| `BlockContent.tsx` | `apps/frontend/src/components/` | Renderiza BlockNote blocks em modo leitura |
| `ContentAdmin.tsx` | `apps/frontend/src/admin/` | CRUD com BlockNote editor + translation review |

Tipos suportados: `faq`, `howitworks`, `sponsors`, `tutorials`, `news`.

---

## 8. Sistema de Permissões (RBAC — ADR-036)

### 8.1. Hierarquia

Padrão hierárquico com wildcard: `admin.*` > `admin.content.*` > `admin.content.<type>.*`.

### 8.2. Controllers

| Controller | Arquivo | Função |
|------------|---------|--------|
| `permissionController.ts` | `apps/api-gateway/src/controllers/` | CRUD de permissões por usuário |
| `sponsorPermissionController.ts` | `apps/api-gateway/src/controllers/` | Delegações com prevenção de escalação (`delegations.manage` proibido) |

### 8.3. Modelos MongoDB

| Coleção | Uso |
|---------|-----|
| `SponsorOrg` | Organizações sponsor |
| `SponsorDelegation` | Delegações de permissão entre contas |

### 8.4. Auditoria

`utils/audit.ts` registra toda mudança de permissão com timestamp, actor e diff.

---

## 9. Gamificação (ADR-028)

### 9.1. Achievements (29)

Worker engine em `achievementEngine.ts`, API em `GET /profile/achievements`, frontend `AchievementModal.tsx`, locales pt/en/zh.

| Categoria | Exemplos |
|-----------|----------|
| Vitórias | `first_win`, `win_10`, `win_50`, `win_100` |
| Combos | Completar N combinações |
| Compras | N cartelas compradas |
| Partidas | N partidas jogadas |
| Streak | Dias consecutivos de login |
| Burns | Queimar N tokens |
| Golden Win | Vencer com golden ball |
| Stage Win | Vencer estágio multi-match |
| Tiers | Alcançar tier específico |

### 9.2. Streak (Login Diário)

`xpEngine.ensureDailyStreak()` — tracking dias consecutivos. Bônus XP = `streakCount × 2`. Achievements: `streak_7`, `streak_14`, `streak_30`. Reset se pular 1 dia.

### 9.3. XP / Level / Tier

| Parâmetro | Valor |
|-----------|-------|
| Fórmula | Fibonacci (`PHI = 1.618034`) |
| `BASE_XP` | 906 |
| `MAX_LEVEL` | 225 |
| Tiers (9) | Cobre → Bronze → Prata → Ouro → Platina → Esmeralda → Safira → Rubi → Diamante |

**Fontes de XP:** partida (+ bônus streak), win, combo, burn, compra.

---

## 10. Landing API (ADR-039)

### 10.1. Stack

Azure Function App standalone (Consumption Plan, Node 22) + Aiven PostgreSQL. Código em `apps/landing-page/api/`.

| Componente | Stack |
|------------|-------|
| Runtime | Azure Functions v4 (CJS — ESM não funciona no Functions v4) |
| Banco | Aiven PostgreSQL (free tier, Frankfurt) |
| Domínio | `landing-api.cryptobingo.bet` (Cloudflare proxy, SSL automático) |

### 10.2. Endpoints

| Rota | Descrição |
|------|-----------|
| `GET /api/stats` | Estatísticas públicas |
| `GET /api/subscribe` | Inscrição newsletter |
| `POST /api/ideas` | Envio de ideias |
| `POST /api/votes` | Votação |

### 10.3. Problemas Conhecidos

- **ESM:** Functions v4 não suporta ESM. Compilar `module: "commonjs"`.
- **pnpm symlinks:** Corrompem zip deploy. Usar `npm install` limpo em `/tmp/fa-prod`.
- **Aiven SSL:** `sslmode=require` sobrescreve pool config. Manter URL sem `sslmode`, configurar `ssl: { rejectUnauthorized: false }` no Pool.

### 10.4. Deploy Manual

```bash
# 1. Compilar
cd apps/landing-page/api && npx tsc

# 2. Montar pacote (npm install limpo)
rm -rf /tmp/fa-prod && mkdir -p /tmp/fa-prod
cd /tmp/fa-prod
jq '{name,version,main,dependencies}' ../apps/landing-page/api/package.json > package.json
npm install
mkdir -p _lib ideas votes admin
cp <api-dir>/{host.json,index.js,stats.js,subscribe.js} ./
cp <api-dir>/_lib/*.js _lib/
cp <api-dir>/ideas/*.js ideas/
cp <api-dir>/votes/*.js votes/
cp <api-dir>/admin/*.js admin/

# 3. Deploy
zip -r /tmp/fa-prod.zip .
az webapp deployment source config-zip --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet --src /tmp/fa-prod.zip
```

---

## 11. swap-ui — DEX BingoGameSWP

### 11.1. Stack

`apps/swap-ui/` — React + Vite + TS. DEX público para o token `BINGOGAMESWP`.

| Funcionalidade | Descrição |
|---------------|-----------|
| Swap | Troca entre tokens |
| Liquidez | Add/remove liquidez |
| Analytics | Volume, TVL, preço |

### 11.2. Deploy

Azure Static Web Apps. Domínio: `test-swap.cryptobingo.bet`. Incluído na matriz de build CI/CD (GHCR tag `testnet-{sha}`).

---

## 12. Chat em Tempo Real

### 12.1. Componentes

| Pacote | Função |
|--------|--------|
| `apps/chat/` | Serviço de chat (segregado do worker) |
| `RoomChat.tsx` | Componente frontend de chat por sala |

### 12.2. Eventos WS

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `chat:message` | S→C | Mensagem de texto |
| `chat:sponsor_drop` | S→C | Notificação de drop |
| `send_chat_message` | C→S | Envio de mensagem |

### 12.3. Persistência

Coleção MongoDB `chat_messages` com índice TTL de 7 dias.

---

## 13. Admin UI

Componentes administrativos em `apps/frontend/src/admin/`:

| Componente | Função |
|-----------|--------|
| `ContentAdmin.tsx` | CRUD conteúdo editorial (BlockNote) |
| `GametypesAdmin.tsx` | Gerenciar game types + calibração pesos |
| `NftAdmin.tsx` | Gerenciar configurações NFT/templates |
| `RoomsAdmin.tsx` | Gerenciar salas |
| `CampaignsAdmin.tsx` | Campanhas B2B |
| `DropVaultAdmin.tsx` | Gerenciar drop vault |
| `PatternsAdmin.tsx` | Padrões de vitória |
| `UsersAdmin.tsx` | Gerenciar usuários/permissões |
| `PermissionsAdmin.tsx` | RBAC |
| `StatisticsAdmin.tsx` | Dashboard de estatísticas/RTP |
| `LeaderboardAdmin.tsx` | Leaderboard manual |
| `AchievementsAdmin.tsx` | Gerenciar achievements |
| `TiersAdmin.tsx` | Configuração de tiers/XP |

---

## 14. Deploy — Azure (Free Tier Containers)

Infraestrutura migrada de vcluster para Azure free tier:

| Serviço | Azure Resource | Tier |
|---------|---------------|------|
| api-gateway | Container App | Consumption |
| worker-game-loop | Container App | Consumption |
| frontend | Static Web Apps | Free |
| swap-ui | Static Web Apps | Free |
| landing-api | Function App | Consumption |
| PostgreSQL (landing) | Aiven | Free |
| MongoDB | MongoDB Atlas (M0) | Free |
| Redis | Azure Cache for Redis | Basic
