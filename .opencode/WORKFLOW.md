# WORKFLOW.md — Processo Universal

**Aplica-se a:** Qualquer tarefa no CryptoBingo (planejamento, implementação, análise, deploy)
**Princípio:** RAG-first → Ensemble → Skills → Git Flow → Encerramento

---

## Fase 0 — Contexto (RAG + GitHub)

**Antes de qualquer ação,** consultar fontes existentes:

1. **RAG search batch** — `rag_search_batch(3-5 queries, tags, project: "cryptobingo")` p/ docs relevantes
2. **GitHub** — `gh issue list`, `gh pr list`, `gh project item-list` p/ issues/PRs abertos
3. **Web** — `websearch(2-3 queries)` p/ contexto externo se necessário
4. **Resultado** → base do planejamento

## Fase 1 — Pesquisa (Agent Ensemble)

Tarefas complexas → múltiplos agents especializados em paralelo:

1. Identificar N perspectivas independentes
2. Cada agent recebe no prompt: contexto da Fase 0 + instrução pra usar RAG/websearch
3. Spawnar agents:

| Tipo de agent | `worktree` | Exemplo |
|---|---|---|
| `explore` (código) | `false` | code-explore, mcp-rag-research |
| `general` (pesquisa web) | `false` | web-design-research, marketing-research |
| `general` (edição código) | `true` | implementador, builder |

4. AO FINAL de cada agent: **lead indexa output** via `rag_index_text(text, path, tags: ["agent-output", "<escopo>"], project: "cryptobingo")`

## Fase 2 — Síntese (Plano)

Após todos agents concluírem:

1. Lead coleta outputs
2. Lead escreve plano em `.opencode/plans/<data>-<escopo>.md`
3. Plano referencia as fases abaixo
4. `rag_index_text(plano, path: "plan://<escopo>/<data>", tags: ["plan", "<escopo>"], project: "cryptobingo")`

## Fase 3 — Skill Check

**Antes de implementar qualquer camada,** invocar skill correspondente:

| Layer | Skill | Quando |
|---|---|---|
| UI / Componentes | `impeccable` | Antes de criar/alterar UI |
| React frontend | `frontend-feature` | Antes de mexer em apps/frontend |
| Landing page | `frontend-feature` | Antes de mexer em apps/landing-page |
| Worker | `worker-game-resolution` | Antes de mexer em apps/worker-game-loop |
| API Express | `api-endpoint` | Antes de mexer em apps/api-gateway |
| Contrato C++ | `wax-contract` | Antes de mexer em contracts/ |
| E2E Cypress | `e2e-ui-cypress` | Antes de mexer em apps/e2e-ui |
| Harness on-chain | `harness-e2e` | Antes de mexer em apps/harness |
| Weights/economia | `weights-calibration` | Antes de mexer em RTP/pesos |
| TDD | `tdd` | Antes de qualquer implementação nova |
| Debug | `diagnose` | Ao encontrar bug |
| Brainstorm | `brainstorming` | Ao iniciar feature nova |

## Fase 4 — Implementação (Git Flow)

1. `git checkout -b feature/<slug>` a partir de develop
2. TDD: RED → GREEN → refactor
3. SonarQube antes de cada commit
4. Commit PT-BR: `tipo(escopo): descrição` + `Co-Authored-By: ...`
5. PR para develop com template `.github/PULL_REQUEST_TEMPLATE.md`

## Fase 5 — Verificação

1. Typecheck: `npx tsc --noEmit` (frontend/landing) · `npx tsc --project tsconfig.build.json --noEmit` (api/worker)
2. Testes do pacote verdes
3. SonarQube: 0 BLOCKER/CRITICAL/MAJOR
4. Lighthouse se UI: Performance ≥90, A11y ≥95

## Fase 6 — Encerramento

1. Verificar `Closes #N` fechou issue
2. Se não, `scripts/closeout.sh <issue> [pr]`
3. Atualizar `.opencode/plans/` com status
4. ADR se mudança estrutural
5. Atualizar CLAUDE.md se novo componente/flow
6. **RAG memory:** `rag_index_text(sumário, path: "decision://<escopo>/<data>", tags: ["decision", "<escopo>"], project: "cryptobingo")`

---

## Fases vs Estado do Projeto

```
Fase 0 (Contexto) ──→ Fase 1 (Pesquisa) ──→ Fase 2 (Síntese)
                                                     │
                                                     ▼
                                              Fase 3 (Skill Check)
                                                     │
                                                     ▼
                                              Fase 4 (Implementação)
                                                     │
                                                     ▼
                                              Fase 5 (Verificação)
                                                     │
                                                     ▼
                                              Fase 6 (Encerramento)
                                                     │
                                                     ▼
                                           rag_index_text (memória)
```

---

## Ferramentas MCP-RAG

| Tool | Uso | Tags recomendadas |
|---|---|---|
| `rag_search` | Query única específica | — |
| `rag_search_batch` | Contexto amplo (2-8 queries, dedup) | tags p/ filtrar |
| `rag_index_text` | Persistir output de agent/decision (**exige `project: "cryptobingo"`**) | `agent-output`, `decision`, `<escopo>` |
| `rag_stats` | Verificar estado do store | — |
| `rag_index` | Indexar arquivos (**exige `paths` não vazio e `project: "cryptobingo"`**) | — |

**Regra obrigatória (assinatura atual do MCP):** `rag_index_text` exige `text`, `path`, `tags` e `project`; `rag_index` exige `paths` (não vazio) e `project`. Chamadas sem `project` falham fechado. Nunca usar `rag_index` sem `paths` — a versão antiga indexava arquivos do CryptoBingo por default; a atual rejeita lista vazia.

### Convenção de paths pro rag_index_text

| Tipo | Path pattern |
|---|---|
| Agent output | `agent://<nome-agent>/<data>` |
| Decisão | `decision://<escopo>/<data>` |
| Plano | `plan://<escopo>/<data>` |
| Review | `review://<camada>/<data>` |

### Convenção de tags

Sempre incluir: `["agent-output"|"decision"|"plan"|"review", "<escopo>", "<camada>"]`

---

## Guia Rápido: Ensemble típico

```yaml
# Ex: Análise de landing page
Fase 0:
  - rag_search_batch(["landing page componentes", "landing i18n", "landing deploy"], project: "cryptobingo")
  - gh issue list --label landing
  - websearch("landing page best practices 2026")

Fase 1:
  - team_spawn(rag-research,   worktree: false)  # docs projeto
  - team_spawn(web-design,     worktree: false)  # best practices externas
  - team_spawn(code-explore,   worktree: false)  # código real
  - # ... aguardar todos
  - rag_index_text(output, tags: ["agent-output", "landing", "design"], project: "cryptobingo")

Fase 2:
  - Lead sintetiza → .opencode/plans/2026-07-04-landing-plano.md
  - rag_index_text(plano, tags: ["plan", "landing"], project: "cryptobingo")

Fase 3:
  - skill("frontend-feature")  # antes de tocar landing code
  - skill("impeccable")        # antes de UI audit

Fase 4-6: git flow padrão
```
