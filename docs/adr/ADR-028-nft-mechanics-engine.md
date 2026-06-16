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
| Vitória (dificuldade) | `10 × diff` | diff = parâmetro da sala (1-10) |
| Vitória VIP | `25 × diff` | sala premium |
| Completar combinação | `15` | |
| Daily streak (dia N) | `N × 2` | cap 30 |
| Queimar NFT | `50 + rarity × 10` | rarity lida do schema |
| Conquista | variável | definido por achievement |

Armazenamento: MongoDB `player_progression` (estrutura `xp`/`tier`/`games_played`
já existe, vazia). Sem retroatividade — só acumula da implementação em diante.

Curvas de level a calibrar via simulação: quadrática, Fibonacci, log-linear.

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
- **Diferido para a Fase 2 (worker), em lockstep com quem assina/computa:**
  - `nft_id` no **hash da signature** de `buytickets` (§6) — quebra toda assinatura
    existente; muda junto do worker/frontend que assinam.
  - Decremento de **consumível** via mutable data (`setassetdata`) (§3).
  - **Deserialização de schema field on-chain** (§2, "1f") — par de segurança do
    schema-precompute do worker; validação dupla só é testável end-to-end com o worker.
    Até lá, `VALUE_SCHEMA_FIELD` é configurável (validado em `confignft`) mas não
    consumido on-chain; apenas `VALUE_FIXED` é aplicado.
  - Consumo dos **grants** `BURN_TO_CLAIM` em `buytickets`/`claimwin` (§8).
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
