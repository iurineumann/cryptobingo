# Situação Atual

Gerado em: 2026-07-04

## O que estamos fazendo
Implementando CB-ContextOS (adaptação do ContextOS para CryptoBingo) para mitigar
perda de contexto devido a compaction do OpenCode.

## Task identity
- domínio: infrastructure
- escopo: L1
- durabilidade: durable
- objeto: methodology/contextos-agent-teams

## Arquivos ativos
- `.opencode/plans/2026-07-04-contextos-agent-teams.md` — plano mestre
- `opencode.json` — config principal (será alterado)

## Decisões recentes
- Guard file (SESSION_GUARD.md) injetado via experimental.session.compacting hook
- Agent teams via file-based handoff (WORKFLOW.md), não Ensemble (reservado para 3+ agents)
- Decision framework: B (WORKFLOW.md + task tool) default, Ensemble para complexos
- 7 arquivos de preservação, 16 agentes individuais, 7 teams

## Próximos passos
1. Criar estrutura .contextos/
2. Escrever 7 arquivos da Fase A
3. Verificar plugin carrega sem erro
