# ADR-051: Validação Sistêmica de Inputs em Cadastros (Game Types, Salas e Demais)

**Data:** 2026-07-10
**Status:** Proposto
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O jogo `1783711068092` (sala 14, gametype 4 `multimatch`) sorteou todas as 75 bolas e
não pagou ninguém on-chain. **Causa raiz:** o gametype 4 estava com `draw_mode = "multimatch"`
mas `stages = []` (vazio) — estado inválido segundo ADR-013 §1 ("vazio = não é MULTI_MATCH").

A auditoria revelou um **padrão sistêmico**: as ações de cadastro do sistema *"salvam o que
recebem"* sem validar a **consistência semântica** entre campos. Exemplos concretos:

- `addgametype` (contrato) valida o *valor* de `draw_mode` mas **não** exige os campos
  obrigatórios de cada modo (ex.: `multimatch` sem stages; `fixed` sem `max_balls`;
  `firstfull` sem regra MASTER; `goldenball` só valida `golden_ball_after`).
- `setcombos` (contrato) usa `emplace` (ADICIONA) em vez de `=` (SUBSTITUI) — chamadas
  repetidas **duplicam** combinações. Inconsistente com `setstages`.
- `gameOrchestrator` não tem **defesa** para `multimatch` com stages vazio — revela 75 bolas
  e deixa o jogo travado em `drawn`.
- A camada off-chain (`api-gateway` / `GametypesAdmin`) valida schema básico (Mongoose min/max)
  mas **não valida a coerência draw_mode × campos** antes de submeter on-chain.

A percepção do time é correta: **hoje não há uma camada de validação de inputs coesa** — cada
cadastro confia no caller. Isto viola o princípio de *fail-fast* e permite estados inválidos
que só se manifestam em runtime (jogos quebrados, prêmios incorretos).

---

## Decisão

Adotar **validação em camadas (defense-in-depth)** para todos os cadastros, com o contrato como
guarda final (fonte de verdade) e as camadas superiores dando feedback rápido ao usuário.

### Princípios

1. **Fail-fast e explícito:** toda entrada inválida é rejeitada com mensagem clara, o mais cedo
   possível na pilha (UI → api-gateway → contrato).
2. **Contrato é o guarda final:** validações críticas de integridade (que causam perda de fundos
   ou jogos quebrados) DEVEM existir on-chain, mesmo que dupliquem a UI. UI pode ser burlada.
3. **Consistência semântica por tipo:** cada `draw_mode` (e cada tipo de cadastro) tem um
   contrato de campos obrigatórios/proibidos — validado de forma declarativa.
4. **Sem duplicação silenciosa:** ações de "set" substituem (`=`), nunca acumulam (`emplace`),
   salvo semântica de append explícita e documentada.

### Matriz de validação por `draw_mode` (game types)

| Modo | Obrigatório | Proibido / Ignorado | Onde validar |
|---|---|---|---|
| `standard` | ≥1 rule | stages, golden_ball_after | contrato + gateway |
| `fixed` | `max_balls` ∈ [1,75] | stages, golden_ball_after | contrato + gateway |
| `firstfull` | rule com pattern MASTER (mask `0x1FFFFFF`) | stages | contrato + gateway |
| `goldenball` | `golden_ball_after` ∈ [1,73] | stages | contrato (já parcial) + gateway |
| `multimatch` | `stages` não-vazio (via `setstages`) | `max_balls`, `golden_ball_after` | **`creategame` + gateway + orquestrador** |

> `stages` é gravado por action separada (`setstages`), então a validação
> `multimatch ⇒ stages≠[]` não pode ficar em `addgametype`. Ela vai para o **ponto de uso**
> (`creategame`: recusa criar jogo de gametype `multimatch` sem stages) e para a camada
> off-chain (admin bloqueia salvar; orquestrador aborta com erro claro).

### Escopo — todos os cadastros (não só game types)

Aplicar o mesmo rigor a: **salas** (`createroom`/`updateroom`: ticket_price_min ≤ max, símbolo/
contrato coerentes, gametype_id existente, max_tickets_per_player ≥ 0), **templates NFT**
(`createtemplate`: já tem boa validação — usar como referência), **combos** (`setcombos`:
substituir, validar cláusulas), **stages** (`setstages`: já valida ordenação/pesos — manter),
e demais actions de escrita.

---

## Implementação (faseada)

### Fase 1 — Correções críticas (bloqueiam o bug atual)
- **Contrato:**
  - `creategame`: recusar gametype `multimatch` com `stages` vazio
    (`check(!gt.stages.empty(), "Gametype multimatch sem stages definidos.")`).
  - `addgametype`: validar consistência por modo (fixed→max_balls, firstfull→MASTER presente).
  - `setcombos`: trocar `emplace` por `=` (substitui).
- **Orquestrador (`gameOrchestrator`):** defesa para `multimatch` com stages vazio —
  abortar o jogo com erro claro (não revelar 75 bolas / não travar em `drawn`).
- **api-gateway + `GametypesAdmin`:** validação declarativa draw_mode × campos, bloqueando o
  submit inconsistente com mensagem ao admin.

### Fase 2 — Camada de validação declarativa reutilizável
- Extrair um módulo de schemas (ex.: `zod`) compartilhado (`packages/shared-types` ou novo
  `packages/validation`) para gametypes, salas, combos, stages — consumido pelo api-gateway
  (middleware) e pelo frontend (form validation), fonte única de verdade.
- Middleware genérico de validação no api-gateway aplicado a todas as rotas de escrita admin.

### Fase 3 — Auditoria e cobertura
- Revisar TODAS as actions de escrita do contrato e endpoints de escrita do gateway,
  garantindo validação e testes negativos (input inválido → rejeição).
- Testes de harness cobrindo estados inválidos (multimatch sem stages, fixed sem max_balls, etc.).

---

## Consequências

**Positivas:**
- Elimina a classe de bug "estado inválido salvo silenciosamente".
- Contrato como guarda final protege fundos mesmo com UI/gateway comprometidos.
- Schema declarativo compartilhado reduz drift entre frontend e backend.

**Negativas / Riscos:**
- Duplicação de regras (contrato + gateway + UI) — mitigada centralizando o schema off-chain
  e documentando o subconjunto crítico on-chain.
- Redeploy do contrato necessário (Fase 1) — seguir runbook de deploy manual + `git checkout`
  do ABI (cdt local corrompe ABI in-dir).
- Custo de CPU adicional marginal nas validações on-chain (aceitável).

---

## Arquivos Afetados (Fase 1)

| Arquivo | Mudança |
|---|---|
| `contracts/bingo/src/bingo.cpp` | `creategame` valida multimatch→stages; `addgametype` consistência por modo; `setcombos` `=` |
| `apps/worker-game-loop/src/services/gameOrchestrator.ts` | defesa multimatch stages vazio |
| `apps/api-gateway/src/controllers/*gametype*` | validação draw_mode × campos |
| `apps/frontend/src/components/admin/GametypesAdmin.tsx` | validação de form pré-submit |
| `apps/harness/tests/*` | testes negativos de cadastro inválido |

## Referências

- ADR-012: Draw Modes (standard/fixed/firstfull/goldenball)
- ADR-013: Multi-Match — `stages`, `setstages`, `claimstage`
- ADR-016: Combinações on-chain — `setcombos`
- Bug: `agent://bugs/2026-07-10-multimatch-75-bolas` (RAG)
