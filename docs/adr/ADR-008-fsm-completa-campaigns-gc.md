# ADR-008: FSM Completa — Estado CREATED, Campanhas B2B e Garbage Collection

**Data:** 2026-05-26
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

A análise cruzada de `SPEC.md`, `COMPLIANCE.md` e `architecture.md` identificou três gaps
críticos no contrato C++ que bloqueiam o lançamento:

1. **FSM incompleta:** `SPEC.md §1.2` especifica estado `CREATED` antes de `FUNDING`.
   A implementação anterior pulava diretamente para `funding` no `creategame()`.
   Sem `CREATED`, não é possível agendar rodadas futuras sem abri-las imediatamente.

2. **Ausência de Garbage Collection:** `SPEC.md §5.1` exige `cleargame()` para liberar
   RAM após quarentena de 24h. Sem ele, a RAM do contrato WAX cresce indefinidamente
   e os custos operacionais se tornam inviáveis.

3. **Fail-Safe incompleto:** `SPEC.md §5.2` e `COMPLIANCE.md §4` exigem `refundticket()`
   e `abortgame()` para garantir estorno O(1) sem intermediários. Sem eles, jogadores
   ficam com fundos bloqueados em caso de falha do oráculo — violação direta da
   Lei 14.790/2023.

4. **Motor B2B ausente:** `SPEC.md §1.4` especifica a tabela `campaigns` com fluxo
   trustless de patrocínio. A ausência bloqueia o modelo de receita B2B do brief.

---

## Decisões

### 1. Estado `CREATED` na FSM

`creategame()` agora inicia o jogo em `"created"_n`. A nova action `fundgame()`
(auth: `bingogamesvc`) realiza a transição `CREATED → FUNDING`. Isso permite:
- Agendar rodadas futuras sem abri-las imediatamente para vendas
- O worker controla o timing via cron/scheduler sem mexer no contrato

### 2. `abortgame(reason)` — LOCKED|DRAWING → ABORTED

Aceita auth de `bingogamesvc` (timeout automático) ou `get_self()` (halt manual admin).
Seta `end_time` para base de auditoria. Após abort, `refundticket()` fica liberado.

### 3. `refundticket(game_id, ticket_id)` — Callable por qualquer conta

Não exige auth específica — jogadores podem acionar o próprio estorno se a plataforma
estiver offline. Devolve `ticket_price` para a wallet interna do owner e apaga a linha
(libera RAM imediatamente, O(1)). Ref: COMPLIANCE.md §4, SPEC.md §5.2.

### 4. `cleargame(game_id, max_rows)` — GC iterativo com budget de CPU

`max_rows` limita a iteração ao budget de CPU do bloco WAX (~30ms).
Deve ser chamado repetidamente pelo worker até não restar linhas.
Aplica quarentena de 24h somente para `archived` (não para `aborted`).
Ao esvaziar todos os tickets, apaga também o registro do jogo.

### 5. `end_time` na tabela `games`

Setado em `claimwin()` (archived) e `abortgame()` (aborted).
Base para: quarentena de 24h do GC, auditoria de compliance e relatórios de RTP.

### 6. Tabela `campaigns` + `linkcampaign()` + `closecampaign()`

`deposit()` reconhece memo `"campaign:{id}"` para registrar budget trustless.
`linkcampaign()` injeta `payout_per_game` no `sponsor_pool` do jogo (aceita CREATED/FUNDING).
`closecampaign()` liquida o saldo residual conforme `leftover_policy` (refund/house).

### 7. Worker — novos handlers RabbitMQ

Adicionados: `fundgame`, `abortgame`, `refundall`, `cleargame`.
`refundall` varre a tabela de tickets e chama `refundticket()` com delay de 600ms
entre chamadas (respeita budget de CPU do bloco WAX).
`cleargame` itera em lotes de 50 com o mesmo delay.

---

## Consequências

**Positivas:**
- FSM fiel ao SPEC.md — nenhum gap de estado
- Compliance com Lei 14.790/2023 garantida pelo fail-safe automático
- RAM do contrato gerenciada de forma sustentável
- Modelo B2B desbloqueado: sponsors podem injetar liquidez trustless
- `end_time` viabiliza relatórios de RTP e auditoria cruzada com o ledger PostgreSQL

**Negativas / Riscos:**
- `creategame()` agora requer chamada adicional `fundgame()` — harness e scripts
  de bootstrap precisam ser atualizados
- `refundall` e `cleargame` no worker são lentos por design (respeito ao budget de CPU)
  — para jogos com muitos tickets, o processo pode levar vários minutos
- `campaigns`: `payout_per_game` é fixo por campanha — se o admin quiser valores
  diferentes por jogo, precisará criar campanhas separadas

---

## Arquivos Afetados

- `contracts/bingo/include/bingo.hpp` ← ATUALIZADO
- `contracts/bingo/src/bingo.cpp` ← ATUALIZADO
- `packages/shared-types/src/index.ts` ← ATUALIZADO
- `apps/worker-game-loop/src/services/blockchain.ts` ← ATUALIZADO
- `apps/worker-game-loop/src/services/rabbitmq.ts` ← ATUALIZADO
- `apps/harness/tests/fsm.test.ts` ← PENDENTE atualização (CREATED state + campaigns)
