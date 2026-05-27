# ADR-011: Drop Vault — Rastreamento On-Chain de Ativos para Drops

**Data:** 2026-05-27
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O ADR-010 definiu o conceito de drops por sala como um mecanismo complementar às
campanhas B2B, onde sponsors distribuem tokens e NFTs aleatoriamente a jogadores
ao final de cada partida. No entanto, a versão inicial do ADR-010 tratava os drops
como configuração puramente off-chain (MongoDB), sem rastrear a **origem** e o
**saldo disponível** de cada ativo na blockchain.

Isso cria os seguintes problemas:

1. **Trust:** Sem registro on-chain, não há garantia de que o sponsor realmente
   enviou os ativos que configurou no MongoDB.
2. **Reivindicação:** Um sponsor que depositou ativos não utilizados não tem como
   provar ou executar a devolução sem um registro on-chain.
3. **Alocação Mútua:** Um ativo alocado a uma sala poderia ser acidentalmente
   configurado para outra sala, causando dupla-promessa.
4. **Auditabilidade:** Não há trilha de auditoria de quem depositou o quê, quando,
   e para qual sala.

Este ADR resolve esses problemas introduzindo um **Drop Vault** on-chain —
um conjunto de tabelas e actions que rastreiam depósitos, alocações e distribuições
de ativos para drops.

---

## Decisões

### 1. Conta Custodiante

Todos os ativos destinados a drops residem em **uma única conta custodiante**.

**Decisão:** A própria conta do contrato (`bingo.game`) atua como custodiante
para v1. Os depósitos são capturados via `on_notify` de `eosio.token`
e `atomicassets`.

> Se no futuro houver necessidade de segregação (ex: risco de auditoria,
> limite de RAM on-chain), uma conta separada `bingo.vault` pode ser criada.
> A migração é compatível: basta transferir os saldos e atualizar as permissões.

### 2. Nova Tabela: `drop_deposits`

Registra cada depósito de ativo feito por um sponsor/admin.

**Scope:** `_self` (global).
**Primary Key:** `deposit_id` (uint64, auto-incremento via `next_deposit_id`).
**Secondary Index:** `by_owner` — para consultar depósitos por sponsor.

| Campo | Tipo | Descrição |
|---|---|---|
| `deposit_id` | `uint64` | ID único do depósito |
| `owner` | `name` | Quem depositou (sponsor ou admin) |
| `asset_type` | `name` | `"token"_n` ou `"nft"_n` |
| `token_contract` | `name` | Contrato do token (ex: `eosio.token`) |
| `token_symbol` | `symbol` | Símbolo (ex: `4,BINGO`) |
| `quantity_original` | `asset` | Quantidade original depositada (token) |
| `quantity_remaining` | `asset` | Quantidade ainda não alocada (token) |
| `nft_asset_id` | `int32` | Asset ID do NFT (0 = token) |
| `nft_template_id` | `int32` | Template ID do NFT |
| `nft_collection` | `name` | Nome da coleção do NFT |
| `status` | `name` | `"available"_n`, `"depleted"_n` |
| `deposited_at` | `time_point_sec` | Timestamp do depósito |

**Regras:**
- `status == available` → ativo pode ser alocado a salas ou reivindicado pelo owner
- `status == depleted` → todo saldo foi alocado ou distribuído
- `quantity_remaining` decrementa conforme alocações são criadas

### 3. Nova Tabela: `drop_allocations`

Registra a alocação de um ativo de `drop_deposits` a uma sala específica.

**Scope:** `_self` (global).
**Primary Key:** `alloc_id` (uint64, auto-incremento via `next_alloc_id`).
**Secondary Index:** `by_room` — filtra alocações por sala.

| Campo | Tipo | Descrição |
|---|---|---|
| `alloc_id` | `uint64` | ID único da alocação |
| `deposit_id` | `uint64` | FK → `drop_deposits.deposit_id` |
| `room_id` | `uint64` | Sala destino |
| `quantity_allocated` | `asset` | Quantidade alocada (token) |
| `quantity_distributed` | `asset` | Quantidade já distribuída (token) |
| `nft_asset_id` | `int32` | Asset ID do NFT alocado (0 = token) |
| `nft_template_id` | `int32` | Template ID do NFT |
| `drop_chance_pct` | `uint8` | Probabilidade por partida (0-100) |
| `max_drops_per_game` | `uint32` | Máximo de drops distribuídos por partida |
| `drops_executed` | `uint32` | Total de drops já executados |
| `status` | `name` | `"active"_n`, `"exhausted"_n` |

**Regras:**
- `status == active` → alocação vigente, drops podem ser executados
- `status == exhausted` → todo saldo foi distribuído ou `max_drops_per_game` exaurido
- Um mesmo `deposit_id` pode ter múltiplas alocações em salas diferentes
- `quantity_allocated` não pode exceder `drop_deposits.quantity_remaining` no
  momento da alocação
- `quantity_distributed` é incrementado a cada drop executado

### 4. Nova Action: `deposittoken`

Registra um depósito de token fungível e opcionalmente já o aloca a uma sala.

**Prototype:**
```cpp
ACTION deposittoken(
    name owner,
    name token_contract,
    symbol token_symbol,
    asset quantity,
    optional<uint64_t> room_id,       // se presente, já aloca à sala
    optional<uint8_t> drop_chance_pct,
    optional<uint32_t> max_drops_per_game
)
```

**Fluxo:**
1. Verifica se `quantity` foi transferida para o contrato (chamado via `on_notify`)
2. Cria registro em `drop_deposits` com `status = available`
3. Se `room_id` presente:
   a. Verifica que a sala existe e está `active`
   b. Cria registro em `drop_allocations`
   c. Atualiza `drop_deposits.quantity_remaining`
4. Emite evento `drop_deposited`

### 5. Nova Action: `depositnft`

Registra um depósito de NFT (AtomicAssets) e opcionalmente já o aloca a uma sala.

**Prototype:**
```cpp
ACTION depositnft(
    name owner,
    name collection,
    int32_t template_id,
    int32_t asset_id,
    optional<uint64_t> room_id,
    optional<uint8_t> drop_chance_pct,
    optional<uint32_t> max_drops_per_game
)
```

**Fluxo:** Análogo ao `deposittoken`, mas para NFTs.
- Verifica via AtomicAssets que o NFT foi transferido para o contrato
- Registra em `drop_deposits` com `asset_type = "nft"_n`
- Se `room_id` presente, aloca via `drop_allocations`

### 6. Nova Action: `allocatedrop`

Aloca um ativo já depositado a uma sala.

**Prototype:**
```cpp
ACTION allocatedrop(
    uint64_t deposit_id,
    uint64_t room_id,
    optional<asset> quantity,          // para tokens: quanto alocar
    optional<int32_t> nft_asset_id,    // para NFTs: qual asset alocar
    uint8_t drop_chance_pct,
    uint32_t max_drops_per_game
)
```

**Validações:**
- `deposit_id` existe e tem `status == available`
- Sala existe e está `active` (ou `paused`, depende da política)
- Para tokens: `quantity <= drop_deposits.quantity_remaining`
- Para NFTs: `nft_asset_id` não está alocado em outra sala ativa

### 7. Nova Action: `reclaimasset`

Permite ao owner original retirar ativos **não alocados** do vault.

**Prototype:**
```cpp
ACTION reclaimasset(name owner, uint64_t deposit_id, optional<asset> quantity)
```

**Regras:**
- Apenas o `owner` original pode chamar
- Só pode reivindicar ativos com `status == available`
- Para tokens: pode reivindicar parcialmente (menor que `quantity_remaining`)
- Para NFTs: reivindicação é total (asset_id inteiro)
- Após reivindicação:
  - Se todo saldo foi retirado: `deposit.status = depleted`
  - Se parcial (token): `quantity_remaining` é decrementado
- O contrato transfere o ativo de volta ao owner

> **Por que não permitir reivindicação de ativos alocados?**
> Se um sponsor aloca um ativo à sala, a sala tem a expectativa de que aquele
> drop estará disponível. Permitir reivindicação de ativos alocados quebraria
> essa promessa. O sponsor deve primeiro desalocar (`dealocatedrop`).

### 8. Nova Action: `dealocatedrop`

Remove uma alocação, devolvendo o saldo não distribuído ao pool disponível.

**Prototype:**
```cpp
ACTION dealocatedrop(uint64_t alloc_id)
```

**Quem pode chamar:** Admin ou sponsor owner do `deposit_id` original.

**Efeitos:**
1. `drop_allocations.status = exhausted`
2. `drop_deposits.quantity_remaining += (alloc.quantity_allocated - alloc.quantity_distributed)`
3. Se o deposit voltar a ter saldo > 0: `deposit.status = available`

### 9. Nova Action: `execdrop`

Executa um drop atômico — chamado pelo worker de drops (off-chain) com
autorização do microservice.

**Prototype:**
```cpp
ACTION execdrop(
    uint64_t alloc_id,
    name winner,
    optional<asset> quantity,
    optional<int32_t> nft_asset_id
)
```

**Validações:**
- `alloc_id` existe e `status == active`
- Worker tem permissão (microservice authority)

**Efeitos:**
1. Transfere token/NFT para `winner`
2. Incrementa `drops_executed++`
3. Incrementa `quantity_distributed`
4. Se `quantity_distributed >= quantity_allocated` (token) ou `drops_executed >= 1` (NFT):
   `status = exhausted`
5. Se `deposit.quantity_remaining == 0`: `deposit.status = depleted`

### 10. Nova Singleton: `dropstate`

Armazena contadores globais para IDs sequenciais.

**Scope:** `_self` (global).

| Campo | Tipo | Descrição |
|---|---|---|
| `next_deposit_id` | `uint64` | Próximo ID para `drop_deposits` |
| `next_alloc_id` | `uint64` | Próximo ID para `drop_allocations` |

### 11. Fluxo de Depósito via `on_notify`

O contrato intercepta transferências recebidas com prefixo `"drop:"` no memo.

**Formato do memo (token):**
```
drop:{room_id}:{chance_pct}:{max_per_game}
```

**Exemplos:**
- `drop:` → depósito simples, sem alocação (disponível para alocar depois)
- `drop:1:10:5` → deposita e aloca à sala 1, 10% de chance, max 5 drops/partida
- `drop:3:25:` → deposita e aloca à sala 3, 25% de chance, sem limite por partida

**Formato do memo (NFT):**
```
drop:{room_id}:{chance_pct}:{max_per_game}
```

Para NFTs, o `on_notify` do contrato AtomicAssets segue o mesmo padrão de memo.

### 12. Worker de Drops

O worker `dropWorker.ts` (a ser implementado) orquestra a execução:

1. Escuta evento `game_resolved` (partida → `ARCHIVED`)
2. Para cada sala que possui drops configurados:
   a. Busca `drop_allocations` on-chain com `by_room` e `status == active`
   b. Para cada alocação, sorteia execução baseado em `drop_chance_pct`
   c. Se sorteado, seleciona aleatoriamente um jogador que comprou cartelas
   d. Chama `execdrop()` com autorização do microservice
   e. Emite evento WebSocket `chat:sponsor_drop`

### 13. Segregação Futura (post-v1)

Se a conta `bingo.game` acumular muitos ativos, a segregação para `bingo.vault`
pode ser feita:

- Transferir todos os saldos de `drop_deposits` para `bingo.vault`
- A action `execdrop` passa a enviar de `bingo.vault` em vez de `bingo.game`
- Adicionar campo `vault_contract` em `drop_deposits` para indicar onde o ativo reside
- Atualizar permissões: `bingo.game@eosio.code` tem autorização em `bingo.vault`

---

## Consequências

**Positivas:**
- Trustless: jogadores e sponsors podem verificar saldos on-chain
- Sponsor pode recuperar ativos não utilizados
- Alocação exclusiva por sala evita dupla-promessa
- Trilha de auditoria completa (depósito → alocação → distribuição)
- Compatível com o modelo off-chain de metadados (MongoDB mantém configs visuais)

**Negativas:**
- Aumento do consumo de RAM on-chain (3 novas tabelas + 1 singleton)
- Complexidade adicional no contrato (5 novas actions)
- Worker de drops precisa de permissão para chamar `execdrop`
- Sponsor precisa pagar RAM para depósitos e alocações
- `on_notify` com parsing de memo adiciona lógica no contrato

---

## Arquivos Afetados

- `contracts/bingo/include/bingo.hpp` — novas tabelas `drop_deposits`,
  `drop_allocations`, `dropstate`; novas actions `deposittoken`, `depositnft`,
  `allocatedrop`, `reclaimasset`, `dealocatedrop`, `execdrop`
- `contracts/bingo/src/bingo.cpp` — implementação das novas actions + handlers
  `on_notify` para `eosio.token` e `atomicassets`
- `packages/shared-types/src/index.ts` — tipos `DropDeposit`, `DropAllocation`,
  `DropState`
- `apps/worker-game-loop/src/services/dropWorker.ts` — worker de drops
- `apps/worker-game-loop/src/index.ts` — inicialização do dropWorker
- `apps/api-gateway/src/controllers/roomController.ts` — novos endpoints para
  gerenciar depósitos e alocações
- `apps/api-gateway/src/index.ts` — novas rotas de drop vault
- `apps/frontend/src/services/api.ts` — funções de depósito/alocação
- `apps/frontend/src/components/sponsor/SponsorDrops.tsx` — UI de gestão de drops
- `docs/adr/ADR-010-rooms-salas.md` — referência ao ADR-011
- `docs/openapi.yaml` — novos endpoints de drop vault
- `docs/COMPLIANCE.md` — rastreabilidade de ativos

---

## Referências

- ADR-010 §6 — Definição original de drops por sala
- ADR-008 — Campanhas B2B (mecanismo complementar)
- AtomicAssets Standard — Padrão de NFTs na blockchain WAX
