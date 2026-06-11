# ADR-019 — bingogameswp: Taxa de Serviço por Pool (`service_fee_bps`)

**Status:** Accepted
**Data:** 2026-06-09
**Decisores:** Iuri Neumann, Claude

---

## Contexto

O contrato `bingogameswp` (ADR-018) implementa o AMM x*y=k com uma taxa LP (`fee_bps`) que
fica nas reservas do pool — beneficiando exclusivamente os provedores de liquidez.

A plataforma precisa de uma segunda taxa, independente da taxa LP, que:

- Financie a operação do serviço (treasury da `bingogamectr`).
- Seja configurável por pool (pares diferentes podem ter tarifas diferentes).
- Permita campanhas temporárias de fee-zero ou descontos por tipo de usuário.
- Seja completamente transparente on-chain — nenhum usuário paga mais do que o contrato declara.

---

## Decisão

### Campo `service_fee_bps` no `pool_record`

Campo `uint16_t service_fee_bps` adicionado à tabela `pools`. Default: **0** (desativado na
criação do pool). Máximo: **500 bps (5%)** — validado no `setpoolfee`.

A separação da taxa LP e da taxa de serviço é intencional:

| Taxa            | Destino      | Quem configura | Beneficiário       |
| --------------- | ------------ | -------------- | ------------------ |
| `fee_bps`       | Reservas     | `creator`      | Provedores de LP   |
| `service_fee_bps` | Treasury   | Admin (`get_self()`) | Plataforma   |

### Dedução `ANTES` da fórmula AMM

```
service_fee  = amount_in × service_fee_bps / 10000
net_amount_in = amount_in - service_fee
amount_out    = AMM(net_amount_in, reserve_in, reserve_out, fee_bps)
```

A `service_fee` **não entra nas reservas** → o `k` do pool não é inflacionado artificialmente.
Provedores de liquidez só vêem o `net_amount_in`, sem distorção da mecânica AMM.

### Treasury

Campo `name treasury` adicionado ao singleton `swap_state`. Default: `bingogamectr`.
Configurável via `settreasury(account)` — `require_auth(get_self())`.

A `bingogamectr` já tem `sweepggr` (ADR-005) para gerenciar receitas on-chain; concentrar as
service fees lá mantém a contabilidade unificada.

### Novas actions

| Action | Auth | Descrição |
| --- | --- | --- |
| `settreasury(account)` | `get_self()` | Altera a conta que recebe as service fees |
| `setpoolfee(pool_id, service_fee_bps)` | `get_self()` | Configura a service fee de um pool específico |

### Campanhas e flexibilidade

- `setpoolfee(pool_id, 0)` — fee-zero para campanha de onboarding.
- Pools de pares "premium" (ex.: token parceiro) podem ter `service_fee_bps` diferente.
- Em produção, o contrato `bingogamectr` pode chamar `setpoolfee` via inline action para
  campanhas programáticas (ex.: fee-zero durante eventos).

---

## Phase 2 — Descontos por NFT (planejado, não implementado)

Usuários holders de NFTs específicos poderão obter descontos na `service_fee_bps`.

**Design previsto:**

```cpp
// Tabela nftfeerules (scope: get_self())
struct nft_fee_rule {
    uint64_t id;
    uint64_t pool_id;       // 0 = todos os pools
    name     nft_contract;  // ex: "atomicassets"
    uint32_t template_id;   // AtomicAssets template ID
    uint16_t fee_bps;       // service_fee_bps com desconto
};

// Tabela feediscounts (scope: account), TTL 24h
struct fee_discount {
    uint64_t id;
    uint64_t pool_id;
    uint16_t fee_bps_override;
    uint64_t nft_asset_id;
    uint32_t expires_at;
};
```

`claimdiscount(provider, pool_id, nft_asset_id)` verificará propriedade do NFT via
leitura da tabela `atomicassets::assets` (scoped por account) e armazenará o desconto
com TTL de 24h. O swap consultará `feediscounts` antes de aplicar a `service_fee_bps`.

**Motivo do adiamento:** requer integração com AtomicAssets, testando serialização de
struct complexo. Aguarda sprint de NFT integrations.

---

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| `service_fee` hard-coded no contrato | Sem flexibilidade para campanhas |
| Fee deduzida do `amount_out` | Prejudica a comparabilidade do slippage; confunde o usuário |
| Fee separada só via API (off-chain) | Não auditável on-chain; viola transparência GameFi |
| Taxa única (LP + serviço juntas) | Prejudica provedores de LP que recebem menos do esperado |

---

## Consequências

- `pool_record` ganhou campo `service_fee_bps` — **não é `binary_extension`** pois o
  ambiente é dev-only e não há dados on-chain para preservar.
- `swap_state` ganhou campo `treasury` — idem.
- `init_dev_env.sh` chama `settreasury bingogamectr` e `setpoolfee 1 100` no bootstrap.
- Harness Passo 10 valida: `settreasury`, `setpoolfee`, dedução correta, campanha fee-zero.
- `shared-types`: `BlockchainSwapPool.service_fee_bps` e `BlockchainSwapState.treasury`.
- ABI atualizado manualmente com 2 novos structs e 2 novas actions (CDT omite tabelas — padrão do projeto).
