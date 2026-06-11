# ADR-011: Drop Vault — Rastreamento On-Chain de Ativos para Drops

**Data:** 2026-05-27
**Revisado:** 2026-05-28
**Status:** Aceito (v2 — substituição completa da v1)
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O ADR-010 definiu o conceito de **drops por sala** como mecanismo B2B onde sponsors
distribuem NFTs e tokens fungíveis aleatoriamente a jogadores ao final de cada
partida. A v1 deste ADR tratava os drops com rastreamento on-chain básico, sem
cobrir o fluxo completo de UI/UX do sponsor, o algoritmo de sorteio e regras de
concorrência entre sessões abertas.

Este documento (v2) é a especificação canônica e definitiva do Drop Vault, incorporando
todas as decisões de design tomadas em sessão de alinhamento com o product owner.

---

## Decisões

### 1. Conta Custodiante

Todos os ativos destinados a drops residem na conta do contrato (`bingogamectr`),
capturados via `on_notify` de `eosio.token` (tokens fungíveis) e `atomicassets`
(NFTs). O sponsor não precisa especificar memo de roteamento: qualquer ativo
enviado ao contrato sem memo de jogo é automaticamente registrado como depósito
de vault.

> **Proteção contra envio acidental:** qualquer conta que transfira ativos ao
> contrato (inclusive jogadores comuns por engano) terá esses ativos registrados
> em `drop_deposits` com `status = available` sob sua autoria, podendo reaver via
> `reclaimasset` a qualquer momento enquanto não alocados. Não há perda de ativo.

**Segregação futura (post-v1):** conta separada `bingo.vault` pode ser criada
conforme crescimento. A migração é retrocompatível.

---

### 2. Tabela: `drop_deposits`

Registra cada depósito de ativo feito por qualquer conta.

**Scope:** `_self` (global).
**Primary Key:** `deposit_id` (uint64, auto-incremento via `dropstate.next_deposit_id`).
**Secondary Indexes:**
- `by_owner` — consulta depósitos por dono
- `by_status` — filtra disponíveis vs esgotados

| Campo | Tipo | Descrição |
|---|---|---|
| `deposit_id` | `uint64` | ID único do depósito |
| `owner` | `name` | Quem depositou |
| `asset_type` | `name` | `"token"_n` ou `"nft"_n` |
| `token_contract` | `name` | Contrato do token (`eosio.token`) |
| `token_symbol` | `symbol` | Símbolo do token |
| `quantity_original` | `asset` | Quantidade original depositada |
| `quantity_remaining` | `asset` | Saldo ainda não alocado |
| `nft_asset_id` | `uint64` | Asset ID do NFT (0 se token) |
| `nft_template_id` | `int32` | Template ID do NFT |
| `nft_collection` | `name` | Coleção do NFT |
| `status` | `name` | `"available"_n` \| `"allocated"_n` \| `"depleted"_n` |
| `deposited_at` | `time_point_sec` | Timestamp do depósito |

**Status:**
- `available` → ativo pode ser alocado a salas ou resgatado pelo owner
- `allocated` → ativo está vinculado a pelo menos uma sala ativa
- `depleted` → todo saldo foi distribuído ou reivindicado

---

### 3. Tabela: `drop_allocations`

Vincula um ativo de `drop_deposits` a uma sala com configuração de drop.

**Scope:** `_self` (global).
**Primary Key:** `alloc_id` (uint64, auto-incremento via `dropstate.next_alloc_id`).
**Secondary Indexes:**
- `by_room` — filtra alocações por sala
- `by_deposit` — filtra alocações por depósito de origem
- `by_owner` — filtra alocações pelo owner do depósito

| Campo | Tipo | Descrição |
|---|---|---|
| `alloc_id` | `uint64` | ID único da alocação |
| `deposit_id` | `uint64` | FK → `drop_deposits.deposit_id` |
| `owner` | `name` | Owner do depósito (desnormalizado para consultas) |
| `room_id` | `uint64` | Sala destino |
| `asset_type` | `name` | `"token"_n` ou `"nft"_n` (desnormalizado) |
| `token_contract` | `name` | Contrato do token |
| `token_symbol` | `symbol` | Símbolo do token |
| `quantity_per_drop` | `asset` | Valor fixo por drop (tokens) |
| `quantity_distributed` | `asset` | Total já distribuído |
| `nft_asset_id` | `uint64` | Asset ID do NFT alocado |
| `nft_template_id` | `int32` | Template ID (para display) |
| `nft_collection` | `name` | Coleção (para display) |
| `drop_chance_bps` | `uint16` | Probabilidade em basis points (0–10000, onde 10000 = 100%) |
| `drops_executed` | `uint32` | Total de drops realizados |
| `status` | `name` | `"active"_n` \| `"exhausted"_n` \| `"deallocated"_n` |
| `allocated_at` | `time_point_sec` | Timestamp da alocação |

> **Por que basis points em vez de percentual?** Permite precisão de 0,01%
> (ex: 1 bps = 0,01%, 100 bps = 1%, 10000 bps = 100%). O sponsor configura no
> frontend como percentual com 2 casas decimais; o contrato armazena em bps.

**Status:**
- `active` → alocação vigente, drops podem ser executados
- `exhausted` → ativo esgotado (tokens: saldo < `quantity_per_drop`; NFT: já dropada)
- `deallocated` → sponsor removeu a vinculação antes do esgotamento

---

### 4. Singleton: `dropstate`

Armazena contadores globais e configurações do sistema.

| Campo | Tipo | Descrição |
|---|---|---|
| `next_deposit_id` | `uint64` | Próximo ID de depósito |
| `next_alloc_id` | `uint64` | Próximo ID de alocação |
| `room_drop_base_chance_bps` | `uint16` | Pré-check global padrão (default 10000 = 100%) |
| `player_base_chance_bps` | `uint16` | Chance base por jogador na fila (default 5000 = 50%) |

---

### 5. Configuração de Drop por Sala (MongoDB — `RoomDropConfig`)

Cada sala armazena configurações de drop no MongoDB (complementar ao on-chain):

```ts
interface RoomDropConfig {
  room_id:               string;
  room_drop_chance_bps:  number;  // pré-check global desta sala (0–10000)
  drop_symbols:          string[]; // símbolos visuais para o lobby ("🎁", "💎", etc.)
}
```

O campo `room_drop_chance_bps` permite ao sponsor (ou admin) configurar um gate
global por sala — ex: 3000 bps = 30% de chance de a sala sequer entrar no fluxo
de drop a cada partida.

---

### 6. Actions do Contrato

#### 6.1 `deposittoken` — capturado via `on_notify("eosio.token", "transfer")`

```cpp
// Chamado automaticamente quando qualquer token é transferido ao contrato.
// Cria registro em drop_deposits.
// Memo vazio ou não-jogo → vault deposit.
// Memo "game:" → fluxo normal de depósito de jogo (existente).
```

#### 6.2 `depositnft` — capturado via `on_notify("atomicassets", "transfer")`

```cpp
// Análogo ao deposittoken, para NFTs.
// Cria 1 registro por NFT na lista de assets transferidos.
```

#### 6.3 `allocatedrop` — chamado pelo backend ao salvar sala

```cpp
ACTION allocatedrop(
    name          caller,        // deve ser owner do deposit ou admin
    uint64_t      deposit_id,
    uint64_t      room_id,
    asset         quantity_per_drop,  // para tokens
    uint64_t      nft_asset_id,       // para NFTs (0 se token)
    uint16_t      drop_chance_bps     // 0–10000
)
```

**Validações on-chain:**
- `caller` == `deposit.owner` ou tem permissão de admin
- `deposit.status == "available"_n`
- Sala existe e `status != "closed"_n`
- Para tokens: `deposit.quantity_remaining >= quantity_per_drop`
- Para NFTs: nenhuma `drop_allocation` ativa com o mesmo `nft_asset_id`
  (previne dupla-alocação mesmo com múltiplas abas abertas — validação atômica
  garantida pelo consenso da blockchain)
- Atualiza `deposit.status = "allocated"_n`

#### 6.4 `deallocatedrop` — chamado pelo backend ao desalocar

```cpp
ACTION deallocatedrop(name caller, uint64_t alloc_id)
```

**Efeitos:**
1. `alloc.status = "deallocated"_n`
2. Para tokens: se `deposit.quantity_remaining` volta a ficar > 0 → `deposit.status = "available"_n`
3. Para NFTs: `deposit.status = "available"_n`

#### 6.5 `reclaimasset` — sponsor saca ativo não alocado

```cpp
ACTION reclaimasset(name owner, uint64_t deposit_id, optional<asset> quantity)
```

**Regras:**
- Apenas o `owner` original pode chamar
- `deposit.status == "available"_n` (não alocado a nenhuma sala ativa)
- Para tokens: reivindicação parcial permitida
- Para NFTs: reivindicação total obrigatória
- Contrato transfere o ativo de volta ao `owner`
- Se saldo zera: `deposit.status = "depleted"_n`

#### 6.6 `execdrop` — executado pelo worker após cada partida

```cpp
ACTION execdrop(
    uint64_t alloc_id,
    name     winner,
    asset    quantity    // para tokens; zero para NFTs
)
```

**Validações:**
- Requer autorização do bingogamesvc
- `alloc.status == "active"_n`
- Para tokens: `deposit.quantity_remaining >= alloc.quantity_per_drop`
- Para NFTs: `alloc.drops_executed == 0` (máximo 1 drop por NFT)

**Efeitos:**
1. Transfere ativo ao `winner`
2. `alloc.drops_executed++`
3. `alloc.quantity_distributed += quantity`
4. Para NFTs ou tokens esgotados: `alloc.status = "exhausted"_n`
5. Atualiza `deposit.quantity_remaining`

---

### 7. Algoritmo de Drop (Worker — `dropWorker.ts`)

Executado ao final de cada partida (após `claimwin` completado), para cada sala
com `drop_allocations` ativas.

#### Fase 0 — Pré-check global da sala

```
room_drop_chance_bps = RoomDropConfig.room_drop_chance_bps ?? 10000
sorteio = random(0, 9999)
if sorteio >= room_drop_chance_bps → ABORT (sem drops nesta partida)
```

> Se o pré-check falhar, nenhum ativo é testado. Isso protege o vault em salas
> de alta frequência onde o sponsor quer que drops sejam raros.

#### Fase 1A — Eleição de NFT (máximo 1 por partida)

```
nfts_ativas = drop_allocations
    .filter(status == "active" AND asset_type == "nft")
    .sortBy(drop_chance_bps, DESC)  // maior chance primeiro

nft_eleita = null

para cada nft em nfts_ativas:
    sorteio = random(0, 9999)
    if sorteio < nft.drop_chance_bps / 10:
        // ex: 2500 bps = 25% → threshold = 250 em 1000
        // mais preciso: sorteio < (nft.drop_chance_bps / 10000) * 10000
        nft_eleita = nft
        BREAK  // apenas 1 NFT por partida

if nft_eleita != null:
    → Fase 2 com nft_eleita
```

> A ordenação decrescente por probabilidade garante que NFTs mais prováveis
> sejam testadas primeiro, maximizando a chance de haver um drop quando o sponsor
> configurou ativos com probabilidades altas.

#### Fase 1B — Eleição de Tokens (independente, 1 por tipo por partida)

```
tokens_ativos = drop_allocations
    .filter(status == "active" AND asset_type == "token")
    .groupBy(token_symbol)
    // para cada símbolo, testa somente o mais antigo (FIFO por allocated_at)

tokens_eleitos = []

para cada token em tokens_ativos:
    if deposit.quantity_remaining < token.quantity_per_drop:
        SKIP  // saldo insuficiente
    sorteio = random(0, 9999)
    if sorteio < token.drop_chance_bps / 10:
        tokens_eleitos.push(token)

// tokens_eleitos pode ter múltiplos elementos (um por símbolo distinto)
```

> NFTs e tokens são **independentes**: uma partida pode resultar em 1 drop de
> NFT + N drops de token (um por símbolo configurado), todos para jogadores
> possivelmente diferentes.

#### Fase 2 — Seleção do Jogador

Executada uma vez para cada ativo eleito (NFT ou token), com listas de jogadores
independentes para cada sorteio.

```
jogadores_premiados = fetchWinnersForGame(game_id)
// lista de { wallet, winning_tickets_count }

// Constrói pool ponderado: cada jogador aparece N vezes = winning_tickets_count
pool = []
para cada jogador em jogadores_premiados:
    para i in range(jogador.winning_tickets_count):
        pool.push(jogador.wallet)

// Fisher-Yates shuffle
pool = fisherYatesShuffle(pool)

// Teste sequencial com base de chance por jogador
PLAYER_BASE_CHANCE_BPS = dropstate.player_base_chance_bps  // default 5000

vencedor = null
para cada wallet em pool:
    sorteio = random(0, 9999)
    if sorteio < PLAYER_BASE_CHANCE_BPS / 10:
        vencedor = wallet
        BREAK

if vencedor != null:
    await execdrop(alloc_id, vencedor, quantity)
    emit WS event "chat:sponsor_drop" → sala
    // evento visível no chat da sala com animação
```

> **Por que PLAYER_BASE_CHANCE_BPS = 5000 (50%)?**
> Na média, a lista é percorrida por 2 posições antes de encontrar um ganhador.
> Jogadores com mais cartelas premiadas têm mais entradas no pool → mais tentativas
> → probabilidade maior proporcional ao seu desempenho. O valor é configurável
> via `dropstate` sem deploy de contrato.

---

### 8. Validação de Concorrência (Backend + Contrato)

#### 8.1 Validação Backend (otimista — ao salvar a sala)

Antes de chamar `allocatedrop` on-chain, o backend valida:

```ts
// Para cada NFT a ser alocada:
const existingAlloc = await rpcClient.get_table_rows({
  table: 'drop_allocations',
  index: 'by_deposit',
  lower_bound: deposit_id,
  upper_bound: deposit_id,
});
if (existingAlloc.rows.some(a => a.status === 'active')) {
  throw new ConflictError('NFT já alocada em outra sala');
}
```

#### 8.2 Validação On-Chain (atômica — no contrato)

A action `allocatedrop` verifica on-chain o mesmo critério. Como a blockchain é
sequencial por transação, a segunda chamada concorrente falha com `eosio_assert`
mesmo que o backend tenha passado na validação otimista.

O frontend exibe o erro retornado pelo contrato com mensagem amigável:
> "Esta NFT já foi vinculada a outra sala enquanto você editava. Atualize a página."

---

### 9. Painel Vault do Sponsor (`SponsorVault.tsx`)

Nova tela acessível via painel admin → "Meu Vault".

#### 9.1 Grid de NFTs

- Exibe todas as NFTs em `drop_deposits` com `owner == sponsor.wallet`
  e `status != "depleted"`
- Colunas: miniatura, nome do template, collection, status (chip visual), sala vinculada,
  probabilidade, data de depósito
- **Distinção visual:**
  - `available` (não vinculada): chip `cb-badge-neutral` "Disponível"
  - `allocated` (vinculada): chip `cb-badge-brand` com nome da sala + probabilidade
- **Ações por linha:**
  - Se `available`: botão "Vincular a sala"
  - Se `allocated`: botão "Desvincular" + botão "Alterar Probabilidade"
- **Ordenação:** nome, template, sala, probabilidade, data
- **Filtro:** todas / vinculadas / disponíveis
- Botão "Sacar NFT" (apenas para `available`)

#### 9.2 Grid de Tokens

- Exibe saldos de tokens em `drop_deposits` com `owner == sponsor.wallet`
- Colunas: símbolo, saldo original, saldo restante, alocado (soma), status
- Ações: vincular saldo a sala, desvincular, sacar saldo disponível

#### 9.3 Histórico de Drops

- Lista de `execdrop` executados relativos ao sponsor
- Colunas: data, ativo, sala, partida, vencedor, valor/NFT
- Filtros por sala, por ativo, por período

---

### 10. Fluxo de Vinculação no Painel de Salas (`RoomsAdmin.tsx`)

Ao editar uma sala, a seção "Drops" exibe:

#### Painel "NFTs Disponíveis para Vincular"
- Busca `drop_deposits` do sponsor com `status == "available"` e `asset_type == "nft"`
- Exibe como grid selecionável (checkbox por NFT)
- Botão "Vincular Selecionadas a esta Sala"

#### Painel "NFTs Vinculadas a esta Sala"
- Lista `drop_allocations` com `room_id == sala_atual` e `asset_type == "nft"`
- Para cada NFT vinculada:
  - Miniatura + nome do template
  - **Indicador visual de "não salvo"** (borda tracejada + badge "Pendente")
    para vinculações adicionadas na sessão atual antes de salvar
  - Input de probabilidade (0–100%, com 2 casas decimais)
  - Botão "Desvincular" → move a NFT de volta para o painel de disponíveis
    e remove do painel de vinculadas (apenas UI até salvar)
- **Botão "Salvar Alterações"** → executa todas as `allocatedrop` e `deallocatedrop`
  de uma vez, seguido de validação e feedback de erros por NFT

#### Painel "Tokens Configurados para esta Sala"
- Mesmo padrão, para tokens fungíveis
- Input adicional: "Valor por Drop" (quantity_per_drop)

---

### 11. Indicadores Visuais no Lobby (`Lobby.tsx`)

Salas com drops ativos exibem badges no card do lobby:

```tsx
// Se sala tem NFT drop ativa:
<span className="cb-badge-brand">🎁 NFT Drop</span>

// Se sala tem token drop ativo:
<span className="cb-badge-accent">💰 Token Drop</span>

// Se vault esgotado (sem drops disponíveis):
// Nenhum badge exibido — sala fica sem destaque
```

> A presença/ausência do badge incentiva tanto jogadores (entrar em salas com
> drops) quanto sponsors (manter vault saudável para manter visibilidade).

---

### 12. Evento WebSocket de Drop (`chat:sponsor_drop`)

Ao executar um drop com sucesso, o worker emite para o canal da sala:

```ts
socket.to(`room:${room_id}`).emit('chat:sponsor_drop', {
  type:        'nft' | 'token',
  asset_name:  string,   // nome do template ou símbolo
  winner:      string,   // wallet do ganhador (truncada)
  room_id:     string,
  game_id:     string,
  quantity?:   string,   // para tokens
  alloc_id:    number,
});
```

Exibido no chat da sala com animação de destaque (confetti ou glow dourado).

---

### 13. Atualizações Necessárias no ADR-010

- Adicionar campo `room_drop_chance_bps` (uint16) na tabela `rooms` on-chain
- Adicionar campo `has_active_drops` (bool, computed off-chain, MongoDB) no `RoomMetadata`
  para filtros do lobby sem consultar `drop_allocations` a cada render

---

## Consequências

**Positivas:**
- Trustless end-to-end: sponsor prova depósito on-chain; jogador verifica drop on-chain
- Proteção contra envio acidental: qualquer ativo enviado ao contrato é recuperável
- Concorrência resolvida em dois níveis (optimistic UI + atômica no contrato)
- "Dupla dificuldade" equilibra raridade do drop com fairness para jogadores
- Pool ponderado por cartelas premiadas incentiva comprar mais cartelas
- Vault saudável = badge no lobby = mais jogadores = incentivo orgânico ao sponsor
- Auditoria completa para sponsor (histórico de drops rastreável)

**Negativas:**
- Aumento de RAM on-chain (3 tabelas + 1 singleton por depósito/alocação)
- Worker precisa de permissão `eosio.code` para `execdrop`
- Sponsor paga RAM para cada depósito e alocação

---

## Arquivos a Criar/Modificar

### Contrato C++
- `contracts/bingo/include/bingo.hpp` — tabelas `drop_deposits`, `drop_allocations`,
  `dropstate`; campo `room_drop_chance_bps` em `rooms`; actions `allocatedrop`,
  `deallocatedrop`, `reclaimasset`, `execdrop`; handlers `on_notify` para
  `eosio.token` e `atomicassets`
- `contracts/bingo/src/bingo.cpp` — implementação de todas as actions acima

### Shared Types
- `packages/shared-types/src/index.ts` — `DropDeposit`, `DropAllocation`,
  `DropState`, atualização de `BlockchainRoom`

### Worker
- `apps/worker-game-loop/src/services/dropWorker.ts` — Fases 0, 1A, 1B, 2
- `apps/worker-game-loop/src/index.ts` — inicialização do dropWorker

### API Gateway
- `apps/api-gateway/src/controllers/dropController.ts` — endpoints de vault
- `apps/api-gateway/src/index.ts` — novas rotas de drop vault

### Frontend
- `apps/frontend/src/components/admin/SponsorVault.tsx` — painel vault completo
- `apps/frontend/src/components/admin/RoomsAdmin.tsx` — seção Drops na edição de sala
- `apps/frontend/src/components/Lobby.tsx` — badges de drops
- `apps/frontend/src/services/api.ts` — funções de drop vault

### Documentação
- `docs/adr/ADR-011-drop-vault.md` — este documento (v2)
- `docs/adr/ADR-010-rooms-salas.md` — adicionar referência a `room_drop_chance_bps`
- `docs/openapi.yaml` — endpoints de drop vault
- `docs/COMPLIANCE.md` — rastreabilidade de ativos de sponsors

---

## Referências

- ADR-010 §6 — Definição original de drops por sala
- ADR-008 — Campanhas B2B (mecanismo complementar)
- AtomicAssets Standard — Padrão de NFTs na blockchain WAX
