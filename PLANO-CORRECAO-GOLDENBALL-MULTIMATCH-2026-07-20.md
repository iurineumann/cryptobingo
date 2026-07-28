# PLANO DE CORREÇÃO — Golden Ball (combinação não paga) + Multi-match (underpayment/freeze)

Data: 2026-07-20 | Autor: Hermes (orquestração, validado via RAG + skills + on-chain RPC + api-gateway)
Status: PLANEJAMENTO — NENHUMA EDIÇÃO AINDA FEITA. Aguarda aprovação do usuário.

## Contexto (factos verificados contra on-chain RPC + api-gateway + código, SEM alucinação)

- Jogo 1784514212064 (sala 12, gametype 3 = Golden Ball 40), cartela 5316250706917835848 (owner cworldcntrct).
  - On-chain `games`: `status=archived`, `drawn_balls` blob = 75 bytes (oracle entrega baralho completo; GB40 sorteia 40).
  - On-chain `gametypes` id=3: `draw_mode=goldenball`, `max_balls=40`, **`golden_ball_after=39` (CORRETO, não é 0)**, `n_combos=4`.
  - Mongo prizetx da cartela: `patternMask="1082401"` (= ROW_0), `winLabel=null`, 1.0000 BINGO. SÓ ROW_0 pago.
  - Frontend (HTML enviado pelo usuário): badge "2 patterns" (ROW_0 + DIAG_TL_BR). Combinação 2x Simples NÃO paga.
  - **Subpagamento REAL** (não bug de display) — confirmado por Mongo + on-chain.
- Jogo 1784514167141 (sala 14, gametype 4 = MULTIMATCH).
  - On-chain: `status=archived`, `total_paid=20000` (= 2.0000 BINGO).
  - Mongo: 1 prizetx (stage_1, 2.0000). Piso esperado = 30.0000 (soma dos stages). **Underpayment REAL.**
  - Frontend: congelou em "drawing" na bola N43 (valor 43), mesmo on-chain `archived`.

## BUG 1 — Golden Ball (gametype 3): combinação 2x Simples não paga

### Causa raiz (fechada, determinística — verificada contra Mongo + Redis no VPS, 2026-07-20)

**Dado falso que eu havia usado (CORRIGIDO):** li `golden_ball_after` da tabela `games` (onde não existe → `None`) e concluí "goldenBallAfter=0 → effectiveBalls=slice(0,75) com lixo". ERRADO. O código (evaluator.ts:701) lê de `gametypes`, onde `golden_ball_after=39` (correto). Com `ga=39`, `effectiveBalls=slice(0,40)` (40 bolas reais, sem lixo). **O effectiveBalls NÃO é o bug.**

**CAUSA REAL (descoberta 2026-07-20, Mongo + Redis): a fonte de verdade está VAZIA e o sistema roda sobre cache Redis obsoleto com tipos INCORRETOS.**
- `apps/api-gateway/src/models/GametypeMetadata.ts:50-58`: coleção `GametypeMetadata` (fonte off-chain canônica de `rules[].type`), `timestamps: true`, `gametype_id` é **String**.
- **Mongo `GametypeMetadata` está VAZIO** (`countDocuments() = 0` no VPS — nenhum doc, nem gametype 3).
- `getGametypePatternsPublic` (patternController.ts:483-535) lê **Redis ANTES do Mongo**: `redis.get('pattern:gametype:3')` → se houver, retorna o cache. Como o Mongo está vazio, **TODO o `type` vem do cache Redis**.
- O cache Redis `pattern:gametype:3` contém os tipos ERRADOS (confirmados via `redis-cli GET`):
  - `ROW_0` (id 12) = **special**, `DIAG_TL_BR` (id 13) = **master**, `MASTER` (id 11) = **special** (deveria ser master!), `BINGO_B` (id 6) = **simple** (deveria ser special!).
  - Só `ROW_1..4, DIAG_TR_BL, BINGO_I` = **simple** (corretos).
- O worker usa chave SEPARADA (`worker:pattern:gametype:3`, patternCache.ts:38) — também pode estar obsoleta.

**Mecanismo do subpagamento (cartela 5316250706917835848, jogo 1784514212064):**
- Decode column-major on-chain: `state(slice 0,40) = 0x0135F567` → padrões vencedores = **ROW_0 + DIAG_TL_BR** (2 patterns reais). Grade bate EXATO com o HTML do usuário.
- `fetchComboContext` (combinationEvaluator.ts:63-151) busca combos do api-gateway → recebe `rules` do cache Redis com `ROW_0=special`, `DIAG_TL_BR=master`.
- Combinação "2x Simples" exige `n_of_type: simple >= 2`. Os 2 patterns vencedores são **special/master** → ZERO simples → `bestSatisfiedCombo` retorna `null` → `selectBestPayout` NÃO promove → só ROW_0 (weight 100) pago.

**SEGUNDO PONTO (não é bug — esclarecimento de regra):** o `selectBestPayout` (evaluator.ts:189-207) faz `winningPatterns.reduce((prev,curr)=> curr.weight>prev.weight?curr:prev, winningPatterns[0])` para achar o `best`, e depois promove para combo se `bestSatisfiedCombo` retornar weight maior. Isso é **exatamente o max_weight único do ADR-005/016** (por cartela, paga-se o maior peso entre padrões e combinações — um só prêmio). O `reduce` com `>` pega o primeiro de maior weight; em empate, pega um determinístico. **Isso está CORRETO.** O que eu havia chamado de "bug de regra (ignora empatados)" estava ERRADO — a regra é max_weight ÚNICO, não paga todos os empatados. O `selectBestPayout` NÃO precisa de correção.

**Por que o frontend mostra "2 patterns" mas não paga a combinação:** o frontend conta QUALQUER pattern vencedor (ROW_0 + DIAG_TL_BR = 2), mas a combinação "2x Simples" exige `type=simple`. Como ROW_0/DIAG_TL_BR são special/master (cache Redis), a combinação nunca forma no backend.

**Responde "quando a tipagem foi modificada":** NÃO foi modificada num doc existente — o **Mongo `GametypeMetadata` está VAZIO** e o sistema opera sobre um **cache Redis obsoleto com tipos incorretos**. A fonte canônica (Mongo) nunca foi populada (ou foi apagada), e o cache Redis está servindo dados errados. Isso é **drift de configuração** (precedente RAG: `agent://bugs/2026-07-13-combo-subpayment-gametype1-drift` — setcombos on-chain ≠ upsertGametypeMetadata Mongo; drift se o upsert falhou/silenciou). O `updatedAt` do Mongo seria a trilha, mas o Mongo está vazio → trilha ausente. Investigação adicional: logs do api-gateway (quem chamou `upsertGametypeMetadata` / `setcombos`) ou RAG de quando o Mongo foi populado/esvaziado.

### DECISÃO DO USUÁRIO (confirmada 2026-07-20) — tipos corretos do gametype 3
- `ROW_*` = **SIMPLE**, `DIAG_*` = **SIMPLE**, `BINGO_*` = **SPECIAL**, `MASTER` = **MASTER**.
- Com `ROW_0=simple` + `DIAG_TL_BR=simple` (ambos weight 100), a combinação "2x Simples" (weight 300) FORMA e paga 300 > 100 → a cartela 5316250706917835848 seria paga corretamente.

### DESCOBERTA ARQUITETURAL (responde "por que não vem on-chain?")
- O `type` (simple/special/master) e as `combinations` **NÃO EXISTEM on-chain** (bingo.hpp:213-238, ADR-016). A struct `pattern_record` tem só `pattern_id + name + mask`; `pattern_rule` tem só `pattern_id + weight`.
- Por design ADR-016, `type`/`combinations` são **OFF-CHAIN**. A fonte off-chain canônica é o Mongo `GametypeMetadata` (cabeçalho do model: "Fonte de verdade do schema off-chain").
- **O Mongo `GametypeMetadata` está VAZIO** (`countDocuments()=0` → TODOS os gametypes sem metadata). O sistema caiu no **cache Redis** (`pattern:gametype:3`, lido ANTES do Mongo em patternController.ts:495) que tem tipos INCORRETOS (ROW_0=special, MASTER=special, BINGO_B=simple, etc.).
- **Não é "deveria vir on-chain"** — é que a fonte off-chain (Mongo) nunca foi populada, e o cache Redis (com lixo) virou a única fonte. Drift sistêmico (explica o gametype 1 também, RAG 2026-07-13).

### VERIFICAÇÃO ON-CHAIN (tabela `gametypes`, 2026-07-20 — dados do usuário, waxblock/eosnation)
O usuário forneceu o `get_table_rows` da tabela `gametypes` on-chain. Factos:
- **Gametype 3 (Golden Ball 40):** `golden_ball_after=39` (CORRETO, não 0), `rules` weights `[100×5,5000,3000,3000,4000,4000,25500,100,100]` (CORRETOS), `combinations=[{0:1500},{1:1000},{2:600},{3:300}]` (**POPULADAS e CORRETAS** — 5x/4x/3x/2x Simples), `draw_mode=goldenball`, `max_balls=40`.
- **O on-chain NÃO tem `type` (simple/special/master) nem `clauses` das combinações** — só `combo_id` + `weight`. Confirma ADR-016 (bingo.hpp:233-238: "On-chain guardamos apenas combo_id → weight"). As `clauses` (`n_of_type:simple>=N`) são OFF-CHAIN.
- **Conclusão:** o drift é 100% OFF-CHAIN. On-chain está impecável (combinations pesos batendo com o api-gateway). NENHUMA correção on-chain necessária para o Bug 1.
- **Reconciliação com RAG 2026-07-13 (gametype1 drift on-chain vazio):** a tabela ATUAL mostra gametype 1 COM combinations populadas (1500/1000/600/300). Aquele RAG era de estado anterior (pré-`setcombos`), já resolvido. Estado on-chain atual está correto para gametypes 1 e 3.
- **Gametype 4 (MultiMatch):** `combinations=[]` on-chain (correto, multimatch não usa combos — usa `stages` com weights 200/400/600/800/1000). `rules` só pattern_id 1-4 + 12 (pesos 100). Estável.

### REGRA DE PAGAMENTO REAL (RAG — ADR-005 §2, ADR-016 §2, PRD, invariantes)
**Por cartela, paga-se APENAS UM prêmio: o de MAIOR weight (max_weight global)** entre {padrões vencedores, combinações satisfeitas}. Não paga múltiplos padrões, não paga "todos os empatados". Combinações aninhadas: só a de maior peso paga.
- ADR-005 §2: *"pagará exclusivamente a combinação que oferecer o maior multiplicador (weight) para aquela cartela."*
- ADR-016 §2: *"Por cartela, paga-se o maior peso entre {padrões vencedores, combinações satisfeitas} (max_weight global)."*
- `selectBestPayout` (evaluator.ts:189-207) implementa EXATAMENTE isso: `best` = max weight entre padrões; se combo satisfeito tem weight > best, retorna o combo. **O código está CORRETO segundo ADR-005/016 — NÃO é bug.**
- NOTA: o que eu havia escrito antes ("paga todos os empatados") estava ERRADO — foi uma distorção minha da regra do usuário. A regra é max_weight ÚNICO.

### CONFIRMAÇÃO ON-CHAIN (waxblock, tabela `gametypes`, 2026-07-20)
- **gametype 3 "Golden Ball 40"**: `draw_mode=goldenball`, `max_balls=40`, `golden_ball_after=39` (CONFIRMADO — meu dado inicial de "None" veio da tabela `games` errada), `combinations=[{0:1500},{1:1000},{2:600},{3:300}]` (4 combos com weight on-chain, corretos).
- **`type` NÃO existe on-chain** — `rules` são só `pattern_id:weight`. Confirma ADR-016 (off-chain).
- **As cláusulas das combos (ex: "n_of_type: simple >= 2") são OFF-CHAIN.** O on-chain tem `combo_id:0, weight:1500` mas NÃO diz "2x Simples". O worker busca a cláusula no api-gateway (`fetchComboContext` → Mongo/Redis). Como o Mongo `GametypeMetadata` está VAZIO e o Redis tem lixo, o worker não mapeia combo_id→cláusula → `bestSatisfiedCombo` retorna null → não promove → paga só padrão isolado.
- **O que falta NÃO é on-chain** (combos/weights já estão lá) — é a **definição off-chain no Mongo**: `rules[].type` + `combinations` (cláusulas). A Fase 3 popula o Mongo.

### Ações da Fase 3 (Golden Ball / Bug 1) — 2 frentes (selectBestPayout NÃO precisa de fix)
1. **Popular o Mongo `GametypeMetadata`** do gametype 3 com os tipos corretos (via `upsertGametypeMetadata`, PUT /admin/gametypes/3/metadata, body `rules` com `type` confirmado + `combinations` 2x/3x/4x/5x Simples). Fonte de verdade.
2. **Invalidar o cache Redis** (`pattern:gametype:3` no api-gateway E `worker:pattern:gametype:3` no worker) para forçar releitura do Mongo recém-populado.

### Investigação sistêmica (bug separado, não bloqueia Fase 3)
- **Por que o Mongo `GametypeMetadata` está vazio para TODOS os gametypes?** (seed nunca rodou? `upsertGametypeMetadata` falhou/silenciou? foi deletado?) Afeta todos os gametypes, não só o 3.
- RAG: `agent://bugs/2026-07-13-combo-subpayment-gametype1-drift` (setcombos on-chain ≠ upsertGametypeMetadata Mongo). Verificar se o admin `upsertGametypeMetadata` chama `pushSetCombosOnChain` e se o Mongo foi de fato gravado.
- Recomendação arquitetural futura: o `type` ser fonte única evitaria drift — mas isso exigiria mudar o contrato (ADR-016 diz off-chain). Por ora, manter off-chain MAS garantir que o Mongo seja a fonte populada e o Redis seja só cache (invalidado após upsert).

### Investigação adicional recomendada (para fechar 100% se necessário)
- Reproduzir em teste: `findAllWinners(gameId, slice(0,40), 3)` com `fetchComboContext` mockado dos dados reais → assert que `bestSatisfiedCombo` retorna null (bug) e, após correção de tipo, retorna "2x Simples".

---

## BUG 2 — Multi-match: underpayment (só stage_1) + freeze frontend

### Causa raiz (worker) — confirmada por GLM (GRILL-REPORT.md em /tmp/cb-multimatch-bug)
`apps/worker-game-loop/src/services/gameOrchestrator.ts:194-263` (`orchestrateMultiMatch`):
- Loop de stages SEM try/catch por stage (linha 242 `payMultiMatchStage`). Falha em 1 stage (ex: RPC timeout) aborta os stages seguintes → só stage_1 pago (2.0000).
- Sem `notifyStageFailed` / `notifyGameEnded` garantido → jogo fica em estado inconsistente.

### Causa raiz (frontend) — confirmada por GLM
`apps/frontend/src/hooks/useGameRoomState.ts:266` (`effectiveDisplayStatus`):
- Ignora `archived` quando `game_ended` WS foi perdido → mantém "drawing" → freeze na bola N43.
- `showFallback` exige `drawnBalls.length === 0` (linha 198-200).

### Causa raiz (CONTRATO) — user autorizou mexer no contrato
`contracts/bingo/src/bingo.cpp:592-644` (`claimstage`):
- **SEM idempotência por (ticket, stage).** `payout` é creditado e `total_paid` incrementado a cada chamada.
- Re-executar o jogo inteiro (retry após falha) = **double-pay** do mesmo stage.
- O retry tem que ser POR STAGE, mas o contrato não impede re-pagamento do mesmo (ticket, stage).

### Correção — 3 frentes (diffs nas linhas ATUAIS, validadas 2026-07-20)

#### (A) Worker — isolamento de falha por stage [OFF-CHAIN]
`apps/worker-game-loop/src/services/gameOrchestrator.ts` `orchestrateMultiMatch` (loop 211-251; `await payMultiMatchStage` na linha 242):
- Envolver a chamada de `payMultiMatchStage` (linha 242) em `try/catch`. Em falha: `logger.error` + `notifyStageFailed` (NOVO no broadcaster) + continua o loop (os stages seguintes pagam).
- **Garantir fechamento:** `endRevealSession` + `setPayoutPlan` + `triggerCloseGame` (linhas 260-262) e `notifyGameEnded` (broadcaster:212) DEVEM rodar AO MENOS UMA VEZ, mesmo com falha parcial de algum stage. Mover para um `finally` ou garantir que não estejam dentro do loop.
- **Retry idempotente por (ticket, stage):** só APÓS a frente (C) — com `paid_stages` no contrato, o retry é seguro. Até lá, a frente A isola a falha (stage que falhou fica sem pagar + logado), mas NÃO refaz a tx on-chain (evita double-pay sem idempotência).
- `notifyStageFailed(gameId, stage, reason)` — criar em `broadcaster.ts` (ao lado de `notifyStageCleared` :191). `notifyGameEnded` já existe (:212) — chamar com `drawMode='multimatch'`, `totalWinners`.

#### (B) Frontend — archived autoritário [OFF-CHAIN]
`apps/frontend/src/components/gameroom/useGameRoomState.ts` `effectiveDisplayStatus` (useMemo 264-273; linha 266 `if (drawnBalls.length > 0 && !isGameEnded) return 'drawing';`):
- Adicionar à condição: `&& game?.status !== 'archived'`. Ou seja: se on-chain `status === 'archived'`, retornar `archived` MESMO que `isGameEnded` tenha sido perdido e haja bolas. Isso descongela a tela.
- `showFallback` (209-212) já dispara quando `status === 'archived'` — com a correção acima, o `effectiveDisplayStatus` não trava em 'drawing' e o fallback (histórico) é usado corretamente.

#### (C) CONTRATO — idempotência paid_stages [ADR-052; deploy on-chain requer OK do user]
`contracts/bingo/include/bingo.hpp` `ticket_record` (78-85): adicionar `uint64_t paid_stages = 0;` (bitmask por stage; bit `1ULL << stage_num`).
`contracts/bingo/src/bingo.cpp` `claimstage` (592-644):
- Após `require_find(ticket_id)` (linha 622), ANTES de creditar: `uint64_t bit = 1ULL << stage_num; check(!(ticket_itr->paid_stages & bit), "stage ja pago (idempotencia)");`
- Após creditar balance + `total_paid` (641), marcar: `tickets.modify(ticket_itr, same_payer, [&](auto& t){ t.paid_stages |= bit; });`
- Isso torna o retry do worker (frente A) SEGURO (re-chamar mesmo (ticket, stage) é REJEITADO, sem double-pay).
- **Build (RAG ADR-036 / skill infra-ops, NÃO-ÓBVIO):** compilar DENTRO do container `bingo_waxdev` (`docker exec bingo_waxdev ...`), em `/tmp/bingo` (HOST /app/contracts é read-only). `rm -f bingo.wasm bingo.abi && find . -name '*.o' -delete` ANTES de `cdt-cpp` (cdt 4.0.1 cacheia .o → hash não muda após editar require_auth). **NUNCA usar `-abigen`** (ABI vem vazio → quebra get_table_rows); usar `contracts/bingo/bingo.abi` MANTIDO À MÃO (17 tabelas). Confirmar code_hash muda.
- **PÓS-DEPLOY OBRIGATÓRIO:** `get_abi` on-chain tem o campo `paid_stages` na `ticket_record` — NÃO basta code_hash bater. Harness CB-5 (idempotência) reaplicado: 2º `claimstage` mesmo (ticket, stage) é REJEITADO.

### Testes de regressão (multi-match)
- `gameOrchestrator.test.ts` (já existe, 381-465): adicionar caso `mockPayStage` do stage 2 lançça → stage 1 e 3 ainda pagam (`mockPayStage` chamado 3x), `notifyGameEnded` chamado, `triggerCloseGame` chamado. E caso retry (após frente C) não double-paya.
- `useGameRoomState.test.ts` (criar ou estender): `game.status === 'archived'` + `drawnBalls.length > 0` + `!isGameEnded` → `effectiveDisplayStatus === 'archived'`.

---

## Plano de execução (GitFlow — 1 bug = 1 worktree = 1 PR) — Fase 1 MULTIMATCH (worker + frontend + contrato)

### Worktree único (todas as frentes) — `/tmp/cb-multimatch-fix` (branch `fix/multimatch-underpay-idempotent`)
1. Criar worktree a partir de develop (7462ed8). Colocar `.hermes-CONTEXT.md` DENTRO do worktree (RAG-first; skill opencode-context-brief).
2. **Frente A (worker):** try/catch por stage em `orchestrateMultiMatch` (gameOrchestrator.ts:242) + `notifyStageFailed` (broadcaster) + fechamento garantido (finally) + `notifyGameEnded`.
3. **Frente B (frontend):** `effectiveDisplayStatus` Archived autoritário (useGameRoomState.ts:266).
4. **Frente C (contrato):** `paid_stages` em `ticket_record` (bingo.hpp) + check/marcação em `claimstage` (bingo.cpp:592-644). Compilar wasm (build workflow acima), ABI manual.
5. Testes: `pnpm test` (gameOrchestrator + novo useGameRoomState) + `contracts test` (EOS-VM, harness CB-5 idempotência).
6. PR via `gh api` → merge develop → `git merge --ff` develop → remover worktree.
7. **BUILD/DEPLOY (off-chain):** worker + frontend → GHCR → VPS (imagem `cryptobingo-worker-game-loop:testnet`, frontend conforme pipeline).
8. **DEPLOY ON-CHAIN (contrato) — SÓ APÓS OK EXPLÍCITO DO USUÁRIO** (cold key / bingogamesvc, ADR-026/045). Antes: validar wasm local + `get_abi`. Após: `get_abi` confirma `paid_stages`; jogo teste multi-match paga todos os stages sem double-pay.
9. **Validação final:** rodar 1 partida multi-match (sala 14) na testnet → todos os stages pagos; frontend não congela em "drawing"; `get_table_rows` confirma `total_paid` correto.

### Fase 3 — Golden Ball (Bug 1) — CONCLUÍDA EM PRODUÇÃO (2026-07-20, opção 3: popular Mongo + invalidar Redis)

**ACHADO CRÍTICO (por pouco não falha silenciosamente):** o model Mongoose pluraliza o nome → lê de **`gametypemetadatas`**, NÃO `GametypeMetadata`. A escrita inicial foi feita em `GametypeMetadata` (singular, literal) — coleção que **ninguém lê**. A coleção correta (`gametypemetadatas`) já tinha docs para gametypes 1/2/3 com `rules` ERRADOS (era essa a fonte do drift). Corrigido: upsert em `gametypemetadatas` com `rules`+`combinations` corretos; `GametypeMetadata` (lixo) apagada.

**Execução (sem on-chain — evitou `setcombos`):**
1. `db.gametypemetadatas.findOneAndUpdate({gametype_id:"3"}, {$set:{rules:[13 corretos], combinations:[4 combos n_of_type]}}, {upsert:true})`.
2. `db.GametypeMetadata.deleteMany({})` (lixo da escrita inicial errônea).
3. Redis `DEL pattern:gametype:3 worker:pattern:gametype:3`.
4. **Verificação:** GET interno api-gateway (`http://localhost:8080/api/v1/gametypes/3/patterns`) → `rules` corretos (ROW_*/DIAG_*=simple, BINGO_*=special, MASTER=master) + combos 5x/4x/3x/2x Simples (1500/1000/600/300). Domínio público `test-api.cryptobingo.bet` (cache-bust) → também correto.

**Não-retroativo:** jogos JÁ processados (ex: sala 12 / 1784514212064, pagou só ROW_0) NÃO são corrigidos por esta ação — exigiria reprocessar/re-pagar (fora do escopo da opção 3). A correção vale para jogos NOVOS do gametype 3.

**Auditoria completa de todos os gametypes (2026-07-20):**
- gt1 (40 Balls): normalizado — espelha gt3 (rules + 4 combos n_of_type), pesos on-chain idênticos. ✅
- gt2 (First Full): normalizado — `rules:[{pattern_id:11, type:master, weight:100}]`, combos `[]`. Worker aplica `master_weight_ovrd:1000` (evaluator.ts:197-199), independente do weight do Mongo. ✅
- gt3 (Golden Ball 40): corrigido (ver acima). ✅
- gt4 (MultiMatch 5): já correto — ROW_1-4+ROW_0 `simple`, sem combos (usa stages). ✅
- gt5 / gt8 / gt9: **removidos** (docs lixo — não existem on-chain; gt9 tinha todos os tipos errados). ✅
- Restam na `gametypemetadatas` exatamente gt1-4 (os 4 gametypes existentes on-chain), todos tipados corretamente.
- Redis correspondente invalidado para todos.

## Validação final (após Fases 1-3)
- Rodar 1 partida de cada gametype (1-4) na testnet.
- Golden Ball (sala 12): cartela com 2 patterns SIMPLES → combinação 2x Simples PAGA.
- Multi-match (sala 14): todos os stages pagos; frontend não congela em "drawing".
- `get_table_rows` confirma `total_paid` correto (sem underpayment, sem double-pay).

## Riscos / pendências
- **BUG 1 causa real = tipagem de padrões (ROW_0=special, DIAG_TL_BR=master no gametype 3), NÃO effectiveBalls** (que está correto com goldenBallAfter=39). Decisão de design pendente do usuário (item Fase 3).
- **Esclarecido (sem divergência matrix/HTML):** matrix on-chain é column-major (24 bytes, sem free space). Reconstruindo column-major, a grade bate EXATAMENTE com o HTML do usuário. Matrix on-chain e frontend estão corretos e consistentes.
- `goldenBallAfter` está correto (39) no gametype 3 — não é configuração errada do gametype.
- Deploy on-chain (Fase 2) é irreversível → aguardar OK do usuário.

## Artefatos de referência (no disco)
- `/tmp/cb-multimatch-bug/GRILL-REPORT.md` (relatório GLM, multi-match)
- `/home/iuri/Projetos/cryptobingo/.hermes/tasks/bug-goldenball-combo/DIAGNOSTIC.md` (subagent, golden ball — Teoria (a) REFUTADA: effectiveBalls não é o bug)
- RPC on-chain: jogo 1784514212064 (`games` + `gametypes` id=3), cartela 5316250706917835848 (`tickets` scope jogo).
- api-gateway: `GET /gametypes/3/patterns` (patterns + rules + combinations reais do gametype 3).
