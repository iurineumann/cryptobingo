# Plano de Orquestração — Multi-token + Loki (2026-07-15)

Seguindo cryptobingo-orchestrator: RAG-first, issue→branch→PR `--base develop`,
TDD, coding delegado ao OpenCode (api/frontend), infra manual (Loki).

## Sequência

1. **#323 api-gateway — getPlatformSummary multi-token + RTP real** (BASE)
   - branch `feature/323-stats-multitoken` de origin/develop
   - OpenCode implementa + TDD (`ledger.test.ts` cobre agregação por token + RTP)
   - Hermes valida: `pnpm --filter @cryptobingo/api-gateway test` + `tsc --noEmit` NA BRANCH
   - PR `--base develop` `Closes #323` → merge manual → issue close
2. **#324 frontend — StatsBar híbrido (totals + prize/rtp por token)**
   - branch `feature/324-frontend-by-token` de origin/develop
   - depende de #323 (formato by_token[])
   - Consumers: landing-api `stats_game.ts` (tipo) + landing-page `api.ts` GameStats +
     `StatsBar.tsx` (UX híbrida: totals globais + prize/rtp por token) + testes
   - Skills `frontend-feature` + `impeccable` para UI
   - OpenCode implementa + TDD (StatsBar.test.tsx atualizados p/ by_token[])
   - Hermes valida na branch
   - PR `--base develop` `Closes #324`
3. **#325 infra — Loki no Grafana** (independente, pode ser paralelo)
   - branch `feature/325-loki-grafana` de origin/develop
   - Hermes edita monitoring-compose.yml (loki + promtail) + Grafana datasource provisioning
   - rsync VPS + restart stack + validar logs no Grafana Explore
   - PR `--base develop` `Closes #325`

## Preceitos

- NUNCA PR para `master` (default do repo é master, integração em develop) → `--base develop`.
- PR→develop NÃO auto-fecha issue → fechar manual após merge.
- TDD obrigatório (RED→GREEN→refactor).
- Coding api/frontend → OpenCode (`opencode/deepseek-v4-flash-free`, sem `-f`).
- Infra/Loki → Hermes manual (ssh VPS + rsync), deploy manual.
- Validação roda ONDE O CÓDIGO VIVE (branch, não develop).
- Indexar RAG incrementalmente a cada avanço (`agent://bugs|session/<data>-<slug>`).

## DoD global

- /api/stats/game retorna by_token[] com WAX e BINGO separados + RTP real.
- StatsBar exibe por token.
- Loki datasource no Grafana, logs de containers visíveis.
- Todos os PRs mergeados, issues fechadas, working tree limpo.
