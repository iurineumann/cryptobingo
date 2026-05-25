# Backlog do Projeto CryptoBingo

> Fonte de verdade do backlog. Sincronizado com `docs/governance/EPICS.md` e `TRACE.md`.
> Status: [x] Done | [ ] Pendente | [~] Em progresso

## Épico 1: Core de Blockchain & Tokenomics
- [x] Refatoração do contrato C++ (Assinaturas ECDSA e Oráculos RNG).
- [x] Lançamento de Token Dedicado (`bingo.token`) simulando Mainnet.
- [x] Validação de Utility NFTs via cruzamento com AtomicAssets (`nftconfigs`).
- [x] ADR-004 e ADR-005 definidos: Regras de Bitmasking e Fixed-Odds Treasury aprovadas.
- [ ] Implementar as novas tabelas `patterns` e `gametypes` on-chain (Bitmasking dinâmico — ADR-004).
- [ ] Refatorar a ação `claimwin` para utilizar a regra `max_weight` (ADR-005).
- [ ] Implementar contrato isolado `bingo.swap` (DEX) baseado em rácio constante (x*y=k).
- [ ] Contratos Ricardianos completos para todas as ações.

## Épico 2: API Gateway & Infraestrutura Off-Chain
- [x] API Gateway Express com rotas de health e profile.
- [x] Conexão poliglota (MongoDB + PostgreSQL).
- [x] Divergência de tipos em `shared-types` corrigida — espelho fiel do bingo.abi.
- [x] Autenticação JWT com desafio criptográfico (ADR-006): /auth/challenge + /auth/verify.
- [x] Middleware `requireAuth` protegendo rotas de perfil.
- [x] Controllers de perfil sem mocks — wallet lido exclusivamente do JWT.
- [x] Tabela `auth_nonces` PostgreSQL criada via `ensureNonceTable()`.
- [x] `openapi.yaml` v1.2.0 — endpoint /games/{gameId}/tickets/generate + schemas SignedTicket.
- [x] ADR-006 criado documentando fluxo de auth por assinatura de carteira.
- [x] `ticketController.ts` implementado — geração Fisher-Yates + assinatura ECDSA + dedupe Redis.
- [x] `database/redis.ts` criado — cliente Redis com reconnect automático e fail-open controlado.
- [x] `docker-compose.yml` atualizado — serviço Redis 7-alpine com healthcheck e volume persistente.
- [ ] Rotas CRUD administrativas (`/admin/patterns`, `/admin/gametypes`).
- [ ] Motor de Simulação Monte Carlo (`/api/v1/admin/simulate-weights` — ADR-005).
- [ ] Rate limiting, proteção DDoS, Helmet, CORS restrito.
- [ ] Indexador blockchain (State History Plugin → PostgreSQL).
- [ ] Servidor WebSocket para Slow Reveal e chat (AsyncAPI spec).

## Épico 3: Game Loop Worker & Motor de Resolução
- [x] Conexão RabbitMQ com reconexão automática (`at-least-once delivery`).
- [x] Transações on-chain: `lockgame`, `startdraw`, `claimwin`.
- [x] Motor de Bitmasking O(1) com 12 padrões pré-compilados (ADR-004).
- [x] Varredura paginada de tickets (`findAllWinners` — 100 tickets/página).
- [x] Pipeline completo conectado: `claimwin` RabbitMQ → evaluator → blockchain.
- [x] NACK sem requeue para mensagens malformadas; NACK com requeue para erros transitórios.
- [x] Handlers de reconexão automática no RabbitMQ.
- [x] `executeClaimWin` com `ball_count` e `win_pattern_mask` conforme ABI.
- [ ] Dead Letter Queue (DLQ) para limite de retentativas no RabbitMQ.
- [ ] Métricas Prometheus (eventos processados, latência, erros por ação).
- [ ] **[PRÓXIMO C]** WebSocket Broadcaster para Slow Reveal (3s por bola, Sequence ID).
- [ ] Suporte a múltiplos padrões dinâmicos via `patterns`/`gametypes` (ADR-004 Fase 2).

## Épico 4: Frontend & Experiência Web3
- [x] Integração WharfKit (Anchor e Cloud Wallet).
- [x] Lobby lendo informações diretamente das tabelas on-chain.
- [x] Internacionalização (i18n) com suporte a pt-BR, en-US, zh-CN.
- [x] Chave privada de dev removida do bundle — import dinâmico com guard `import.meta.env.DEV`.
- [x] Variáveis `VITE_DEV_ACTOR` e `VITE_DEV_PRIVATE_KEY` isoladas no `.env` local.
- [x] **`useAuth.ts`** — fluxo challenge-response JWT integrado ao login Web3.
- [x] **`useTicketPurchase.ts`** — geração de cartelas no backend + buytickets() on-chain.
- [x] **`TicketGrid.tsx`** — componente visual da cartela 5x5 com FREE SPACE e marcação de bolas.
- [x] **`BuyTicketModal.tsx`** — modal de compra com seletor de quantidade e exibição pós-compra.
- [x] **`Lobby.tsx`** reescrito — scope corrigido, ExtendedAsset renderizado, BuyTicketModal integrado.
- [x] **`App.tsx`** reescrito — fluxo JWT integrado, bugs de auth corrigidos.
- [x] **`api.ts`** reescrito — gestão JWT, wallet via token (não query param), funções tipadas.
- [x] **`wharfkit.ts`** corrigido — WalletPluginPrivateKey removido do bundle de produção.
- [ ] **[PRÓXIMO C]** Slow Reveal: animação das bolas via WebSocket com Sequence ID.
- [ ] Painel Administrativo React: UI interativa 5x5 para criação de Padrões.
- [ ] Seletor de moeda e saldo em tempo real.
- [ ] PWA (Progressive Web App) para mobile (Lighthouse > 90).

## Épico 5: Documentação e Especificações (Spec-Driven)
- [x] ADR-001 a ADR-006 criados e documentados.
- [x] `openapi.yaml` v1.2.0 — todos os endpoints implementados especificados.
- [x] `shared-types` sincronizado com o ABI real do bingo.hpp.
- [x] ADRs duplicados depreciados com redirecionamento explícito.
- [ ] Atualizar `openapi.yaml` com novas rotas administrativas (`/admin/patterns`, `/admin/gametypes`).
- [ ] **[PRÓXIMO C]** Criar ADR-007: Slow Reveal — Broadcaster WebSocket e Sequence ID.
- [ ] Criar ADR-008: Indexador de State History (blockchain → PostgreSQL).
- [ ] Contratos Ricardianos completos para cada ação do smart contract.
