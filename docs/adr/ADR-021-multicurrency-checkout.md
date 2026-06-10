# ADR-021 — Checkout Multi-Moeda via bingo.swap

**Status:** Accepted
**Data:** 2026-06-10
**Decisores:** Iuri Neumann, Claude

---

## Contexto

O `BuyTicketModal` aceita apenas a moeda padrão da sala (ex.: WAX). Jogadores que possuem
saldo em outros tokens aprovados no `bingo.swap` (ex.: BINGO) precisam converter manualmente
antes de comprar cartelas — fricção que reduz conversão.

O `bingo.swap` (ADR-018) com taxa de serviço configurável (ADR-019) já provê a infraestrutura
on-chain necessária para conversão. Falta expor esse caminho no checkout.

### Restrições herdadas

- O preço da cartela e o prêmio são sempre na **moeda padrão da sala** — invariante do domínio.
- A janela de funding tem prazo (`end_time`); cotações expiradas não devem ser aceitas.
- Nenhuma chave privada da plataforma pode assinar transações por conta do jogador — o
  Wharfkit garante que apenas a carteira do usuário assina.
- Transparência on-chain: todos os valores (fee, slippage, min_out) devem ser visíveis ao
  usuário antes da confirmação.

---

## Decisão

### 1. Endpoints de Quote (API-Gateway — somente leitura)

#### `GET /api/v1/swap/pools`

Retorna pools ativas lidas diretamente do nodeos (tabela `pools` do `bingo.swap`).
Usado pelo frontend para filtrar quais moedas alternativas o usuário pode usar.
Cache de 10 s em Redis (pools mudam raramente; evita N chamadas por usuário em lobby).

#### `GET /api/v1/swap/quote`

```
Query: from_contract, from_symbol, to_contract, to_symbol, amount_out, game_end_time?
```

Lê o estado atual do pool (reservas, fee_bps, service_fee_bps) e computa o **reverse AMM**:
dado o `amount_out` (custo da cartela em moeda da sala), quanto o usuário precisa enviar
em moeda alternativa (`amount_in`)?

```
net_out_avail = reserve_out - amount_out
net_amount_in = (reserve_in × amount_out × 10000)
                / (net_out_avail × (10000 − fee_bps))
amount_in     = ceil(net_amount_in × 10000 / (10000 − service_fee_bps))
```

Resposta inclui:
- `pool_id`, `amount_in`, `amount_out`, `fee_bps`, `service_fee_bps`
- `price_impact_pct` — impacto no pool (sinaliza liquidez insuficiente)
- `min_out` — `amount_out` com 0,5% de margem de segurança embutida
- `expires_at` — `now + min(30s, game_end_time - now - 5s)`
- `quote_id` — UUID para rastreabilidade em logs

Não há endpoint de `execute`: a transação é construída e assinada pelo frontend via Wharfkit.
O backend é somente-leitura para quotes — não custodia fundos, não assina transações.

### 2. Fluxo on-chain (Wharfkit — 3 ações em 1 transação)

Quando o usuário confirma com moeda alternativa, o frontend constrói **uma única transação**
com 3 actions atômicas:

```
Action 1: <token_contract>::transfer(user → bingo.swap, amount_in, "swap,<pool_id>,<min_out>,<user>")
Action 2: <room_token_contract>::transfer(user → bingo.game, amount_out, "deposit")
Action 3: bingo.game::buytickets(buyer, game_id, matrices, signatures, requested_price)
```

**Por que 3 actions e não uma notificação direta para `bingo.game`?**
- Action 1 executa o swap e credita `amount_out` ao usuário no token da sala.
- Action 2 deposita esse montante no `bingo.game` (creditado em `balances` via `on_transfer`).
- Action 3 debita de `balances` e compra as cartelas.
- EOSIO garante atomicidade: se qualquer action falha, toda a transação reverte.
- Nenhuma mudança no contrato `bingo.game` necessária.

**Slippage:** `min_out` fornecido pelo quote protege contra variações de reserva entre a
cotação e a execução. Se o pool variar mais de ~0,5%, a transação reverte com erro do contrato.

### 3. Seletor de moeda no `BuyTicketModal`

Lógica de filtragem no frontend:
1. Consulta `/swap/pools` para obter os pares disponíveis.
2. Lê saldos do usuário via `eosio.token::get_table_rows` (scoped pelo wallet) para cada
   token em pool que roteia para a moeda da sala.
3. Exibe apenas tokens onde o usuário tem saldo > 0 E existe pool com caminho para a moeda da sala.
4. **Default: moeda da sala** (sem swap). Se o usuário já tem saldo na moeda da sala, não
   é necessário nenhum swap.

A cotação é obtida **ao selecionar a moeda** (não ao abrir o modal) e exibida em destaque:
- Valor a enviar (moeda alternativa)
- Taxa de serviço e taxa LP estimadas
- Impacto no pool (%)
- Validade da cotação (countdown)

Se a cotação expirar antes da confirmação, o frontend recarrega automaticamente.

### 4. Não-decisões (fora de escopo deste ADR)

- Roteamento multi-hop (A→B→C): apenas pares diretos no ADR-021; multi-hop = ADR futura.
- Slippage configurável pelo usuário: fixo em 0,5% na cotação. UI para ajuste = futura.
- Nenhum endpoint `POST /swap/execute` — a plataforma não assina transações por conta do usuário.

---

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| API executa swap (custodia chaves) | Viola modelo de segurança WAX — usuário deve assinar |
| Cotação assinada ECDSA verificada on-chain | Requer mudança no contrato `bingo.game`; complexidade desnecessária para MVP |
| Roteamento automático multi-hop | Fora de escopo; aumenta superfície de ataque e complexidade de UI |
| Moeda do prêmio configurável | Viola invariante ADR-005/ADR-010 (prêmio = moeda da sala) |

---

## Consequências

- Novo controller `swapController.ts` no api-gateway (somente leitura, sem auth obrigatória).
- `BuyTicketModal` ganha seletor de moeda + exibição de cotação.
- `useTicketPurchase` estendido: quando `swapAction` fornecida, inclui as 3 actions na tx.
- `shared-types`: `SwapQuote`, tipo estendido de `BlockchainSwapPool`.
- OpenAPI: 2 novos endpoints documentados.
- Cypress Tier 1: testes com `cy.intercept` mockando `/swap/pools` e `/swap/quote`.
- Sem mudança no contrato `bingo.game` ou `bingo.swap`.
