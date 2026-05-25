# TODO.md — Tarefas Imediatas e Dívidas Técnicas

## [DONE] Sprint de Hardening (2026-05-24 / 25)
[DONE] Corrigir divergência de tipos em shared-types — espelho fiel do bingo.abi (Hardening-1).
[DONE] Implementar motor de Bitmasking O(1) no evaluator.ts conforme SPEC.md §3.3 e ADR-004 (Hardening-2).
[DONE] Conectar pipeline claimwin: rabbitmq → evaluator → blockchain, com NACK correto e reconexão automática (Hardening-3).
[DONE] Eliminar chave privada hardcoded do bundle frontend — import dinâmico + guard DEV (Hardening-5).
[DONE] Implementar autenticação JWT com challenge criptográfico no api-gateway — ADR-006 (Hardening-4).
[DONE] Implementar bingo.hpp completo (Smart Contract) conforme SPEC.md e ADR-001.

## [DONE] Auditoria e Governança (2026-05-25)
[DONE] ADR-004 e ADR-005 originais enriquecidos com detalhes de implementação desta sprint.
[DONE] ADR-006 criado para JWT auth (ADR-003 já ocupado pelo Oracle/RNG).
[DONE] ADRs duplicados depreciados com redirecionamento para os originais.
[DONE] openapi.yaml reescrito na v1.1.0 com endpoints reais e schemas corretos.
[DONE] TASKS.md, EPICS.md e TRACE.md sincronizados com estado real do projeto.

## [DONE] Sprint Épico 2 — ticketController (2026-05-25)
[DONE] ticketController.ts criado — geração Fisher-Yates por coluna BINGO, hash SHA-256 contextual, assinatura ECDSA Antelope, dedupe Redis SET NX (ADR-001, SPEC.md §3.1).
[DONE] database/redis.ts criado — cliente redis@4, reconnect automático, fail-open controlado.
[DONE] index.ts atualizado — rota POST /api/v1/games/:gameId/tickets/generate registrada com requireAuth.
[DONE] package.json api-gateway atualizado — redis@^4.6.0 e @cryptobingo/blockchain-core adicionados.
[DONE] openapi.yaml v1.2.0 — endpoint /games/{gameId}/tickets/generate + schemas GenerateTicketsResponse e SignedTicket.
[DONE] docker-compose.yml atualizado — serviço redis:7-alpine com healthcheck, maxmemory 256mb, volume redis_data.

## [DEBT] Dívidas Técnicas Ativas
[DEBT] fsm.test.ts Passo 6: win_pattern_mask hardcoded (UInt64.from(1)) — importar WIN_PATTERNS do evaluator.
[DEBT] authController.ts: verificação on-chain da public_key contra permissão active comentada — ativar em produção.
[DEBT] profileController.ts: validação de body expansível com zod/joi.
[DEBT] rabbitmq.ts: Dead Letter Queue (DLQ) não configurada — retentativas ilimitadas em erro permanente.
[DEBT] ADR-004 Fase 2: tabelas patterns/gametypes on-chain não implementadas no bingo.hpp.
[DEBT] ADR-005 Fase 2: fórmula max_weight payout não implementada no claimwin.
[DEBT] ADR-005: auto-sweep de GGR para tesouraria não implementado.
[DEBT] ADR-006: blacklist de tokens JWT revogados via Redis não implementada.
[DEBT] ADR-004-bitmasking-motor-resolucao.md e ADR-005-fixed-odds-treasury-rtp-ggr.md: arquivos depreciados — deletar fisicamente quando possível.
[DEBT] ticketController.ts: sem rate limiting por usuário/game — adicionar junto ao Helmet/CORS restrito.

## [NEXT] Próximas Tarefas (Épico 4 — Frontend) ← PRIORIDADE ATUAL
[ ] Integrar compra de cartela: chamar POST /games/:gameId/tickets/generate e empacotar buytickets() via Wharfkit.
[ ] Renderizar cartelas 5x5 visualmente no dashboard do jogador (componente TicketGrid).
[ ] Animação de Slow Reveal via WebSocket com reconciliação por Sequence ID.

## [NEXT] Próximas Tarefas (Épico 3 — Worker)
[ ] Configurar Dead Letter Queue (DLQ) no RabbitMQ.
[ ] Métricas Prometheus: eventos processados, latência, erros por ação.
[ ] WebSocket Broadcaster para Slow Reveal (3s/bola, Sequence ID).

## [NEXT] Próximas Tarefas (Épico 2 — API Gateway)
[ ] Implementar rotas CRUD /admin/patterns e /admin/gametypes.
[ ] Rate limiting + Helmet + CORS restrito nas rotas do api-gateway.
[ ] Motor de Simulação Monte Carlo (/api/v1/admin/simulate-weights).
