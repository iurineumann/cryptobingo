# ADR-046 — Delegação One-Shot (OpenCode), RAG Global e SonarQube Obrigatório

**Status:** Aceito
**Data:** 2026-07-09
**Autores:** Célula de Engenharia CryptoBingo
**Supersede parcialmente:** restrição de "pesquisa apenas via Agent Ensemble / WORKFLOW.md 6 fases" (contexto 2026-07-04, revogada em 2026-07-09)
**Referencia:** ADR-017 (seção "Governança de execução / Protocolo de Onboarding Obrigatório")

---

## Contexto

A partir de 2026-07-09 o projeto reestruturou suas ferramentas de engenharia:

1. **RAG é global** — disponível para todo o projeto, agentes e ferramentas (não mais restrito a Agent Ensemble). O Hermes (orquestrador) acessa o RAG nativamente via MCP (`mcp_rag_search`/`mcp_rag_index`/`mcp_rag_stats`), e o OpenCode mantém seu MCP RAG + `sonar` (logado).
2. **Delegação de coding ao OpenCode em modo one-shot** (`opencode run`) passou a ser o padrão para tarefas isoladas (ex: issues #189, #221). O subagente roda em subprocesso isolado; o orquestrador carrega apenas o resumo final — reduzindo compaction do contexto.
3. **Caveman full mode** ativo no orquestrador para economia de tokens.

Isso entrou em tensão com regras documentadas anteriores:
- O ADR-017 (Protocolo de Onboarding Obrigatório) exige ler `CLAUDE.md → SPEC → ADRs pertinentes → skill da camada → arquivos-alvo` **antes de editar**, sob pena de retrabalho. O texto do ADR-017 é explícito: "*toda tarefa de implementação (inclusive a delegada a agents)*" segue o protocolo.
- O WORKFLOW.md (2026-07-04) prescrevia RAG-first via ensemble e SonarQube antes de cada commit — regras que, na delegação one-shot, não eram garantidas.

Decisão necessária: como manter o ADR-017 e a qualidade (SonarQube) sem bloquear a delegação one-shot que provou ser eficaz.

---

## Decisão

### 1. Delegação one-shot (OpenCode) é PERMITIDA e é o padrão para tarefas de coding isoladas
O orquestrador (Hermes) delega via `opencode run` com modelo `deepseek-v4-flash-free` (default do OpenCode). O subprocesso isolado mantém o contexto do orquestrador leve.

### 2. ADR-017 (Onboarding Obrigatório) é satisfeito por INJEÇÃO DE CONTEXTO pelo orquestrador
Em vez de depender de o subagente "lembrar" de ler as fontes, **o orquestrador pré-carrega o contexto e o injeta no prompt de delegação**:
- Antes de delegar, o orquestrador usa RAG (`mcp_rag_search` com tags `cryptobingo`/`adr`/`session-summary`) + `read_file` para ler `CLAUDE.md`, `docs/SPEC.md`, ADRs pertinentes e a skill da camada.
- O prompt de delegação inclui uma seção **"CONTEXTO (já lido)"** com o essencial das fontes, mais a instrução: *"Use este contexto; não re-descubra o que já está anexado. Arquivos-alvo: …"*
- Isso torna o onboarding **determinístico** (não dependente de boa vontade do subagente) e cumpre a regra "se não leu o arquivo, não edita" — o orquestrador leu e repassou.

### 3. SonarQube é OBRIGATÓRIO antes de qualquer commit (delegação ou não)
- Mecanismo: MCP `sonar` do OpenCode (shell `sonar`, logado corretamente).
- O prompt de delegação **obrigatoriamente** inclui: *"Rode `sonar` (MCP OpenCode) antes do commit. O commit só acontece se 0 BLOCKER/CRITICAL/MAJOR."*
- O orquestrador, no script de validação pós-delegação, checa a existência do commit e dos testes, e confirma com o subagente o status do SonarQube.
- Justificativa: não subir código de má qualidade ao git (requisito do owner).

### 4. RAG é global e de primeira classe
O RAG não é mais restrito a ensemble. Orquestrador e subagentes consultam RAG nativamente. A restrição de "pesquisa apenas via Agent Ensemble" (WORKFLOW.md 2026-07-04) está **revogada**.

### 5. GitFlow, TDD, pt-BR e Caveman mantidos
Branch `fix|feat|test/<slug>` → PR via `gh` → `develop`. TDD (RED→GREEN). Mensagens em pt-BR. Caveman full mode no orquestrador.

---

## Template de Prompt de Delegação (padrão)

```
IMPLEMENTE: <tarefa>

CONTEXTO (já lido pelo orquestrador — use, não re-descubra):
- CLAUDE.md: <resumo>
- SPEC §X: <resumo>
- ADRs: <lista>
- Skill da camada: <resumo>
- Arquivos-alvo: <paths>

REGRAS:
- TDD: teste primeiro, rode, implemente. Alvo: <X> passando.
- SonarQube OBRIGATÓRIO: rode `sonar` (MCP) antes do commit. Só commite se 0 BLOCKER/CRITICAL/MAJOR.
- pt-BR em código/comentários.
- NAO commite em develop. Branch <tipo>/<slug>, PR via gh (base develop), referencie a issue.
- Use o contexto anexado; arquivos-alvo já mapeados.
```

---

## Consequências

**Positivas:**
- Delegação one-shot mantém contexto do orquestrador leve (menos compaction).
- ADR-017 cumprido deterministicamente (contexto injetado, não por adivinhação do subagente).
- SonarQube obrigatório previne código de má qualidade no git.
- RAG global desburocratiza pesquisa (sem dependência de ensemble).

**Negativas / trade-offs:**
- O orquestrador gasta uma leitura de contexto prévia (RAG + read) antes de delegar. Mitigado: RAG é leve e o custo é menor que debugar retrabalho.
- Depende de o `sonar` MCP do OpenCode estar logado; se cair, a delegação deve ser barrada até restabelecer.

**Impacto em processos:**
- `delegate.sh` (padrão de delegação) e `validate-opencode.sh` (validação pós-delegação) codificam este ADR.
- WORKFLOW.md 2026-07-04 deve ser marcado como histórico (restrição de ensemble revogada).

---

## Referências
- ADR-017 (Testes E2E UI/Cypress — seção Governança de execução / Protocolo de Onboarding Obrigatório).
- `decision://discovery/2026-07-09` (orquestração Hermes + RAG global).
- `plan://workflow/2026-07-04` (WORKFLOW.md — restrição de ensemble, REVOGADA por este ADR).
- PRs de validação: #219 (rpc.ts 405), #221/#222 (rateLimiter fallback), #189/#190 (sidebar contract_admin).
- SESSION-SUMMARY 2026-07-09 (RAG tag `session-summary`).
