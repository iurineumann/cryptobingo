# Session Guard — CryptoBingo

## Fase Atual
Landing Page — Análise Abrangente + Stack Improvements ✅  
Plano refinado v3 criado, pronto para execução.

## Arquivos alterados nesta sessão
- .contextos/guard/SESSION_GUARD.md — atualizado
- .contextos/journal/2026-07-04.md — journal completo
- .contextos/memory/core.md — atualizado (RAG/stack/workflow)
- .opencode/WORKFLOW.md — reescrito como processo universal 6 fases
- .opencode/plans/2026-07-04-landing-page-comprehensive-analysis.md — v1+v2
- .opencode/plans/2026-07-04-landing-page-refinado.md — v3 definitivo
- .local/share/opencode/mcp/mcp-rag/src/index.js — +rag_search_batch +rag_index_text
- .local/share/opencode/mcp/mcp-rag/src/store.js — sqlite-vec migration
- .local/share/opencode/mcp/mcp-rag/src/embedder.js — Ollama GPU fallback

## Decisões críticas desta sessão
- RAG como memória persistente de agents: rag_index_text para agent outputs
- WORKFLOW.md universal: 6 fases, skill check obrigatório, RAG-first
- Impeccable skill: 4 absolute bans violados na landing page (identical card grids, zero imagery, stats errados, mobile overflow)
- 3 a11y críticos (skip-link, focus trap, aria-live)
- Personas expandidas: 8 (added Content Creator + Token Holder)
- GitHub: projeto pré-lançamento — nenhum feedback de usuário real
- Tools avaliadas: MCP-RAG 8.6/10, impeccable 8.7/10, ensemble 6.2/10, gh CLI 7.3/10

## Blockers
- (none)

## Próximo passo imediato
Executar Fase 0 do plano refinado: fundação + medição + criar issues no GitHub.

## Constraints que devem sobreviver
- ABI mantido à mão — nunca confiar no generated ABI
- binary_extension para migração de tabela
- max_weight por cartela (ADR-005)
- PT-BR em código/comentários/commits
- Skills pré-fase obrigatórias (WORKFLOW.md Fase 3)
- RAG memory: indexar antes de descartar qualquer output de agent
