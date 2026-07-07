## Goal
Manter producao estavel + CSP/AtomicAssets/RPC/deploy seguros. Content workflow com personas + QA (ADR-044). Caveman mode full em skills/agents/teams. RAG indexing obrigatorio pos-sessao.

## Constraints
- Azure SWA free tier (sem backend API — proxy routes nao funcionam)
- Vite embute VITE_* em build time — .env.production correto obrigatorio
- Git flow: feature → PR → develop. Nunca commit direto em develop/master
- SWA edge cache ~2min p/ propagar. Service Worker pode segurar versao velha
- Cosmos DB MongoDB: .sort() sem indice composto → 500
- Node 22 undici: evitar testnet.waxsweden.org (SocketError)
- TDD obrigatorio, SonarQube, i18n pt/en/zh
- Caveman mode full em todos outputs de agentes/skills/ferramentas

## Branches track
- `feature/lp-content-ux-search` — content search + UX (13 commits ahead develop)
- `develop` — atual (PRs #194-#200 merged: CSP, GA4, AtomicAssets, deploy fix, caveman)
- `fix/atomic-api-url-prefix` — AtomicAssets route Express 5 + CSP direct URL (PR #199)

## Progress

### Producao (PRs #194-#200 merged)
| PR | O que | Status |
|---|---|---|
| #194 | RPC greymass (Node 22 undici fix) | ✅ |
| #195-#196 | CSP connect-src + GA4 probe | ✅ |
| #197 | Dedup /v1/ AtomicAssets proxy | ✅ |
| #198 | AtomicAssets proxy + explorer waxblock.io | ✅ |
| #199 | Express route fix + CSP direct URL | ✅ |
| #200 | Caveman mode agents + .env.testnet fix + deploy script az fix | ✅ |

### Deploy Ativo (frontend)
- Bundle: `index-B1NXg0w_.js`
- RPC: `waxtestnet.greymass.com`
- AtomicAssets: `https://wax-testnet.api.atomicassets.io/atomicassets/v1`
- Explorer: `testnet.waxblock.io`
- CSP: fonts.googleapis.com + atomicassets.io em connect-src

### Caveman Mode
- 29 agents/teams: ✅ (PR #200)
- 15 skills: ✅ (adicionado nesta sessao)
- Nivel ativo: full

### RAG Indexing
- 525 chunks total (ADRs, plans, session-summaries, context)
- Indexar POS-sessao obrigatorio p/ continuidade entre compactions

## Known Issues (Nao Resolvidos)
- **RPC 405**: `localStorage.cb_rpc_url` invalido no browser → POST /v1/chain/get_table_rows vai p/ test.cryptobingo.bet. Fix: `localStorage.removeItem('cb_rpc_url')`
- **Clarity 400**: `GET https://www.clarity.ms/tag/xge781i2so` retorna 400 — server-side?
- **Docker api-gateway**: imagem `testnet` falha upstream connection. Rollback p/ `testnet-4c0391f`
- **Landing content**: 75 arquivos sem imagens/links, info factual desatualizada

## Pendente (Prioridade)
1. User limpar localStorage RPC → verificar se 405 some
2. Se persistir, investigar Wharfkit session vs swapService discrepancia
3. Debugar Docker build api-gateway (undici + pnpm deploy)
4. Verificar Clarity 400 — CSP ou server?
5. Landing content remediation (Fases 0-4 do plano)
6. Plan D: Search system landing page

## Testes (Baseline)
- Landing: 261 tests, 45 files, branch 70.16%
- API Gateway: 350+ tests, Worker: 200+, Frontend: 290+

## Documentacao Relacionada
- `.opencode/summary.md` (este arquivo)
- `agent://session/2026-07-07-production-infra` (RAG)
- `docs/adr/ADR-042-analytics-landing.md`
- `docs/adr/ADR-043-observability.md`
- `docs/adr/ADR-044-conteudo-workflow-personas-qa.md`
- `.opencode/plans/2026-07-05-plano-remediacao-conteudo.md`
