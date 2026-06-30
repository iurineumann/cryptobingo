# ADR-013: Modo de Sorteio MULTI_MATCH — Estágios Progressivos

**Data:** 2026-06-01
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

ADR-012 implementou os modos FIXED, FIRST_FULL e GOLDEN_BALL e registrou o MULTI_MATCH como
diferido. Este ADR especifica e implementa o modo `multimatch`, que mantém os jogadores
engajados durante toda a partida ao distribuir prêmios em estágios progressivos.

---

## Regras do Modo MULTI_MATCH

1. O gametype define N estágios ordenados, cada um com `patterns_required` (número de padrões
   simples a completar) e `weight` (peso do prêmio).
2. **Cutoff ball por estágio:** o estágio K fecha na bola em que o **primeiro ticket** do jogo
   atinge `patterns_required[K]` padrões completados. Tickets que alcançam o requisito **na
   mesma bola ou antes** ganham o prêmio do estágio K.
3. **Acumulação de prêmios:** um ticket pode ganhar múltiplos estágios. Ganhar o estágio 1 não
   impede o mesmo ticket de ganhar o estágio 2 ou 3.
4. O jogo encerra após o último estágio. A action `closegame` arquiva o jogo.

---

## Decisões

### 1. Struct `stage_rule` no contrato

```cpp
struct stage_rule {
    uint8_t  stage;              // 1, 2, 3... (devem ser ordenados crescentemente)
    uint8_t  patterns_required;  // nº de padrões simples completados pelo ticket
    uint16_t weight;             // peso do prêmio em hundredths (100 = 1×)
};
```

Campo `stages: vector<stage_rule>` adicionado a `gametype_record`.
Vazio (`stages = []`) = modo não é MULTI_MATCH.

### 2. Action `setstages(gametype_id, stages)` — Admin

Action separada de `addgametype` para definir/atualizar os estágios de um gametype.
Permite modificar os estágios sem recriar o gametype (on-chain update seguro).

Auth: `get_self()` (bingogamectr admin).

### 3. Action `claimstage(game_id, ticket_id, stage, ball_count, win_pattern_mask)` — Microservice

Paga um ticket por um estágio específico. Calculado como:
```
payout = ticket_price × base_multiplier × stage.weight / 100
```

**Sem proteção de duplicação on-chain:** o contrato confia no bingogamesvc
(`require_auth("bingogamesvc"_n)`). O evaluator garante que cada (ticket, stage) seja pago
no máximo uma vez. Risco documentado; aceitável dado o modelo de confiança existente.

`claimstage` aceita `drawn | paying`, transiciona `drawn → paying` na primeira chamada
(mesmo comportamento do `claimwin`).

### 4. Avaliação off-chain — Algoritmo de Cutoff por Estágio

O evaluator executa `processMultiMatchWinners`:

```
para cada estágio K (em ordem crescente de patterns_required):
  cutoffBall[K] = menor índice i tal que ∃ ticket com ≥ K padrões completados
                  usando drawn_balls[0..i]
  vencedores[K] = tickets com ≥ K padrões completados usando drawn_balls[0..cutoffBall[K]]
  para cada vencedor: executeClaimStage(gameId, ticketId, K, cutoffBall[K], bestPatternMask)

após todos os estágios: executeCloseGame(gameId)
```

**Complexidade:** O(n_stages × n_balls × n_tickets × n_patterns). Aceitável para jogos com
até 1.000 tickets. Para escala maior: usar o Redis inverted index para aceleração.

**Seleção do `win_pattern_mask` por estágio:** o melhor padrão do ticket (maior weight) no
momento do cutoff. Serve como evidência auditável on-chain; não altera o payout (que usa
`stage.weight`).

### 5. Configuração do `draw_mode` para MULTI_MATCH

O `draw_mode = "multimatch"_n` é obrigatório no gametype. **Não há limite de bolas
pré-estipulado** — o orquestrador usa todos os balls do oracle (até 75), como o modo
`firstfull`. O sorteio avança sequencialmente até que cada estágio seja completado;
estágios não alcançáveis dentro dos 75 balls do oracle não são pagos. O campo `max_balls`
do gametype é ignorado pelo modo multimatch.

---

## Consequências

**Positivas:**
- Mantém jogadores engajados durante todo o sorteio (prêmios progressivos).
- Acumulação de prêmios é mais justa e intuitiva que a regra de max-weight único.
- `claimstage` reutiliza o modelo de confiança bingogamesvc existente.
- `setstages` permite atualizar configurações de estágio sem migrar gametypes.

**Negativas / Riscos:**
- Bug no evaluator pode pagar o mesmo (ticket, stage) mais de uma vez (sem proteção on-chain).
  Mitigação: teste de integração no harness cobre este cenário.
- `claimstage` emite múltiplas transações por jogo — maior custo de CPU para jogos com muitos
  vencedores em muitos estágios.
- `processMultiMatchWinners` é O(n_stages × n_balls × n_tickets) sem Redis — lento para salas
  grandes. Sprint futura: otimizar com índice por estágio.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `contracts/bingo/include/bingo.hpp` | `stage_rule` struct, `stages` em `gametype_record`, prototypes `setstages` + `claimstage` |
| `contracts/bingo/src/bingo.cpp` | Implementação de `setstages` e `claimstage` |
| `contracts/bingo/bingo.abi` | Novos structs e actions |
| `packages/shared-types/src/index.ts` | `StageRule`, `stages` em `BlockchainGametype` |
| `apps/worker-game-loop/src/services/blockchain.ts` | `executeClaimStage` |
| `apps/worker-game-loop/src/services/evaluator.ts` | `processMultiMatchWinners`, dispatcher |
| `apps/frontend/src/services/api.ts` | `StageRule`, `stages`, `setStages` |
| `apps/frontend/src/components/admin/GametypesAdmin.tsx` | Editor de estágios |
| `apps/harness/tests/fsm.test.ts` | Fixes ADR-012 + suite MULTI_MATCH |

## 6. Visual — Premiação e Seções de Cartela

### 6a. Duas Seções de Cartela

`groupTicketsByCategory` divide cartelas do jogador em:

| Seção | category | Critério | Ordenação |
|-------|----------|----------|-----------|
| **Premiadas** | `won` | `winnerMap.has(ticket.id)` | `totalPrize` descending |
| **Disputando** | `active` | resto | `ticketCompositeSortKey` descending (proximidade × peso do padrão) |

### 6b. suppressWinner

Cartelas na seção "Disputando" não recebem decoração de vitória (`.is-winner`, badge "Vencedora",
prêmio em verde) mesmo que `completedPatterns.length > 0`. TicketCard recebe `suppressWinner={true}`
quando `group.category === 'active'`.

### 6c. Stage Badges

Cartela que venceu um ou mais estágios exibe badges no card em vez de padrões individuais.
Badge usa `fmtStageLabel` para traduzir `stage_N` → "Estágio N". Dados de `stageWonKeys`
extraídos de `localWinners` filtrados por `ticket_id` e prefixo `stage_`.

### 6d. Gráfico de Premiação da Sala (`gr-room-prizes`)

Painel de resultados globais agrupa vencedores por `pattern_name` (que em MULTI_MATCH é
`stage_N`). Cada grupo exibe header "Estágio N" e linhas com ticket_id, account, amount,
currency e status do pagamento:

- `preparing`: spinner — transação enviando
- `confirming`: spinner — aguardando confirmação MongoDB
- `confirmed`: 🔗 link para explorer com txHash

### 6e. prizeStatuses Chave Composta

PrizeStatuses no frontend usa chave `ticket_id:winLabel` em vez de apenas `ticket_id`.
Necessário porque em MULTI_MATCH a mesma cartela pode ter pagamentos independentes
para estágios diferentes (stage_1, stage_2, etc.). Worker passa `winLabel` em
`notifyPrizeTxSent` e `notifyPrizeConfirmed`.

### 6f. Winner Reorder

`winner_found` (WebSocket) é emitido **antes** de `processAllGameWinners` (pagamento
on-chain). Isso garante que o frontend veja o status "preparing" antes de a transação
ser submetida, permitindo a cadeia preparing → confirming → confirmed.

### 6g. NotifyStageCleared com winning_ball

`notifyStageCleared` agora recebe `cutoffBall` e `drawnBalls` para computar o número
da bola que fechou o estágio. O campo `winning_ball` é incluído no payload WS
`stage_cleared`, exibido no `PrizePanels`.

### 6h. PayMultiMatchStage com Prize Pipeline

`payMultiMatchStage` agora integra o prize pipeline completo:
1. `executeClaimStage` (tx on-chain)
2. `notifyPrizeTxSent(gameId, ticket_id, winLabel)`
3. `computePayoutAmount` com `baseMultiplier` e `weight`
4. `savePrizeTx` (MongoDB) + `saveBuyInTx`
5. Métricas: `prizePersistTotal`, `prizePaymentsTotal`, `prizePaymentsAmountTotal`
6. `notifyPrizeConfirmed` com txHash, amount, currency, winLabel

---

## Referências

- ADR-012: Draw Modes (FIXED, FIRST_FULL, GOLDEN_BALL, paying state, closegame)
- ADR-005: Fixed-Odds Treasury — modelo de payout (weight em hundredths)
- SPEC.md §2.2: claimwin e modelo de confiança bingogamesvc
