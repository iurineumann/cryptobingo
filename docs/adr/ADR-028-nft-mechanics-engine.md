# ADR-028 — Motor de Mecânicas NFT

Motor completo de mecânicas NFT: multi-regra por template (TICKET_DISCOUNT, PRIZE_BOOST,
ROOM_ACCESS, BURN_TO_CLAIM), treasury de sala para patrocinador, schema field
deserialização dupla (worker + contrato), consumíveis via mutable data, XP/achievement
engine off-chain, e suporte a coleções externas com field mapping.

## Status: Proposto

## Contexto

O contrato `bingogamectr` tem suporte NFT mínimo (`nftconfigs` com `discount_pct`/`is_vip`
apenas, um `nft_id` por `buytickets`, sem consumíveis, sem prize boost, sem burn tracking).
Para viabilizar economia GameFi completa — salas patrocinadas, benefícios cross-coleção,
XP e achievements — precisamos de motor NFT configurável, validado on-chain com
flexibilidade off-chain.

## Decisões

### 1. `nftconfigs` — Upgrade in-place (sem v2)

Dev resetável → sem migration. A struct atual é substituída por:

```cpp
enum rule_type : uint8_t {
    TICKET_DISCOUNT = 1,  // desconto na compra
    PRIZE_BOOST     = 2,  // % extra no payout
    ROOM_ACCESS     = 3,  // acesso a salas
    BURN_TO_CLAIM   = 4,  // queima → grant temporário
};

enum value_origin : uint8_t {
    VALUE_FIXED        = 0,  // valor fixo na config
    VALUE_SCHEMA_FIELD = 1,  // ler do schema da NFT
};

struct nft_rule {
    uint8_t               type;
    uint8_t               value_origin;
    uint16_t              fixed_value;        // hundredths se FIXED
    string                schema_field;       // nome no schema se SCHEMA_FIELD
    uint8_t               max_uses;           // 0 = ilimitado
    uint32_t              grant_duration_sec; // p/ BURN_TO_CLAIM
    uint8_t               condition;          // 0 = owns, 1 = burned
    set<uint64_t>         room_ids;           // p/ ROOM_ACCESS
};

struct [[eosio::table("nftconfigs")]] nft_config {
    uint64_t                    template_id;
    name                        collection_name;
    vector<nft_rule>            rules;
    uint64_t primary_key() const { return template_id; }
};
```

`confignft` substitui `setnftconf`. `delnftconf` mantido.

### 2. Schema Field — Validação Dupla

Worker pré-computa valores para performance. Contrato re-deserializa
`immutable_serialized_data` seguindo ALPHA encoding do AtomicAssets para validar que o
valor passado não excede o field da NFT.

**Worker** (off-chain, por request):
1. Lê `atomicassets::assets` do player
2. Lê `atomicassets::schemas` do template
3. Deserializa conforme schema format
4. Retorna `{asset_id, template_id, rule_type, computed_value}`

**Contrato** (on-chain, em `buytickets`/`claimwin`):
1. Worker passa benefício pré-computado
2. Contrato re-deserializa schema field da NFT
3. Valida que `computed_value <= field_value`
4. Aplica benefício ou rejeita

### 3. Consumíveis — Mutable Data na NFT

Usos consumíveis são rastreados em `mutable_serialized_data` da própria NFT
(via `atomicassets::setassetdata` inline), garantindo que o contador persista mesmo
após transferências.

Requisito: coleção precisa autorizar `bingogamectr` como `authorized_account`.
Sem autorização → fallback para tabela `nftusage` própria (sem proteção cross-transfer).

### 4. `room_record` — Campos adicionados

```cpp
struct [[eosio::table("rooms")]] room_record {
    // ... campos existentes ...
    vector<uint64_t> nft_template_allowlist;  // templates aceitos na sala
    uint64_t         campaign_id           = 0;
    uint16_t         house_fee_bps         = 0;   // taxa da casa sobre GGR
    uint32_t         estimated_monthly_tickets = 0; // projeção colateral
};
```

`nft_template_allowlist` validado em `buytickets` quando NFT é usado. Dupla validação
com `ROOM_ACCESS` rule da `nftconfigs`.

### 5. `room_treasuries` — Nova tabela

```cpp
struct [[eosio::table("roomtresry")]] room_treasury {
    uint64_t       room_id;
    extended_asset balance;
    extended_asset locked;      // sponsor não pode sacar enquanto sala ativa
    uint64_t primary_key() const { return room_id; }
};
```

**Fluxo financeiro da sala de sponsor:**
1. Sponsor deposita tokens (memo `"room:<id>"` ou `fundroomtreasury(action)`)
2. `activateroom` → simula RTP 85% worst-case → tranca `locked` no treasury
3. `buytickets` → credita ticket sales no `balance`
4. `claimwin` → debita payout do `balance` (nunca do house balance)
5. `closegame` → se lucro, `house_fee_bps` sweep pro house, resto disponível
6. Sponsor retira saldo disponível via `withdraw`

**Colateral:** `activateroom` só permite se:
```
locked ≥ estimated_monthly_tickets × max_multiplier_gametype × ticket_price_max
```

### 6. `buytickets` — Fluxo modificado

```cpp
void buytickets(name buyer, uint64_t game_id,
    vector<vector<char>> matrices,
    vector<signature> signatures,
    uint64_t nft_id,
    extended_asset requested_price);
```

- `nft_id` único, acoplado na signature (hash = matrix + game_id + buyer + nft_id)
- UI mostra NFTs elegíveis, default = melhor benefício para jogador
- Em sala de sponsor: `total_cost` credita `room_treasury`, não house balance
- `TICKET_DISCOUNT`: absorvido pelo treasury da sala (sponsor)
- Se consumível: decrementa mutable data via `setassetdata`
- Valida `nft_template_allowlist` da sala

### 7. `claimwin` — Fluxo modificado com Prize Boost

```cpp
void claimwin(uint64_t game_id, uint64_t ticket_id,
    uint8_t ball_count, uint64_t win_pattern_mask,
    uint16_t golden_multiplier,
    vector<uint64_t> boost_nft_ids);
```

**Prize Boost (sala sponsor):**
- Worker passa `boost_nft_ids[]` ordenados por payout decrescente
- Contrato valida NFTs, confere PRIZE_BOOST rule, deserializa schema field
- Aplica boosts um por ticket: maior payout recebe maior boost, e assim por diante
- Débito do room_treasury
- Se consumível: decrementa mutable data

**Sala house:** mesmo fluxo, débito do house balance, sem boost (a menos que
house configure PRIZE_BOOST nos próprios templates).

Sponsor pool (`game_state.sponsor_pool`) removido — substituído pelo treasury.

### 8. Burn — Detecção Híbrida Off-chain

Sem `burnnft` action. Sem dependência de `on_logburnasset` (inline action que não
dispara `require_recipient`). Burn é detectado via AtomicAssets API.

**Fluxo:**
1. Player queima NFT via `atomicassets::burnasset` (qualquer interface: AtomicHub,
   marketplace, etc.)
2. **Sincronização:**
   - **Automática:** worker cron varre usuários ativos → AtomicAssets API →
     compara com `nftburns` → chama `recordburn`
   - **Manual:** botão "Sincronizar queimas" no perfil do jogador → frontend detecta
     burns via API → worker registra
3. Worker chama `recordburn(owner, asset_id, template_id)` (`auth: bingogamesvc`)
4. Contrato registra `nftburns` + (se `BURN_TO_CLAIM`) `nftgrants`
5. `buytickets`/`claimwin` valida `BURN_TO_CLAIM` on-chain

**Tabelas:**
```cpp
struct [[eosio::table("nftburns")]] nft_burn {
    uint64_t     burn_id;
    name         owner;
    uint64_t     asset_id;
    uint64_t     template_id;
    name         collection;
    time_point   burned_at;
    uint64_t primary_key() const { return burn_id; }
    uint64_t by_owner()    const { return owner.value; }
};

struct [[eosio::table("nftgrants")]] nft_grant {
    uint64_t     grant_id;
    name         owner;
    uint64_t     template_id;
    uint8_t      rule_type;
    time_point   grant_until;
    uint64_t primary_key() const { return grant_id; }
    uint64_t by_owner()    const { return owner.value; }
};
```

**Trust model:** worker é trusted (mesmo do `claimwin`). Prova off-chain via
AtomicAssets API. Contrato não valida o burn on-chain.

### 9. XP/Leveling Engine (Off-chain)

Worker services no `worker-game-loop`:

| Evento | XP Base | Notas |
|---|---|---|
| Comprar N cartelas | `N × 1` | |
| Vitória (dificuldade) | `10 × diff` | diff = parâmetro da sala, on-chain `room_record.difficulty` |
| Vitória VIP | `25 × diff` | sala premium |
| Completar combinação | `15` | |
| Daily streak (dia N) | `N × 2` | cap 30 |
| Queimar NFT | `50 + rarity × 10` | rarity lida do schema AtomicAssets |
| Conquista | variável | definido por achievement |

#### Curva XP: φ-tier (Fibonacci é ratio)

9 tiers × 25 níveis = 225 níveis. Cada tier incremental = φ × 1.618 (razão áurea,sequência de Fibonacci).

| Tier | Níveis | XP total | XP médio/lvl |
|---|---|---|---|
| Cobre | 1→25 | 906 | ~36 |
| Bronze | 26→50 | 2.371 | ~59 |
| Prata | 51→75 | 4.742 | ~95 |
| Ouro | 76→100 | 8.579 | ~153 |
| Platina | 101→125 | 14.788 | ~248 |
| Esmeralda | 126→150 | 24.835 | ~402 |
| Safira | 151→175 | 41.092 | ~650 |
| Rubi | 176→200 | 67.397 | ~1.052 |
| Diamante | 201→225 | 109.959 | ~1.702 |

```ts
const PHI = 1.618034;
const BASE_XP = 906;
const TIERS = ['Cobre','Bronze','Prata','Ouro','Platina','Esmeralda','Safira','Rubi','Diamante'];

// XP incremental do tier t (0-indexado): BASE_XP × φ^t
function tierXp(t: number): number {
    return Math.floor(BASE_XP * Math.pow(PHI, t));
}

// XP total cumulativo ate o tier t (inclusive)
function tierThreshold(t: number): number {
    // Soma da PG: BASE_XP × (φ^(t+1) - 1) / (φ - 1)
    return Math.floor(BASE_XP * (Math.pow(PHI, t + 1) - 1) / (PHI - 1));
}

// XP total cumulativo ate o level n (1-indexado, 1-225)
function totalXp(level: number): number {
    const t = Math.min(8, Math.floor((level - 1) / 25));
    const inTier = level - t * 25; // 1-25 dentro do tier
    const prev = t > 0 ? tierThreshold(t - 1) : 0;
    const range = tierXp(t);
    return prev + Math.floor(range * Math.pow(inTier / 25, 2)); // quadrático intra-tier
}

function deriveLevel(xp: number): { level: number; tier: string; sub_level: number } {
    // busca binária em totalXp() para achar o level
    let lo = 1, hi = 225;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (totalXp(mid) <= xp) lo = mid;
        else hi = mid - 1;
    }
    const t = Math.min(8, Math.floor((lo - 1) / 25));
    return { level: lo, tier: TIERS[t], sub_level: ((lo - 1) % 25) + 1 };
}
```

#### Difficulty on-chain

`room_record.difficulty` (uint8, binary_extension, 0-10, default 1) definido no contrato e populado via `setroommeta` — independência do contrato. Worker lê on-chain ao conceder XP de vitória.

#### Daily streak (lazy)

Checado dentro de `awardPlayerXP`: se `last_date` < hoje → incrementa streak (cap 30). Se gap > 1 dia → reset para 1. Streak bonus = `count × 2` XP adicionado ao award.

#### Rarity da NFT queimada

Worker implementa deserializador ALPHA AtomicAssets (`atomicSchema.ts`, espelhando o parser do contrato 2B) para ler `immutable_serialized_data` do template e extrair campo `rarity`. Fallback: 1 (raridade comum).

Armazenamento: MongoDB `userprofiles.progression` — mesma collection do api-gateway. Worker escreve via `$inc` atômico. Sem retroatividade — só acumula da implementação em diante.

### 10. External Collections + Field Mapping

Sponsor cadastra template com mapeamento de campos:
```json
{
  "collection": "meusnfts",
  "template_id": 5,
  "field_maps": [
    { "nft_field": "raridade", "system_field": "ticket_discount" }
  ],
  "rules": [
    { "type": "ticket_discount", "value_source": "schema_field",
      "schema_field": "raridade", "max_uses": 0 }
  ]
}
```

Cadastro valida que schema da coleção tem campos mapeados e tipos compatíveis.

Se coleção externa não autorizar `bingogamectr` como `authorized_account`, consumíveis
caem para fallback `nftusage` (sem proteção cross-transfer).

## Opções Consideradas

### Schema: deserialização no worker apenas vs. dupla
**Escolhido:** dupla (worker + contrato). Worker pré-computa por performance; contrato
re-valida por segurança. Impede que worker comprometido infle benefícios.

### Burn: `burnnft` action vs. detecção API
**Escolhido:** detecção via AtomicAssets API. `burnnft` forçaria jogador a queimar
pelo nosso sistema — risco de perder benefício se queimar via AtomicHub.
`on_logburnasset` não funciona (inline action, sem `require_recipient`).

### Treasury: `balances_table` estendida vs. tabela nova
**Escolhido:** `room_treasuries` (tabela nova). `balances_table` é scoped por `name`
(12 chars), incompatível com `uint64` room_id. Tabela dedicada é mais clara.

### Prize Boost: worker pré-computa vs. contrato avalia tudo
**Escolhido:** contrato avalia (Opção B do grill). Worker passa `nft_ids[]`,
contrato valida ownership + schema + regra + aplica. Mais seguro.

## Consequências

- `nftconfigs` atual com `discount_pct`/`is_vip` desaparece — dev reset, sem backward compat
- `setnftconf` action removida, substituída por `confignft`
- `buytickets` assinatura agora acopla `nft_id` — frontend precisa gerar signature com
   o nft_id incluso no hash
- `claimwin` payload muda (`boost_nft_ids[]`) — worker precisa pré-computar e ordenar
- `sponsor_pool` em `game_state` permanece para jogos legados (não-sponsor), mas não é
   mais populado para salas sponsor
- RAM tracking (nftburns, nftgrants) paga pelo **contrato** (`emplace(get_self())`):
  em `recordburn` quem assina é o worker (`bingogamesvc`), não o player — não há como
  cobrar RAM do `owner` sem a autorização dele. (Correção da decisão original que
  assumia `payer = buyer`; `buyer` só vale em `buytickets`, onde o player assina.)
- MongoDB `player_progression` schema inalterado, apenas populado pelo worker
- Init_dev_env precisa seedar schema `utility` com campos adicionais
  (`boost_pct`, `rarity`, `tier`) e templates de exemplo com multi-regra

### Faseamento da implementação (branches/PRs)

Implementação faseada — cada fase em sua branch, merge entre fases:

- **Fase 1 (contrato, branch `feature/adr-028-fase1-contrato`):** sub-commits 1a–1e —
  `nftconfigs` multi-regra (`confignft`), economia de sala patrocinada
  (`room_treasuries`, colateral, `house_fee_bps`), `buytickets`/`claimwin`/`closegame`
  com fluxo de treasury, motor de burn (`recordburn`/`nftburns`/`nftgrants`).
- **Fase 2 (worker, branch `feature/adr-028-fase2-worker`) — implementado:**
  - **2A — prize boost** (§7): `claimwin.boost_nft_ids` (binary_extension), worker
    `nftMechanics.getBoostNftIds`, contrato aplica o maior PRIZE_BOOST FIXED. Todos os
    callers passam o campo explícito (wharfkit não omite binary_extension de array).
  - **2B — deserialização de schema field on-chain** (§2): parser ALPHA AtomicAssets no
    contrato (`_aa_walk`/`_read_schema_numeric`). `TICKET_DISCOUNT VALUE_SCHEMA_FIELD`
    lê o campo do template/asset e aplica. **Gotcha:** identificadores de atributo do
    AtomicAssets começam em **4** (índice = `identifier - 4`). Validado E2E com
    `utility.discount_pct`.
  - **2F — `PRIZE_BOOST VALUE_SCHEMA_FIELD`** (§7, reusa o deserializador do 2B):
    contrato (`claimwin`) e worker (`nftMechanics.getBoostTemplates`) resolvem o boost
    lendo o campo numérico (hundredths) do schema do template, com clamp on-chain em
    25500 (255×) e validação dupla. `FIXED` e `SCHEMA_FIELD` coexistem na mesma config
    (usa o maior). Campo ausente/não-numérico → boost 0 (ignora template). Validado E2E
    (harness `BS-0..5`: `discount_pct=200` → payout 2.00× no `claimwin`) + unit no worker.
- **Ainda pendente na Fase 2:**
  - `nft_id` no **hash da signature** de `buytickets` (§6) — é a **Fase 3 (api-gateway)**:
    a assinatura é gerada no `ticketController`, não no worker.
  - Decremento de **consumível** via mutable data (`setassetdata`) (§3).
  - 2C — burn sync cron (worker → AtomicAssets API → `recordburn`) + consumo dos
    **grants** `BURN_TO_CLAIM` em `buytickets`/`claimwin` (§8).
  - **2D — XP/achievement engine (§9): implementado.** φ-tier curve, 225 níveis,
    9 tiers (Cobre→Diamante). Difficulty on-chain no `room_record`. Worker
    `xpEngine.ts` com hooks em win/combo/burn/compra. Daily streak lazy. Rarity
    via deserializador ALPHA no worker (`atomicSchema.ts`).
  - Param `boost_nft_ids` + aplicação do **prize boost** no `claimwin` (§7). Tentou-se
    adicioná-lo como `binary_extension` trailing, mas o wharfkit (antelope 1.2.0) **não
    omite binary_extension de array** na codificação → quebraria os callers atuais do
    worker. Adiado p/ Fase 2 (lockstep com o worker). O débito do payout no
    `room_treasury` e a `house_fee_bps` no `closegame` permanecem (não dependem do param).
- Os campos novos de `rooms` usam `binary_extension` (trailing/`$`) → linhas de salas
  pré-existentes continuam desserializando; E2E permanece verde.
- **Gotcha de assinatura no harness (ADR-026):** actions admin do `bingogamectr`
  exigem a permissão `admin` (linkauth); `bingogamesvc@active` não a satisfaz. Tickets
  são assinados com a chave de `signer_key` = `bingogamesvc` (microservice). O harness
  foi corrigido para refletir isso (branch separada, escopo de plataforma).
