# Core Memory — CryptoBingo

## Domain Invariants
- RTP 85% / GGR 15%
- max_weight: por cartela paga-se o maior peso entre padrões/combinações/stages
- FREE SPACE = bit 12 do bitmask 5×5 (sempre setado)
- Pesos são hundredths (100 = 1.00×; máx 25500 = 255×)
- combo_id = índice canônico alinhado Mongo ↔ chain

## Contrato C++
- ABI é MANTIDO À MÃO em contracts/bingo/bingo.abi
- NUNCA confiar no bingo_generated.abi (cdt-cpp gera incompleto/instável)
- Adicionar structs/tabelas/actions manualmente no .abi
- Migração de tabela: eosio::binary_extension<T> no .hpp + tipo T[]$ (sufixo $) no ABI
- Modelo de auth (ADR-026): bingogamectr@active (cold key) / @admin (threshold) / bingogamesvc@active (FSM)
- Serviços usam MICROSERVICE_PRIVATE_KEY, não CONTRACT_PRIVATE_KEY

## Landing Page
- SSG com React Router v7 (sem SSR)
- i18n: react-i18next (UI) + TinaCMS (content legal)
- 3 locales: en (default), pt, zh
- SWA 301 / → /en para crawlers
- CSP headers configurados em staticwebapp.config.json
- 5 collections TinaCMS: page, blog, faq, tutorial, settings
- Content dir é submodule: github.com/iurineumann/cryptobingo-tina.git
- Bundle ~317KB — precisa audit (lucide-react + tinacms)
- Impeccable audit: 4 absolute bans violados (identical card grids, zero imagery, stats errados, mobile overflow)
- 3 a11y críticos (skip-link, focus trap, aria-live)
- 8 personas, 6 fases de melhoria, 34 tasks — plano em .opencode/plans/2026-07-04-landing-page-refinado.md
- Fase 0 prioritária: medir antes de mudar (GA4 baseline, Lighthouse, bundle)

## MCP-RAG
- 5 tools: rag_index, rag_search, rag_stats, rag_search_batch, rag_index_text
- Store: sqlite-vec (tabela virtual vec0, cosine distance, WAL mode)
- Embedder: Ollama nomic-embed-text via GPU (RTX 3050, 768d) primário, @xenova/transformers fallback
- 348 chunks indexados (ADR, plans, setup, context, journal, audits)
- RAG como memória persistente de agents: agent outputs → rag_index_text(payload, path: "agent://nome/data", tags: ["agent-output", escopo])
- Rag_search_batch: 2-8 queries simultâneas com dedup automático
- Rag_index_text: indexa texto arbitrário com tags + path virtual

## Stack & Tools
- MCP servers registrados: mcp-rag, sonarqube, google-marketing-stack
- Skills: impeccable (brand+product register), frontend-feature, modern-typescript, wax-contract, harness-e2e, worker-game-resolution, api-endpoint, e2e-ui-cypress, weights-calibration
- Tools avaliadas: MCP-RAG 8.6/10, impeccable 8.7/10 (MAIS valiosa), gh CLI 7.3/10

## Metodologia
- TDD obrigatório (RED→GREEN→refactor) para toda implementação
- SonarQube antes de cada commit
- PT-BR em código/comentários/commits
- ADR-driven: decisão estrutural → ADR em docs/adr/
- Git flow: feature/<slug> → develop → master
- Skills por camada — OBRIGATÓRIO invocar skill antes de tocar camada (ex.: impeccable antes de UI)
- Compaction mitigation via CB-ContextOS
- WORKFLOW.md universal: 6 fases (Contexto → Pesquisa → Síntese → Skill Check → Implementação → Encerramento)
- RAG como memória persistente de agents: indexar output via rag_index_text antes de descartar
- Personas atuais: 8 (Casual Gamer, Crypto Native, Content Creator, Serious Gambler, Community Builder, Token Holder, Investor, Curious Newcomer)

## Infraestrutura
- Landing page: Azure Static Web Apps (Consumption, westus2)
- API: Azure Function App (cryptobingo-landing-api, Consumption, westus2)
- PostgreSQL: Aiven free tier (Frankfurt)
- Domínio: landing-api.cryptobingo.bet (Cloudflare proxy)
- Container dev: bingo_waxdev (cdt-cpp compilação)
- Oracle: orng.wax + orng-oracle.ts daemon
- MongoDB: localhost:27017/cryptobingo_edge
