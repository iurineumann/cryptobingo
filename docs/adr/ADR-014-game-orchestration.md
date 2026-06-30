# ADR-014: Orquestração de Partida — Slow Reveal como Gate do Avaliador

**Data:** 2026-06-01
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O modelo atual de coordenação entre o broadcaster (slow reveal) e o evaluator
(pagamento on-chain) é paralelo e sem gating:

```
startdraw handler
  ├─ startSlowReveal(balls)        → fire-and-forget (setInterval, não awaitable)
  └─ [mensagem separada] claimwin
       ├─ processAllGameWinners()  → paga on-chain DURANTE o reveal
       ├─ notifyWinners()          → injeta no próximo tick do interval
       └─ onGameResolved()         → inicia próxima partida DURANTE o reveal
```

**Consequências visíveis para o jogador:**
- O jogo está arquivado on-chain antes de o reveal terminar.
- A próxima partida começa a ser criada enquanto o jogador ainda vê bolas sendo sorteadas.
- Em MULTI_MATCH: os pagamentos de estágio N ocorrem sem relação com o momento visual
  do sorteio em que aquele estágio foi alcançado.
- Em GOLDEN_BALL: a bola dourada é revelada sem nenhuma pausa ou efeito diferenciado.
- Em FIRST_FULL: o reveal continua além da bola de encerramento do jogo.
- O anúncio de vencedores aparece no tick SEGUINTE ao vencedor real, não na bola certa.

**Princípio corrigido:**
> A experiência do usuário (slow reveal) é o **gate** de todas as operações
> de back-end. O avaliador, os pagamentos on-chain e a criação da próxima
> partida só ocorrem APÓS o reveal ter completado a fase correspondente.

---

## Decisões

### 1. `startSlowReveal` torna-se awaitable

`startSlowReveal(gameId, balls, options?)` passa a retornar `Promise<void>`
que resolve quando todas as bolas do lote foram emitidas (ou quando a sessão
é interrompida por abort).

Internamente: o `RevealSession` ganha um campo `resolve: () => void` que é
chamado quando `idx >= balls.length`.

Isso permite ao chamador `await startSlowReveal(...)` e só prosseguir depois
que o jogador viu todas as bolas.

### 2. Novo serviço `gameOrchestrator.ts`

Concentra toda a lógica de coordenação reveal ↔ evaluator por `draw_mode`.
O `rabbitmq.ts` delega para `orchestrateGame(gameId)` no handler de `startdraw`
e não precisa mais saber de draw_mode ou timing.

```
orchestrateGame(gameId)
  ├─ busca drawn_balls e gametype on-chain
  ├─ delega para o handler do draw_mode:
  │    standard/fixed  → orchestrateStandard()
  │    firstfull       → orchestrateFirstFull()
  │    goldenball      → orchestrateGoldenBall()
  │    multimatch      → orchestrateMultiMatch()
  └─ após cada handler: onGameResolved() (cria próxima partida)
```

### 3. Fluxo por modo

#### STANDARD / FIXED
```
await startSlowReveal(gameId, balls.slice(0, maxBalls))
winners ← await processAllGameWinnersWithResult(gameId)
notifyWinners(gameId, winners)
notifyGameEnded(gameId)
await onGameResolved(gameId)
```

#### FIRST_FULL
```
cutoff ← findFirstFullCutoff(gameId, balls)    // pré-computado antes do reveal
await startSlowReveal(gameId, balls.slice(0, cutoff))
winners ← await processAllGameWinnersWithResult(gameId)
notifyWinners(gameId, winners)
notifyGameEnded(gameId)
await onGameResolved(gameId)
```

#### GOLDEN_BALL
```
ga = gametype.golden_ball_after || maxBalls
await startSlowReveal(gameId, balls.slice(0, ga))        // fase normal
goldenNum  ← balls[ga]
multiplier ← deriveGoldenMultiplier(balls, ga)
notifyGoldenBall(gameId, goldenNum, multiplier)          // animação especial
await sleep(GOLDEN_BALL_REVEAL_MS)                       // pausa dramática
await startSlowReveal(gameId, [goldenNum])               // revela a golden ball
winners ← await processAllGameWinnersWithResult(gameId)
notifyWinners(gameId, winners)
notifyGameEnded(gameId)
await onGameResolved(gameId)
```

#### MULTI_MATCH
```
cutoffs ← preComputeMultiMatchCutoffs(gameId, balls, gametype)
// cutoffs = [{stage, cutoffBall, winners:[...]}]

prevCutoff = 0
for each {stage, cutoffBall, winners} of cutoffs:
    await startSlowReveal(gameId, balls.slice(prevCutoff, cutoffBall))
    if winners.length > 0:
        await processMultiMatchStage(gameId, stage, cutoffBall, winners)  // claimstage
        notifyStageCleared(gameId, stage, winners)
        await sleep(STAGE_PAUSE_MS)                                       // pausa entre estágios
    prevCutoff = cutoffBall

await executeCloseGame(gameId)
notifyGameEnded(gameId)
await onGameResolved(gameId)
```

### 4. Pré-computação de cutoffs para MULTI_MATCH

`preComputeMultiMatchCutoffs` escaneia todos os tickets UMA VEZ e determina,
para cada estágio, qual é o cutoff ball e quais tickets ganham.
Esse scan ocorre ANTES do reveal, enquanto o jogador vê a transição visual de
"sorteando…". Evita double-scan (o evaluator não precisa re-varrer).

#### 4a. Reorder: winner_found antes de processAllGameWinners

Em todos os draw modes (standard, first_full, golden_ball, multimatch), o evento
`winner_found` é emitido **antes** da chamada a `processAllGameWinners` (pagamento
on-chain). Isso garante a cadeia visual:

winner_found → frontend: "preparing"
prize_tx_sent → frontend: "confirming"
prize_confirmed → frontend: "confirmed"

Anteriormente `processAllGameWinners` era chamado antes de `notifyWinners`,
fazendo o pagamento acontecer antes do anúncio visual.

### 5. Novos eventos WebSocket

| Evento | Quando | Payload |
|---|---|---|
| `golden_ball` | Antes de revelar a bola dourada | `{game_id, ball_num, multiplier, affected_patterns}` |
| `stage_cleared` | Após reveal do cutoff de cada estágio MM | `{game_id, stage, patterns_required, winners[]}` |
| `game_ended` | Após o último reveal, antes de criar próxima partida | `{game_id, draw_mode, total_winners}` |

`winner_found` existente: mantido para STANDARD/FIXED/FIRST_FULL/GOLDEN_BALL.

### 6. Remoção da mensagem RabbitMQ `claimwin`

Com a orquestração centralizada em `orchestrateGame`, o `claimwin` como
mensagem RabbitMQ separada é redundante. O handler do `startdraw` agora
faz TUDO sequencialmente e aguarda o reveal antes de pagar.

O case `claimwin` no switch do rabbitmq é mantido como **fallback manual**
(para reprocessamento de jogos em estado `drawn`/`paying` que falharam),
mas não é mais emitido automaticamente pelo fluxo normal de sorteio.

### 7. `onGameResolved` só após reveal completo

O `roomManager.onGameResolved` (que cria a próxima partida) é chamado DEPOIS
de `notifyGameEnded`, garantindo que o jogador não veja a UI mudar para "próxima
partida" enquanto ainda está assistindo ao reveal.

---

## Consequências

**Positivas:**
- Experiência do jogador fiel ao timing real do sorteio.
- Vencedores anunciados na bola certa, não no tick seguinte.
- Próxima partida só criada após o jogador ver o resultado completo.
- MULTI_MATCH: cada estágio é revelado progressivamente com pausa visual.
- GOLDEN_BALL: animação dedicada com timing controlado.
- Código de orquestração concentrado e testável (`gameOrchestrator.ts`).

**Negativas / Riscos:**
- `startSlowReveal` agora bloqueia o handler RabbitMQ durante o reveal
  (ex: 35 bolas × 3s = ~105s). O worker-game-loop precisa ter ACK automático
  configurado (`noAck: false`) para não sofrer timeout do RabbitMQ durante o reveal.
  **Mitigação:** ACK da mensagem é feito ANTES de chamar `orchestrateGame`
  (manual ack imediato + processamento em background controlado pelo worker).
- `preComputeMultiMatchCutoffs` escaneia todos os tickets antes do reveal —
  adiciona latência de 1-5s antes do início do reveal para jogos grandes.
  **Mitigação:** aceitável; o reveal anterior (do lock ao start) cobre essa janela.
- Se `orchestrateGame` falha no meio (ex: RPC timeout), o jogo fica em `drawn`
  ou `paying` sem resolver. **Mitigação:** o case `claimwin` manual no rabbitmq
  serve de fallback; polling do worker pode detectar jogos presos.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `apps/worker-game-loop/src/services/broadcaster.ts` | `startSlowReveal` → `Promise<void>`; `notifyGoldenBall`; `notifyStageCleared`; `notifyGameEnded` |
| `apps/worker-game-loop/src/services/gameOrchestrator.ts` | **NOVO** — orquestração por draw_mode |
| `apps/worker-game-loop/src/services/rabbitmq.ts` | `startdraw` → `orchestrateGame`; ACK antes do reveal |
| `apps/worker-game-loop/src/services/evaluator.ts` | `preComputeMultiMatchCutoffs` (extrai lógica de cutoff) |
| `apps/frontend/src/components/GameRoom.tsx` | Novos eventos: `stage_cleared`, `golden_ball`, `game_ended` |
| `packages/shared-types/src/index.ts` | Tipos dos novos eventos WebSocket |

---

## Referências

- ADR-007: Slow Reveal WebSocket Broadcaster
- ADR-010: Rooms — Salas Persistentes (onGameResolved)
- ADR-012: Draw Modes (FIXED, FIRST_FULL, GOLDEN_BALL)
- ADR-013: MULTI_MATCH — Estágios Progressivos
- asyncapi.yaml — contrato de eventos WebSocket
