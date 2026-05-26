# Backlog do Projeto CryptoBingo

> Fonte de verdade do backlog. Sincronizado com `TRACE.md`.
> Status: [x] Done | [ ] Pendente

## Épico 1: Core de Blockchain & Tokenomics
- [x] Contrato C++ completo (buytickets, lockgame, startdraw, claimwin, receiverand).
- [x] Token dedicado `bingo.token`, Utility NFT via `nftconfigs`.
- [x] ADR-001 a ADR-005 definidos e implementados.
- [ ] Tabelas `patterns` e `gametypes` on-chain (ADR-004 Fase 2).
- [ ] Fórmula `max_weight` no claimwin (ADR-005 Fase 2).
- [ ] Contrato `bingo.swap` (DEX x*y=k).
- [ ] Contratos Ricardianos completos.

## Épico 2: API Gateway & Infraestrutura Off-Chain
- [x] Express + MongoDB + PostgreSQL + Redis.
- [x] Auth JWT challenge-response (ADR-006).
- [x] `ticketController.ts` — geração Fisher-Yates + ECDSA + dedupe Redis.
- [x] `openapi.yaml` v1.2.0.
- [x] Docker Compose com Redis, RabbitMQ, PostgreSQL, MongoDB, Prometheus, Grafana.
- [ ] Rotas `/admin/patterns` e `/admin/gametypes`.
- [ ] Rate limiting + Helmet + CORS restrito.
- [ ] Motor de Simulação Monte Carlo.
- [ ] Indexador blockchain (State History → PostgreSQL).

## Épico 3: Game Loop Worker & Motor de Resolução
- [x] RabbitMQ consumidor resiliente (at-least-once delivery).
- [x] `lockgame`, `startdraw`, `claimwin` on-chain.
- [x] Motor de Bitmasking O(1) com 12 padrões (ADR-004).
- [x] Varredura paginada de tickets (100/página).
- [x] Pipeline claimwin completo → evaluator → blockchain.
- [x] **Dead Letter Queue** — DLX + DLQ + guard `x-death.count >= MAX_RETRIES`.
- [x] **Métricas Prometheus** — `metrics.ts` com 8 métricas customizadas + Node.js defaults.
- [x] **WebSocket Broadcaster** — Socket.io, auth JWT, rooms, Slow Reveal 3s/bola, reconciliação.
- [x] **Grafana** — dashboard provisionado automaticamente com 9 painéis.
- [ ] broadcaster.ts: instrumentação de métricas (pendente desbloqueio do arquivo no WSL).

## Épico 4: Frontend & Experiência Web3
- [x] Wharfkit (Anchor + Cloud Wallet).
- [x] Auth JWT integrado (useAuth.ts).
- [x] Compra de cartelas (useTicketPurchase.ts + BuyTicketModal.tsx).
- [x] Visualização de cartelas (TicketGrid.tsx).
- [x] Slow Reveal ao vivo (useSlowReveal.ts + BallDisplay.tsx).
- [x] Cartelas marcadas em tempo real conforme bolas são sorteadas.
- [ ] PWA (Lighthouse > 90).
- [ ] Painel Administrativo de padrões.

## Épico 5: Documentação
- [x] ADR-001 a ADR-007 criados e documentados.
- [x] `openapi.yaml` v1.2.0, `asyncapi.yaml` v1.0.0.
- [ ] ADR-008: Indexador de State History.
- [ ] Contratos Ricardianos completos.
