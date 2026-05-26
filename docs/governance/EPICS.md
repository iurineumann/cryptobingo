# EPICS.md — Épicos do CryptoBingo

> Estrutura de épicos que organiza o desenvolvimento da plataforma.
> Regido pelo MASTER-PROMPT.md (Production-First, SDD, CQRS, EDA).

---

## Épico 1: Core Blockchain & Tokenomics

**Objetivo:** Contrato inteligente bingo.game completo, autossuficiente e auditável.

### Features
- [x] Contrato C++ com FSM (`funding → locked → drawing → drawn → archived → aborted`)
- [x] Assinatura ECDSA contextual anti-replay (ADR-001)
- [x] Ledger interno multimoeda (`balances` por usuário)
- [x] Validação de NFTs utilitários via AtomicAssets (`nftconfigs`)
- [x] Mock do oráculo WAX (`orng_mock`) para ambiente local
- [ ] Tabelas `patterns` e `gametypes` on-chain (Bitmasking dinâmico — ADR-004)
- [ ] Refatorar `claimwin` para regra `max_weight` (Ticket Price × Game Multiplier × Pattern Weight — ADR-005)
- [ ] Implementar `bingo.swap` (DEX com razão constante x*y=k) para liquidez nativa
- [ ] Contrato Ricardiano completo para todas as ações

### Critérios de Sucesso
- FSM 100% coverage nos testes de integração
- Custo de CPU por `buytickets` abaixo de 5ms WAX
- Garbage Collection automático pós-quarentena (24h)

---

## Épico 2: API Gateway & Serviços Off-Chain

**Objetivo:** Microsserviços Node.js desacoplados, tipados e resilientes.

### Features
- [x] API Gateway Express com rotas de health e profile
- [x] Conexão poliglota (MongoDB + PostgreSQL)
- [x] Middleware JWT com desafio criptográfico (assinatura de carteira) — ADR-006
- [x] Endpoints `/auth/challenge` e `/auth/verify` implementados
- [x] Controllers de perfil sem mocks — wallet lido exclusivamente do JWT
- [x] Geracão assinada de cartelas via ECDSA (ADR-001)
- [ ] Rotas CRUD administrativas (`/admin/patterns`, `/admin/gametypes`)
- [ ] Motor de simulação Monte Carlo (`/api/v1/admin/simulate-weights`)
- [ ] Rate limiting, proteção DDoS, Helmet, CORS restrito
- [ ] Indexador blockchain (State History → PostgreSQL)
- [ ] Servidor WebSocket para Slow Reveal e chat
- [ ] Healthchecks para orquestração (Kubernetes probes)

### Critérios de Sucesso
- Rotas documentadas no `openapi.yaml` (Spec-Driven)
- Tipos espelhados em `@cryptobingo/shared-types`
- Testes de integração no `apps/harness`

---

## Épico 3: Game Loop Worker & Motor de Resolução

**Objetivo:** Worker autônomo que orquestra o ciclo de vida dos jogos.

### Features
- [x] Conexão RabbitMQ com reconexão automática (`at-least-once delivery`)
- [x] Transações on-chain: `lockgame`, `startdraw`, `claimwin`
- [x] Motor de Bitmasking O(1) com 12 padrões pré-compilados (ADR-004)
- [x] Varredura paginada de tickets (`findAllWinners`)
- [x] Pipeline completo conectado: `claimwin` RabbitMQ → evaluator → blockchain
- [x] NACK sem requeue para mensagens malformadas; NACK com requeue para erros transitórios
- [ ] Métricas Prometheus (eventos processados, latência, erros)
- [ ] WebSocket Broadcaster para Slow Reveal (3s por bola)
- [ ] Suporte a múltiplos padrões dinâmicos via `patterns`/`gametypes`

### Critérios de Sucesso
- Latência < 200ms entre evento RabbitMQ e transação blockchain
- Zero perda de mensagens em cenário de crash do worker
- Cobertura de testes unitários do evaluator

---

## Épico 4: Frontend & Experiência Web3

**Objetivo:** Interface React rápida, internacionalizada e com UX de Web2.

### Features
- [x] Autenticação WharfKit (Anchor, Cloud Wallet, Dev Key)
- [x] Lobby com leitura direta de tabelas on-chain
- [x] Internacionalização (pt-BR, en-US, zh-CN) com persistência no MongoDB
- [x] Tree-shaking seguro de chaves de desenvolvimento (import dinâmico + guard `import.meta.env.DEV`)
- [ ] Compra de cartelas com payload assinado pelo backend
- [ ] Renderização visual 5x5 das cartelas no dashboard
- [ ] Slow Reveal: animação das bolas via WebSocket
- [ ] Painel administrativo React para criação visual de padrões 5x5
- [ ] Seletor de moeda e saldo em tempo real
- [ ] PWA (Progressive Web App) para mobile

### Critérios de Sucesso
- Lighthouse Performance > 90
- Slow Reveal com latência < 200ms
- Suporte a 7+ idiomas

---

## Épico 5: Infraestrutura, Compliance & Produção

**Objetivo:** Ambiente pronto para produção com observabilidade, segurança e conformidade legal.

### Features
- [x] Docker Compose (PostgreSQL, MongoDB, RabbitMQ, Prometheus, Grafana, cAdvisor)
- [x] Documentação de conformidade (Lei 14.790/2023, LGPD)
- [x] Contratos Ricardianos com cláusulas legais
- [ ] CI/CD (GitHub Actions): lint → test → build → deploy
- [ ] Manifests Kubernetes (Helm charts)
- [ ] KYC on-chain via provedor terceiro
- [ ] Monitoramento de RAM do contrato (WAX)
- [ ] Auditoria de segurança terceirizada
- [ ] Playbook de Disaster Recovery (rollback, refund automático)
- [ ] Ambiente de staging espelhando produção

### Critérios de Sucesso
- 99.9% uptime dos microsserviços
- Auditoria externa aprovada
- Testes de carga com 50.000 conexões simultâneas
