# TRACE.md: Registro de Atividades

- **2026-05-20**: Inicialização do protocolo de engenharia.
- **2026-05-20**: Estrutura de diretórios e arquivos de especificação (SPEC, ADR, COMPLIANCE) criados.
- **2026-05-20**: Definição do ENGINEERING_PROTOCOL.md como regra global.
- **2026-05-20**: (T01) Implementação da action `buytickets` no `bingo.cpp`.
- **2026-05-20**: (T02) Implementação corrigida de `lockgame` e `claimwin` no `bingo.cpp`.
- **2026-05-20**: (T03) Criação do mock `orng_mock` para simulação determinística do oráculo WAX.
- **2026-05-21**: (T04) Aprimoramento do script de bootstrap.ts.
- **2026-05-21**: (T05) Criação do `fsm.test.ts` com fluxo completo de compra e bloqueio.
- **2026-05-24**: (Hardening-1) Correção de divergência de tipos em `shared-types/index.ts`.
- **2026-05-24**: (Hardening-2) Motor de Bitmasking O(1) no `evaluator.ts` (ADR-004).
- **2026-05-24**: (Hardening-3) Pipeline claimwin RabbitMQ → evaluator → blockchain (ADR-005).
- **2026-05-24**: (Hardening-5) Chave privada removida do bundle frontend (import dinâmico + guard DEV).
- **2026-05-25**: (Hardening-4) JWT auth com challenge criptográfico no api-gateway (ADR-006).
- **2026-05-25**: (Auditoria-Geral) Revisão de consistência SPEC vs. código vs. governança. openapi.yaml v1.1.0.
- **2026-05-25**: (Épico2-TicketGen) ticketController.ts + database/redis.ts + docker-compose Redis + openapi.yaml v1.2.0.
- **2026-05-25**: (Épico4-Frontend) Reescrita completa: api.ts (JWT), useAuth.ts, useTicketPurchase.ts, TicketGrid.tsx, BuyTicketModal.tsx, Lobby.tsx, App.tsx, wharfkit.ts, vite.config.ts.
- **2026-05-25**: (Épico3-Broadcaster) ADR-007, broadcaster.ts (Socket.io + auth JWT + Slow Reveal + reconciliação), rabbitmq.ts (triggers WS), worker index.ts atualizado, frontend: useSlowReveal.ts, types/events.ts, BallDisplay.tsx, Lobby.tsx atualizado, frontend package.json + vite.config.ts (proxy /socket.io).
- **2026-05-25**: (Épico3-DLQ+Metrics) Dead Letter Queue (DLX+DLQ via x-dead-letter-exchange, guard x-death.count >= MAX_RETRIES), métricas Prometheus via prom-client (metrics.ts: 8 métricas customizadas + default Node.js), rabbitmq.ts instrumentado com counters/histograms, broadcaster.ts instrumentado com gauges, index.ts bootstrap com startMetricsServer(), prometheus.yml job worker_game_loop, Grafana provisionado automaticamente (datasource + dashboard worker-game-loop.json com 9 painéis), docker-compose.yml: extra_hosts no Prometheus e Grafana, volumes de provisioning do Grafana montados.
