# ADR-012: Modos de Sorteio Modulares (Draw Modes)

**Data:** 2026-06-01
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

A plataforma opera hoje com um único fluxo de sorteio: 75 bolas sempre sorteadas, vencedor
identificado pelo máximo de 12 padrões estáticos (ou padrões dinâmicos do gametype). A análise
de engajamento e a demanda de B2B por mecânicas diferenciadas exigem 4 novos modos:

| Modo | Descrição curta |
|---|---|
| `standard` | 35 bolas padrão (configurável via `max_balls`), max-weight payout |
| `fixed` | N bolas explicitamente configuradas — documenta intent; mecânica = standard com max_balls definido |
| `first_full` | Bolas sorteadas até que 1+ cartelas completem o MASTER (cartela cheia) |
| `golden_ball` | 35 bolas normais + 1 "bola dourada" (extra, além das 35) com multiplicador aleatório |
| `multi_match` | Estágios progressivos por número de padrões cumpridos *(sprint futura)* |

> **Premissa fundamental:** O oracle (`orng.wax`) entrega sempre **75 bytes** (o baralho completo embaralhado). O jogo padrão usa apenas os **primeiros 35** para avaliação. Os bytes restantes ficam disponíveis como entropia extra (ex: bola dourada no modo GOLDEN_BALL).

Adicionalmente, foi identificado um **bug crítico** no contrato: `claimwin` arquiva o jogo na
primeira chamada (`status = archived`), bloqueando o pagamento de múltiplos vencedores.

---

## Decisões

### 1. Bug Crítico — Status `paying` + Action `closegame`

**Problema:** `claimwin` verifica `status == "drawn"`, paga 1 vencedor e seta
`status = "archived"` na mesma transação. A segunda chamada falha.

**Solução:**
- `claimwin` aceita `drawn | paying`. Na **primeira** chamada (`drawn`), transiciona para `paying`.
- Novo estado `paying` na FSM: `drawn → paying → archived`.
- Nova action `closegame(game_id)` (auth: `microservice`): `paying | drawn → archived`.
  O worker chama `closegame` após todos os `claimwin` do lote.
- `abortgame` passa a aceitar também `paying` (fail-safe após payout parcial).

**FSM completa atualizada:**
```
created → funding → locked → drawing → drawn → paying → archived
                          ↘ aborted (fail-safe, aceita: locked|drawing|paying)
```

### 2. Campo `draw_mode` em `gametype_record`

Adicionado campo `name draw_mode` ao struct `gametype_record` no contrato.
Valores válidos (como `eosio::name`):
- `"standard"_n` — comportamento existente (default, retrocompatível)
- `"fixed"_n`
- `"firstfull"_n` — `first_full` normalizado como eosio::name (máx 12 chars)
- `"goldenball"_n`
- `"multimatch"_n` — reservado (não implementado nesta sprint)

### 3. Modo FIXED — `max_balls: uint8_t`

Campo `uint8_t max_balls` adicionado a `gametype_record`. Valor `0` = padrão (`DEFAULT_DRAW_BALLS = 35`).

**On-chain:** nenhuma mudança. O oracle entrega 75 bytes sempre; o contrato armazena tudo.
**Off-chain:** o evaluator aplica `drawn_balls.slice(0, max_balls || DEFAULT_DRAW_BALLS)` em **todos os modos** (incluindo `standard`). A constante `DEFAULT_DRAW_BALLS = 35` está definida no evaluator e no `SUGGEST_MAX_BALLS` do frontend.
**ABI:** `max_balls: uint8` adicionado ao struct `gametype_record`.

### 4. Modo FIRST_FULL — Peso dinâmico do MASTER

Campo `uint8_t master_weight_override` adicionado a `gametype_record`.
Quando `> 0`, substitui o `weight` da regra cujo padrão tenha `mask == 0x1FFFFFF` (MASTER).

**Off-chain (evaluator):**
1. Varre todos os tickets incrementalmente bola a bola para encontrar o `cutoff_ball` — a bola
   em que o primeiro ticket completa o MASTER (todos os 24 números sorteados).
2. Avalia todos os tickets com `drawn_balls.slice(0, cutoff_ball)`.
3. Apenas completações do MASTER contam como vencedores neste modo.
4. `master_weight_override` é aplicado no cálculo de payout pelo claimwin existente
   (o worker usa esse weight ao selecionar o `win_pattern_mask`).

**On-chain:** o contrato não precisa conhecer o modo — recebe o `win_pattern_mask` correto e
o weight já está na tabela de regras do gametype (ou é o `master_weight_override`).

### 5. Modo GOLDEN_BALL — Multiplicador derivado da entropia

Campos adicionados a `gametype_record`:
- `uint8_t golden_ball_after` — número de bolas normais antes da bola dourada.

Campos adicionados ao **parâmetro** de `claimwin`:
- `uint16_t golden_multiplier` — multiplicador derivado off-chain (0 = sem golden ball).

**Derivação off-chain (evaluator):**
- Bola dourada: `drawn_balls[golden_ball_after]` (número 1–75).
- Entropia do multiplicador: dois bytes subsequentes do sorteio usados como seed.
  ```typescript
  const roll = ((drawn_balls[ga+1] << 8) | drawn_balls[ga+2]) % 10_000;
  ```
- Tabela de multiplicadores (probabilidade assimétrica, total = 100%):

  | Multiplicador | Faixa de roll | Probabilidade |
  |---|---|---|
  | 2× | 0–5999 | 60% |
  | 3× | 6000–8499 | 25% |
  | 5× | 8500–9499 | 10% |
  | 10× | 9500–9799 | 3% |
  | 20× | 9800–9949 | 1.5% |
  | 50× | 9950–9989 | 0.4% |
  | 100× | 9990–9999 | 0.1% |

- O multiplicador só se aplica a tickets cujo **padrão vencedor inclua** o bit da bola dourada.
  Tickets sem a bola dourada no padrão vencedor recebem o payout normal (multiplicador = 1).
- **On-chain:** `claimwin` recebe `golden_multiplier`; se `> 1`, multiplica o payout antes
  de creditar. Nenhuma lógica de tabela/derivação no contrato (confia no microservice).

**Fase de avaliação:**

1. A fase normal usa `drawn_balls.slice(0, golden_ball_after)` onde `golden_ball_after` deve ser ≥ `DEFAULT_DRAW_BALLS` (35). A bola dourada é `drawn_balls[golden_ball_after]` — o primeiro byte do oracle além do sorteio normal.
2. Verificar se a bola dourada está na matrix de cada ticket vencedor e coberta pelo padrão.
3. Passar `golden_multiplier` para `claimwin` (0 se não aplicável, multiplicador se sim).

### 6. Modo MULTI_MATCH — Diferido para Sprint Futura

MULTI_MATCH requer:
- Novo struct `stage_rule` no contrato (estágios com `patterns_required` e `weight`).
- Nova action `claimstage(game_id, ticket_id, stage, ball_count, win_pattern_mask)`.
- Estado intermediário por estágio (cutoff ball por estágio).
- Evaluator com loop incremental de estágio por estágio.
- UI com editor de estágios dinâmico.

**Decisão de design (registrada para a sprint futura):**
- Ticket que alcança estágio N permanece ativo para estágios superiores (sem lock).
- Payout por estágio é independente: ticket pode acumular FIRST + SECOND + THIRD.
- Estágios são ordenados por `patterns_required` crescente; o jogo encerra no último.
- Implementar nova ADR-013 antes de codificar.

---

## Consequências

**Positivas:**
- Bug de múltiplos vencedores corrigido — todos os gametypes são agora pagos corretamente.
- Três novos modos de sorteio sem refatoração invasiva do evaluator.
- Retrocompatível: `draw_mode = "standard"_n` e `max_balls = 0` preservam comportamento atual.
- Multiplier derivation off-chain mantém o oracle imutável.

**Negativas / Riscos:**
- `claimwin` passa a ter parâmetro extra `golden_multiplier` — callers existentes precisam
  passar `0`. O evaluator é o único caller.
- `closegame` exige nova chamada do worker após cada lote de `claimwin` — risco de omissão
  deixa o jogo em `paying` indefinidamente. Mitigação: worker verifica e corrige via polling.
- Modo FIRST_FULL com varredura incremental O(n_tickets × n_balls) é lento para salas com
  muitos tickets; mitigar com inverted index (já implementado no Redis).
- `golden_multiplier` não é verificado on-chain (confia no microservice) — risco de bug
  off-chain super/sub pagar. Mitigação: testes de integração com mock de entropia.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `contracts/bingo/include/bingo.hpp` | `gametype_record` + `game_state` novos campos |
| `contracts/bingo/src/bingo.cpp` | `claimwin` (paying, golden_multiplier), `closegame`, `abortgame` |
| `contracts/bingo/bingo.abi` | Structs + nova action `closegame` |
| `packages/shared-types/src/index.ts` | `GameStatus` + `DrawMode` + `BlockchainGametype` |
| `apps/worker-game-loop/src/services/evaluator.ts` | Modos FIXED/FIRST_FULL/GOLDEN_BALL |
| `apps/worker-game-loop/src/services/blockchain.ts` | `executeCloseGame`, `executeClaimWin` |
| `apps/frontend/src/services/api.ts` | `BlockchainGametype` + `DrawMode` |
| `apps/frontend/src/components/admin/GametypesAdmin.tsx` | UI: draw_mode + campos condicionais |

---

## Traces de Rastreabilidade

| Requisito | Origem | Arquivos |
|---|---|---|
| REQ-012-01: Multi-winner bug fix | Bug crítico identificado em `claimwin` | `bingo.cpp`, `blockchain.ts`, `evaluator.ts` |
| REQ-012-02: FIXED mode | Briefing de game design | `bingo.hpp`, `evaluator.ts`, `GametypesAdmin.tsx` |
| REQ-012-03: FIRST_FULL mode | Briefing de game design | `bingo.hpp`, `evaluator.ts`, `GametypesAdmin.tsx` |
| REQ-012-04: GOLDEN_BALL mode | Briefing de game design | `bingo.hpp`, `bingo.cpp`, `evaluator.ts`, `GametypesAdmin.tsx` |
| REQ-012-05: MULTI_MATCH (diferido) | Briefing de game design | ADR-013 (futuro) |

---

## Referências

- ADR-004: Bitmasking Motor de Resolução
- ADR-005: Fixed-Odds Treasury RTP/GGR
- ADR-008: FSM Completa — Estado CREATED, Campanhas B2B e GC
- SPEC.md §1.2 (FSM), §2.2 (claimwin), §3.2 (Índice Invertido)
