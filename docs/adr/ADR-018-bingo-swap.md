# ADR-018 — bingo.swap: DEX AMM x*y=k

**Status:** Accepted
**Data:** 2026-06-09
**Decisores:** Iuri Neumann, Claude

---

## Contexto

A plataforma precisa de liquidez interna para converter WAX ↔ BINGO (e outros pares futuros) sem
depender de DEXs externas (Alcor, Defibox). Isso permite que jogadores comprem cartelas diretamente
com WAX, e que o treasury do GGR recicle capital dentro do ecossistema.

---

## Decisão

Implementar um contrato AMM separado `bingo.swap` (conta WAX: a definir em produção) com a fórmula
**constant product x*y=k** (tipo Uniswap v2).

### Allowlist de tokens aprovados

O contrato mantém uma tabela `allowedtoks` de `extended_symbol`s aprovados pelo admin. Apenas
`get_self()` pode chamar `addtoken` / `deltoken`.

`createpool` valida **ambos** os tokens contra a allowlist antes de criar o pool. Isso garante que
a validação em `on_transfer` seja sempre executada contra dados confiáveis — eliminando o vetor de
**fake-token injection** (wildcard `"*::transfer"` + pool permissionless que é o ataque clássico
em DEXs EOSIO).

A allowlist usa índice secundário `uint128_t` = `(contract.value << 64) | symbol_code.raw()`,
garantindo unicidade completa de `(contract, symbol)` sem colisão possível. Essa combinação
funciona identicamente em qualquer chain Antelope (WAX, EOS, Telos, etc.).

A criação de pools permanece **permissionless** (qualquer conta pode chamar `createpool`), mas
limitada a pares de tokens previamente aprovados — modelo adotado por Defibox e Alcor.

### Conta do contrato

Separada de `bingo.game` por princípio de menor privilégio — o swap não precisa de permissões de
`microservice` nem acessa tabelas do bingo.

### Fórmula de swap

```text
amount_out = reserve_out * amount_in * (10000 - fee_bps)
             / (reserve_in * 10000 + amount_in * (10000 - fee_bps))
```

Aritmética em `int128_t` para evitar overflow mesmo com reservas grandes.

### Taxa

`fee_bps` configurada por pool no momento da criação. Padrão recomendado: **30 bps (0.30%)**.
Máximo: 1000 bps (10%). A taxa fica nas reservas (beneficia provedores de liquidez).

### Fluxo de swap

O usuário envia o token A diretamente para o contrato via `eosio::transfer` com memo:

```text
swap,<pool_id>,<min_out>[,<destinatário>]
```

O contrato responde com uma inline `transfer` do token B para o destinatário na mesma transação.

### Fluxo de add liquidity (dois tokens)

Como o WAX/Antelope não suporta multi-token atomicamente:

1. Provider envia token A → memo `deposit,<pool_id>`
2. Provider envia token B → memo `deposit,<pool_id>`
3. Provider chama `addliq(provider, pool_id, min_lp)`
   - O contrato consome os dois depósitos pendentes
   - Emite LP proporcional; devolve excesso do token sobre-alocado
4. Se desistir: `canceldep(provider, pool_id)` devolve ambos

Janela de expiração dos depósitos pendentes: **10 minutos**.

### LP tokens

Rastreados na tabela `lpbalances` (scoped por account), não como token EOSIO padrão. Simplificação
adequada para v1 — evita deploy de contrato de token separado.

**Inicialização do pool:** `LP = sqrt(dep_a × dep_b) − 1000`
As 1000 dead shares prevenem o ataque clássico de manipulação de preço inicial (LP inflation attack).

### Tabelas

| Tabela        | Scope   | Descrição                                   |
| ------------- | ------- | ------------------------------------------- |
| `swapstate`   | self    | Singleton: `next_pool_id` + `next_token_id` |
| `allowedtoks` | self    | Allowlist de `extended_symbol`s aprovados   |
| `pools`       | self    | Pools AMM com reservas e fee                |
| `pending`     | account | Depósitos pendentes (TTL 10 min)            |
| `lpbalances`  | account | Saldo LP por pool                           |

### Índice secundário

`pools` tem índice `bypair` (uint128_t) = `(sym_a.code.raw << 64) | sym_b.code.raw` para lookup
eficiente por par de tokens sem scan full-table.

`allowedtoks` tem índice `bysym` (uint128_t) = `(contract.value << 64) | symbol_code.raw()`
cobrindo os 64 bits completos de cada campo — sem colisão possível entre contratos distintos.

---

## Alternativas consideradas

| Alternativa                       | Motivo de rejeição                                            |
| --------------------------------- | ------------------------------------------------------------- |
| Usar Alcor/Defibox externamente   | Dependência de terceiros; sem controle sobre liquidez         |
| AMM com tick ranges (Uniswap v3)  | Complexidade desnecessária para v1                            |
| LP como token EOSIO padrão        | Requer contrato adicional; tabela interna é suficiente para v1|
| Fórmula de preço fixo (order book)| Exige market maker; AMM é autoequilibrante                    |
| createpool admin-only             | Menos escalável; allowlist já protege contra fake tokens      |

---

## Consequências

- O contrato `bingo.swap` deve ser deployado em conta separada (ex.: `bingo.swap11`).
- A conta precisa da permissão `active` para enviar `transfer` inline (eosio.code).
- Primeiro deploy requer chamadas `addtoken` para cada token aprovado (WAX, BINGO, etc.).
- A API-gateway pode chamar `on_transfer` indiretamente via cleos/Wharfkit para facilitar swaps
  no fluxo de compra de cartelas.
- Integração com o frontend fica fora do escopo desta ADR (ADR-019 se necessário).
- Harness E2E: Suite 9 (`apps/harness/tests/swap.test.ts`) valida addtoken → createpool →
  addliq → swap WAX→BINGO → swap BINGO→WAX → remliq parcial → canceldep + 7 security guards.
- `init_dev_env.sh` cria conta `bingo.swap`, deploya o contrato e registra WAX+BINGO na allowlist
  automaticamente no bootstrap completo do ambiente de desenvolvimento.
- `shared-types` exporta `BlockchainSwapState`, `BlockchainAllowedToken`, `BlockchainSwapPool`,
  `BlockchainPendingDeposit`, `BlockchainLpBalance` para uso cross-package.
