# EPICS.md — Épicos do CryptoBingo

> Estrutura de épicos que organiza o desenvolvimento da plataforma.
> Regido pelo MASTER-PROMPT.md (Production-First, SDD, CQRS, EDA).
> Última auditoria: 2026-06-11

---

## Épico 1: Core Blockchain & Tokenomics

**Objetivo:** Contrato inteligente bingogamectr completo, autossuficiente e auditável.

### Features
- [x] Contrato C++ com FSM (`funding → locked → drawing → drawn → archived → aborted`)
- [x] Assinatura ECDSA contextual anti-replay (ADR-001)
- [x] Ledger interno multimoeda (`balances` por usuário)
- [x] Validação de NFTs utilitários via AtomicAssets (`nftconfigs`)
- [x] Mock do oráculo WAX (`orng_mock`) para ambiente local
- [x] Tabelas `patterns` e `gametypes` on-chain — Bitmasking dinâmico (ADR-004)
- [x] `claimwin` com regra `max_weight` — Ticket Price × Multiplier × Weight/100 (ADR-005)
- [x] `sweepggr` + `settreasury` — GGR pool on-chain (ADR-005 Fase 4)
- [x] Tabela `rooms` on-chain — salas persistentes com scheduling (ADR-010)
- [x] Drop Vault — `dropdeposits` / `dropallocs` / `dropstate` + actions `allocatedrop`/`execdrop`/`reclaimasset` (ADR-011)
- [x] Draw modes: `standard` / `fixed` / `firstfull` / `goldenball` / `multimatch` (ADR-012/013)
- [x] Combinações on-chain (`combinations` + `claimcombo`) com `binary_extension` (ADR-016)
- [x] Contrato `bingogameswp` — AMM DEX x·y=k, allowlist de tokens, `service_fee_bps` por pool (ADR-018/019)
- [x] Contratos Ricardianos completos para todas as actions
- [x] Contas WAX mainnet mapeadas: `bingogamectr` / `bingogametkn` / `bingogameswp` / `bingogamesvc` (ADR-023)

### Critérios de Sucesso
- [x] FSM 100% coverage no harness E2E (20/20 testes on-chain)
- [ ] Custo de CPU por `buytickets` abaixo de 5ms WAX (validar em mainnet)
- [ ] Garbage Collection automático pós-quarentena (24h) — `archivegame` automático

---

## Épico 2: API Gateway & Serviços Off-Chain

**Objetivo:** Microsserviços Node.js desacoplados, tipados e resilientes.

### Features
- [x] API Gateway Express com rotas de health e profile
- [x] Conexão poliglota (MongoDB + PostgreSQL + Redis)
- [x] Middleware JWT com desafio criptográfico (assinatura de carteira) — ADR-006
- [x] Geração assinada de cartelas via ECDSA (ADR-001)
- [x] Rotas CRUD administrativas (`/admin/patterns`, `/admin/gametypes`)
- [x] Motor de simulação Monte Carlo (`/admin/calibrate-weights`) — ADR-020
- [x] Rate limiting, Helmet, CORS restrito
- [x] Servidor WebSocket para Slow Reveal e chat (ADR-007)
- [x] Healthchecks para Kubernetes probes (`/health/live`, `/health/ready`)
- [x] `openapi.yaml v2.0` — 36+ endpoints documentados
- [x] `asyncapi.yaml v2.0` — canais game + room; todos os eventos
- [x] Rotas `/rooms/*`, `/vault/*`, `/swap/*`, `/player/winnings/*`, `/statistics/*`
- [x] Compliance Ledger PostgreSQL (games_history + transactions_ledger)
- [x] 171 testes Jest passando (api-gateway)

### Critérios de Sucesso
- [x] Rotas documentadas no `openapi.yaml` (Spec-Driven)
- [x] Tipos espelhados em `@cryptobingo/shared-types`
- [x] Testes de integração no `apps/harness`
- [ ] Indexador State History → PostgreSQL (para analytics avançado em produção)

---

## Épico 3: Game Loop Worker & Motor de Resolução

**Objetivo:** Worker autônomo que orquestra o ciclo de vida dos jogos.

### Features
- [x] Conexão RabbitMQ com reconexão automática (`at-least-once delivery` + DLQ)
- [x] Transações on-chain: `lockgame`, `startdraw`, `claimwin`, `closegame`
- [x] Motor de Bitmasking O(1) com padrões dinâmicos via `gametypes` on-chain (ADR-004)
- [x] Varredura paginada de tickets (`findAllWinners`, 100/página)
- [x] Pipeline completo: RabbitMQ → evaluator → blockchain
- [x] Draw modes: standard / fixed / firstfull / goldenball / multimatch (ADR-012/013)
- [x] Auto-avance automático: `autoLockFundingGames`, `autoStartLockedGames`, `autoClaimDrawnGames`
- [x] `dropWorker.ts` — 3 fases: Fase 0 (room chance), Fase 1A/1B (seleção NFT/token), Fase 2 (vencedor)
- [x] `patternCache.ts` — Redis TTL 1h, fail-open
- [x] Métricas Prometheus (8 métricas customizadas + defaults Node.js)
- [x] 118 testes Jest passando (worker-game-loop)

### Critérios de Sucesso
- [x] Latência < 200ms entre evento RabbitMQ e transação blockchain
- [x] Zero perda de mensagens (DLQ + NACK sem requeue para falhas permanentes)
- [x] Cobertura de testes do evaluator (34 testes `evaluator.payout.test.ts`)

---

## Épico 4: Frontend & Experiência Web3

**Objetivo:** Interface React rápida, internacionalizada e com UX de Web2.

### Features
- [x] Autenticação WharfKit (Anchor + Cloud Wallet)
- [x] Lobby com salas ao vivo, tickets vendidos, status slow-reveal, countdown
- [x] i18n pt-BR / en-US / zh-CN com persistência no MongoDB
- [x] Compra de cartelas com payload assinado + checkout multi-moeda via `bingogameswp` (ADR-021)
- [x] `GameRoom.tsx` — sala ao vivo completa, slow reveal, padrões, chat, navbar
- [x] `ReplayRoom.tsx` — replay com slow reveal simulado, TicketCard, padrões, banners
- [x] Painel Admin completo (Dashboard, Patterns, Gametypes, Sponsors, Compliance, Users, Vault, NFTs, Tokens, Rooms)
- [x] Painel Sponsor (`/sponsor/rooms`, `/sponsor/vault`)
- [x] `MyHistoryPage.tsx` — histórico pessoal com ROI%, win rate, stats globais
- [x] `RoomHistoryPanel.tsx` — histórico público de sala (visitantes sem auth)
- [x] `LandingPage.tsx` — pública, stats live de salas, botão Histórico
- [x] PWA (manifest + service worker + Workbox cache-first)
- [x] 89 testes Vitest passando (frontend)
- [x] App swap DEX público `apps/swap-ui` — SwapPage / PoolPage / AnalyticsPage (ADR-022)

### Critérios de Sucesso
- [x] PWA configurada
- [x] Slow Reveal funcional
- [ ] Lighthouse Performance > 90 (validar em produção)
- [ ] Suporte a Ledger Hardware Wallet via Anchor

---

## Épico 5: Infraestrutura, Compliance & Produção

**Objetivo:** Ambiente pronto para produção com observabilidade, segurança e conformidade legal.

### Features
- [x] Docker Compose (PostgreSQL, MongoDB, RabbitMQ, Redis, Prometheus, Grafana, cAdvisor)
- [x] Documentação de conformidade (Lei 14.790/2023, LGPD)
- [x] Contratos Ricardianos com cláusulas legais
- [x] CI/CD — `.github/workflows/ci.yml` (unit + frontend + E2E DUNE manual)
- [x] K8s hardening — namespace, secrets, configmap, RBAC, NetworkPolicies, securityContext, HPA, PDB, Ingress TLS, ServiceMonitor Prometheus (overlays dev/prod via Kustomize)
- [x] Testes de carga k6 (`tests/k6/smoke.js` + `tests/k6/load.js`)
- [x] E2E de UI (Cypress, ADR-017) — 112 testes Tier 1 (PR-gate) + 21 Tier 2 (nightly)
- [x] E2E on-chain (Harness) — 20/20 testes FSM + swap Suite 9 contra nodeos real
- [ ] Ambiente de staging espelhando produção
- [ ] KYC on-chain via provedor terceiro
- [ ] Monitoramento de RAM do contrato WAX
- [ ] Auditoria de segurança terceirizada
- [ ] Playbook de Disaster Recovery (rollback, refund automático)

### Critérios de Sucesso
- [ ] 99.9% uptime dos microsserviços (validar em staging)
- [ ] Auditoria externa aprovada
- [ ] Testes de carga com 50.000 conexões simultâneas (k6 load test em staging)

---

## Épico 6: DEX & Economia de Token (concluído)

**Objetivo:** Liquidez nativa para BINGO e integração do swap no fluxo de jogo.

### Features
- [x] Contrato `bingogameswp` — AMM x·y=k, 6 actions, allowlist, fee por pool (ADR-018/019)
- [x] API Gateway — endpoints `/swap/pools` e `/swap/quote` (cotação reversa)
- [x] Checkout multi-moeda no `BuyTicketModal` — 3-action atomic tx on-chain (ADR-021)
- [x] App React DEX público `apps/swap-ui` — SwapPage / PoolPage / AnalyticsPage (ADR-022)
- [x] Motor de calibração Monte Carlo — RTP 85% / GGR 15% validado (ADR-020)

---

## Próximos Épicos (Roadmap)

- **Épico 7 — Rankings & Conteúdo:** leaderboard público, FAQ, notícias/promos
- **Épico 8 — NFT Fee Discounts:** descontos por NFT no `bingogameswp` (ADR-019 Phase 2)
- **Épico 9 — Produção Mainnet:** staging, auditoria externa, DR playbook, RAM monitoring
