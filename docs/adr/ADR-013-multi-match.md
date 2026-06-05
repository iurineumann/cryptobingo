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

Auth: `get_self()` (bingo.game admin).

### 3. Action `claimstage(game_id, ticket_id, stage, ball_count, win_pattern_mask)` — Microservice

Paga um ticket por um estágio específico. Calculado como:
```
payout = ticket_price × base_multiplier × stage.weight / 100
```

**Sem proteção de duplicação on-chain:** o contrato confia no microservice
(`require_auth("microservice"_n)`). O evaluator garante que cada (ticket, stage) seja pago
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

O `draw_mode = "multimatch"_n` é obrigatório no gametype. O campo `max_balls` continua
disponível para limitar o sorteio (default 35). Estágios que não acontecerem antes de
`max_balls` não são pagos — o avaliador para no limite de bolas configurado.

---

## Consequências

**Positivas:**
- Mantém jogadores engajados durante todo o sorteio (prêmios progressivos).
- Acumulação de prêmios é mais justa e intuitiva que a regra de max-weight único.
- `claimstage` reutiliza o modelo de confiança microservice existente.
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

---

## Referências

- ADR-012: Draw Modes (FIXED, FIRST_FULL, GOLDEN_BALL, paying state, closegame)
- ADR-005: Fixed-Odds Treasury — modelo de payout (weight em hundredths)
- SPEC.md §2.2: claimwin e modelo de confiança microservice
