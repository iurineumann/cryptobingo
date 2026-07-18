# ADR-059 — Pinax Firehose + Hyperion Fallback

- Status: Adotado (validado ponta-a-ponta 2026-07-17; implementado na Fase B — B0/B0.1, 2026-07-18)
- Data: 2026-07-18
- Tags: Infra, Event-Driven, Firehose, Hyperion, WAX
- Corrige/estende: plano v7 (Fase B, B0/B0.1), grill-v6
- Issue: Fase B (B0 — contractEventClient)

## Contexto

O State Watcher (B1) precisa consumir ações on-chain do `bingogamectr` em tempo real. A abordagem inicial (POC) era rodar um nodeos próprio com SHIP — que exigia RAM/infra significativa e não era viável no VPS Contabo (8GB).

A grill-v6 + research WAX (2026-07-17) validaram o **Pinax Firehose** como substituto: streaming gRPC de blocos completos (`sf.firehose.v2.Stream.Blocks`), com header `X-Api-Key`. Testado ponta-a-ponta em 2026-07-17:
- TLS OK em `waxtest.firehose.pinax.network:443` (testnet) e `wax.firehose.pinax.network:443` (mainnet).
- gRPC reflection ATIVA → `Stream.Blocks` / `Blocks` disponíveis.
- Stream de 50 blocos (25s) entregou **16 ações do `bingogamectr`** (abortgame, creategame, etc.) em tempo real.
- Formato rico: `jsonData` + `globalSequence` + forks (melhor que Hyperion `get_actions`).

O Hyperion (EOS Rio) é o **fallback** para RPC/estado quando o Firehose falha.

## Decisão

1. **Fonte primária**: Pinax Firehose WAX (gRPC) filtrando `act.account == 'bingogamectr'`, emitindo `game:state_changed`.
2. **Fallback**: Hyperion (`get_actions` / RPC) quando o Firehose está indisponível.
3. **Cliente** (`contractEventClient.ts`, B0): abstrai Firehose (gRPC `@grpc/grpc-js` + proto `sf.firehose.v2`) e Hyperion (REST). Reconexão automática + `onSourceChange` (Firehose↔Hyperion) para métricas.
4. **Credenciais**: `PINAX_KEY` (Firehose `X-Api-Key`) via env (`apps/worker-game-loop/.env`, documentado em `.env.example` da B0.1). **NUNCA commitar** — referenciar `agent://secrets/pinax-credentials-cryptobingo` (RAG, PRIVADO).
5. **Rotação**: o `PINAX_KEY` tem exp 2036 (JWT); renovar antes ou usar a API Key direta. Rotação via `contractEventClient` relendo env (sem restart do worker se possível).

**Por que Pinax e não nodeos SHIP próprio:** elimina a necessidade de infra própria (RAM/CPU do nodeos). O free tier do Pinax é generoso para testnet (tail em tempo real ~poucos blocos/s; $1.75 / 1M blocos mainnet).

**Por que Hyperion fallback:** cobre o caso de o Firehose (Pinax) ter outage — o worker continua consumindo via Hyperion (maior latência, mas disponível).

## Consequências

### Positivas
- Sem infra própria de nodeos (economia de RAM/CPU no VPS).
- Firehose entrega formato rico (forks, global_seq) — melhor para o State Watcher.
- Fallback Hyperion garante disponibilidade (2 fontes).
- Validado ponta-a-ponta (16 ações/25s confirmadas).

### Negativas / trade-offs
- Dependência de terceiro (Pinax) para o Firehose — mitigada pelo fallback Hyperion.
- Custo de egress do Pinax em mainnet (controlável com free tier + replay seletivo).
- Credencial `PINAX_KEY` deve ser rotacionada/segura (RAG PRIVADO, não commitar).

## Verificação
1. `contractEventClient` conecta Firehose testnet (grpcurl reflection OK).
2. State Watcher recebe eventos `bingogamectr` em tempo real (B1).
3. Firehose cai → `onSourceChange` para Hyperion → worker continua (B5 métricas `state_watcher_source_changes_total`).
4. `PINAX_KEY` ausente → erro claro (não crash silencioso).

## Referências
- Validação Firehose: `agent://research/2026-07-17-pinax-firehose-validated-cryptobingo`
- Pinax WAX testnet/mainnet: `agent://research/2026-07-17-pinax-wax-testnet-firehose-substreams`
- Credenciais (PRIVADO): `agent://secrets/pinax-credentials-cryptobingo` (NUNCA expor)
- `.env.example` (B0.1): `apps/worker-game-loop/.env.example`
- `packages/blockchain-core/src/contractEventClient.ts` — cliente Firehose/Hyperion (B0).
- `apps/worker-game-loop/src/services/stateWatcher.ts` — State Watcher (B1).
- `apps/worker-game-loop/src/services/metrics.ts` — `state_watcher_source_changes_total` (B5).
