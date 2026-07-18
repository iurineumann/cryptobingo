# ADR-057 — Recovery Layer Independente de Mensageria

- Status: Adotado (implementado na Fase B — B3, 2026-07-18)
- Data: 2026-07-18
- Tags: Arquitetura, Event-Driven, Resilience, Worker
- Corrige/estende: plano v7 (Fase B), grill-v6 (FC2/FM1)
- Issue: Fase B (B3)

## Contexto

A re-arquitetura event-driven (plano v7) introduziu o **State Watcher** (B1): um stream Firehose/Hyperion que consome ações on-chain do `bingogamectr` e publica `game:state_changed` na fila `game_loop_events`. Os handlers RabbitMQ consomem esses eventos e executam `startdraw`/`lockgame`/`fundgame`/`claimwin`/`refund` etc.

A grill-v6 (FC2/FM1) levantou uma questão crítica: **se o State Watcher (ou a fila) cair, o jogo fica travado para sempre?** A resposta é NÃO — desde que mantenhamos uma camada de recovery independente da mensageria.

A grill-v6 também alertou (FM1) que remover o polling de `startdraw` (ou qualquer recovery) ANTES de ter o State Watcher operando em produção criaria um **deadlock**: jogos em `locked` nunca iniciariam o draw se o evento não chegasse.

## Decisão

Manter o **Recovery Layer** como componente PERMANENTE e INDEPENDENTE da mensageria event-driven:

1. `autoClaimDrawnGames` — reivindica jogos em `drawing` cujo `drawn_at` expirou (não houve `receiverand`).
2. `recoverStuckGames` — recupera jogos em estados inconsistentes (`locked` sem draw, `drawing` sem `drawn`).
3. `recoverPayoutGames` — refaz pagamentos de jogos `drawn` que não completaram o payout.

Esses three cron jobs (herdados da arquitetura pré-event-driven) NÃO são removidos. O State Watcher + handlers são a **rota feliz** (latência sub-segundo); o Recovery Layer é o **safety-net** (latência de minutos, por cron).

Além disso, a Fase B (B2/B3) estabeleceu:
- O handler `startdraw` republica `startdraw` na fila e, **se a publicação falhar**, executa `executeStartDraw` DIRETO (fallback). Isso garante que o draw aconteça mesmo se a fila estiver indisponível.
- `autoLockFundingGames` já era backup (publica `lockgame`; se falhar, lock direto).

**Princípio:** a arquitetura event-driven é a rota primária; o recovery direto (cron + fallback no handler) é a garantia de que nenhum jogo trava. Nunca remova o recovery sem validação em testnet do State Watcher operando 100%.

## Consequências

### Positivas
- Jogo NUNCA trava por indisponibilidade de mensageria (Firehose cai → recovery assume em minutos).
- Estado do contrato é fonte-de-verdade única; recovery apenas reconcilia o worker com o contrato.
- Deploy do State Watcher é incremental/sem risco: se ele falhar, o recovery cobre.

### Negativas / trade-offs
- Dupla execução possível (evento chega E recovery dispara) — mitigada por idempotência do contrato WAX (`executeStartDraw` falha se já `drawing`) + `processedGames` Map com TTL no worker.
- Custo de computação dos cron jobs (mínimo; rodam em intervalos de minutos).

## Verificação
1. State Watcher desligado → jogos ainda avançam via Recovery Layer (testado em B3).
2. Handler `startdraw` com fila indisponível → `executeStartDraw` direto (fallback) executa.
3. `recoverStuckGames` recupera jogo `locked` sem draw (cron).

## Referências
- plano v7 (Fase B, seção B3): `agent://plans/2026-07-17-engine-event-driven-plan-v7`
- grill-v6 (FC2/FM1): `agent://grill/2026-07-17-engine-event-driven-grill-v6`
- `apps/worker-game-loop/src/services/rabbitmq.ts` — `autoClaimDrawnGames` (1064), `recoverStuckGames` (1196), `recoverPayoutGames`, `autoLockFundingGames` (973), `processLockedGame` (1168, fallback direto).
- `apps/worker-game-loop/src/services/stateWatcher.ts` — State Watcher (B1).
