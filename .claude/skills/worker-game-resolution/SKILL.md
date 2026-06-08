---
name: worker-game-resolution
description: >
  Como o worker-game-loop resolve jogos e paga prêmios no CryptoBingo, e como
  alterar/adicionar lógica de resolução: draw modes, payouts (max_weight, combos,
  stages, golden ball), avaliação de cartelas, mensageria (RabbitMQ) e cache (Redis).
  Use ao mexer em apps/worker-game-loop/src/services/* ou em qualquer fluxo de
  liquidação/orquestração de partida.
---

# Worker — Resolução de Jogos & Payouts

Pacote `@cryptobingo/worker-game-loop`. Consome eventos, avalia cartelas on-chain e envia as
actions de liquidação ao contrato. Testes: `npx jest <arquivo>` (em `apps/worker-game-loop`).

## Mapa dos serviços (`src/services/`)

- **`gameOrchestrator.ts`** — `orchestrateGame(gameId)` faz o `switch (draw_mode)` →
  `orchestrateStandard | orchestrateFirstFull | orchestrateGoldenBall | orchestrateMultiMatch`.
  Cada handler faz reveal lento, chama `processAllGameWinners`, monta payloads e notifica.
- **`evaluator.ts`** — coração da resolução:
  - `applyDrawnBalls` / `checkWinPatterns` (puras, testáveis).
  - `findAllWinners` (RPC O(n)) e `findAllWinnersWithIndex` (índice invertido Redis O(1)).
  - `selectBestPayout` — regra **max_weight global** (ADR-005): por cartela escolhe o maior peso
    entre padrões vencedores e **combinações satisfeitas** (ADR-016) → `claimcombo` ou `claimwin`.
  - `processAllGameWinners` — dispara as liquidações + `closegame`.
- **`combinationEvaluator.ts`** — combos (ADR-016): `fetchComboContext` (busca cláusulas/tipos da
  API, cache 1min), `isComboSatisfied` (all_of/any_of/n_of_type), `bestSatisfiedCombo` (max_weight).
- **`blockchain.ts`** — `executeClaimWin / executeClaimCombo / executeClaimStage / executeCloseGame`
  etc. (assina como `microservice`).
- **`patternCache.ts`** — pesos de padrão on-chain com cache Redis. **`invertedIndex.ts`** — índice
  ticket→bola. **`rabbitmq.ts`** — consumo de eventos + GC/refund. **`roomManager.ts`** — salas.

## Invariantes (NÃO quebrar)

- **max_weight por cartela** — paga-se UM prêmio: o de maior peso (padrão | combo | stage).
- Combos: peso é validado on-chain (`claimcombo` valida `combo_id`); worker só ESCOLHE, não inflaciona.
- `get_table_rows` da tabela `tickets` (scope = game_id como name): `key_type:'i64'` +
  `scope: Name.from(UInt64.from(gameId))`. Bounds de ticket = `UInt64`.
- Pesos em hundredths (payout = `price × base_multiplier × weight / 100 × golden`). Use o **preço
  pago pela cartela** (ADR-010), com fallback para `game.ticket_price`.
- `gametype.combinations` é `binary_extension` on-chain → pode vir ausente (trate como vazio).

## Adicionar/alterar um draw mode (ADR-012/013/014)

1. **Contrato:** valide o novo `draw_mode` em `addgametype`; ajuste `claim*`/`closegame` se precisar
   de campos novos (ver skill `wax-contract` — inclui correção manual do ABI).
2. **Worker:** novo `orchestrate<Modo>` em `gameOrchestrator.ts` + `case` no `switch`. Avaliação
   específica vai no `evaluator.ts` (ex.: cutoff dinâmico do FIRST_FULL, golden multiplier).
3. **Tipos:** atualize `DrawMode` em `@cryptobingo/shared-types` se houver novo modo.
4. **Testes:** funções puras em `evaluator.test.ts` / `evaluator.drawmodes.test.ts`; E2E no harness
   (suite por modo, ver skill `harness-e2e`).
5. **ADR** documentando o modo.

## Erros comuns

- Esquecer `key_type:'i64'` → `name_type_exception` ao paginar tickets.
- Pagar múltiplos prêmios por cartela → viola max_weight/RTP.
- Não tratar `combinations` ausente (binary_extension) → crash ao ler gametype antigo.
