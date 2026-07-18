# ADR-058 — ORNG Notify On-Chain (`randnotify`)

- Status: Proposta (aguardando aprovação do usuário antes de mexer no `.cpp`/`.abi`)
- Data: 2026-07-18
- Tags: Blockchain, Contract, ORNG, Randomness, Event-Driven
- Corrige/estende: plano v7 (Fase B/B2 — `receiverand`), grill-v6 (FC1)
- Issue: Fase B (B2 — handler `receiverand`)

## Contexto

O fluxo de sorteio (`draw`) do contrato `bingogamectr` solicita aleatoriedade à ORNG via `requestrand` e recebe via callback `receiverand`. A grill-v6 (FC1) identificou que o modelo atual tem uma limitação: o contrato depende do **callback assíncrono** da ORNG, que pode atrasar ou falhar.

A Fase B (B2) implementou o handler `receiverand` no worker: quando o State Watcher detecta a ação `receiverand` on-chain (via Firehose), o worker publica `game:state_changed` e o handler executa `claimwin`/`refund`. Isso desacopla o worker do callback, mas o **contrato ainda usa o modelo de callback legado**.

## Decisão

Adotar o **ORNG Notify On-Chain (`randnotify`)** — o modelo oficial da ORNG v3.2.1 (RNG-V2) — que entrega a aleatoriedade via uma **ação on-chain `randnotify`** (em vez de callback `receiverand` tradicional), com as seguintes mudanças no contrato:

1. **Action `randnotify`**: nova action que recebe `random_value` e processa o draw (substitui/complementa o `receiverand` legado).
2. **Backport `_deliver_random`**: reutilizar a lógica de entrega de aleatoriedade existente (do fork ORNG local) para a nova action.
3. **Allowlist**: a ORNG (ou o `orng` account) deve estar na allowlist do contrato para chamar `randnotify` (segurança — só a ORNG autorizada entrega aleatoriedade).
4. **Migração `random_value`**: o campo `random_value` na struct `games` (ou na action) passa a ser `eosio::binary_extension<checksum256>` — necessário porque o `checksum256` exige ABI específica e o `binary_extension` garante retrocompatibilidade com jogos antigos.

**Por que `randnotify` em vez de callback:** o modelo de notify (ação on-chain) é mais observável — o State Watcher (B1) já detecta a ação `randnotify` via Firehose e o worker reage. Não há dependência de callback assíncrono opaco; o evento é First-Class na blockchain.

**Consumo (após deploy):**
- Worker `rabbitmq.ts` handler `receiverand` (B2) passa a tratar `randnotify` (ou ambos, durante migração).
- State Watcher (B1) já filtra `act.account == 'bingogamectr'` — `randnotify` é detectada automaticamente.

## Consequências

### Positivas
- Aleatoriedade entregue via ação on-chain observável (não callback opaco).
- State Watcher detecta o draw imediatamente (latência sub-segundo).
- Retrocompatível (`binary_extension<checksum256>`): jogos antigos sem o campo continuam válidos.
- Allowlist garante que só a ORNG autorizada entrega aleatoriedade (segurança).

### Negativas / trade-offs
- Mexe em contrato on-chain (irreversível após deploy mainnet) → exige aprovação explícita do usuário + deploy testnet primeiro.
- `setabi` altera o ABI (campo `random_value` como `checksum256`) → todos os consumidores devem ler o novo formato.
- Backport de `_deliver_random` exige testes de regressão (o fork ORNG local pode divergir da v3.2.1 oficial).

## Verificação (após aprovação + deploy testnet)
1. `cleos set contract bingogamectr` (setcode + setabi) na testnet.
2. `requestrand` → ORNG entrega via `randnotify` (não callback).
3. State Watcher detecta `randnotify` → worker executa `claimwin`/`refund`.
4. Jogo antigo (sem `random_value` bin_ext) ainda funciona (fallback).
5. Allowlist: conta não-autorizada NÃO consegue chamar `randnotify`.

## Referências
- grill-v6 (FC1): `agent://grill/2026-07-17-engine-event-driven-grill-v6`
- ORNG v3.2.1 RNG-V2 doc: `agent://research/2026-07-17-orng-v321-rng-v2`
- `contracts/bingo/src/bingo.cpp` — `receiverand` (1010), `requestrand` (985).
- `contracts/orng` — fork ORNG local (legado, para backport `_deliver_random`).
- `apps/worker-game-loop/src/services/rabbitmq.ts` — handler `receiverand` (B2).
