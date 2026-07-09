# ADR-047 — Recuperação de salas travadas por CPU budget exaurido (testnet)

- Status: Aceito
- Data: 2026-07-09
- Tags: Infrastructure, Operations, Blockchain, Observability

## Contexto

O lobby (`/api/v1/rooms`) listava 4 salas com `status: "active"`, mas
TODOS os `current_game_id` apontavam para jogos travados em fases
iniciais (`created` / `locked` / `funding` / `drawing`) com `total_wagered = 0`.
Para o jogador o lobby parecia "errático": a sala existe, mas nenhum
jogo chega a `paying`/`claimed` — o ciclo nunca completa.

Causa raiz (confirmada via `az containerapp logs show` + `get_table_rows`
on-chain): a conta de microserviço **`bingogamesvc`** tinha o **CPU budget
exaurido** — `maximum billable CPU time` da conta em ~207us. Toda ação
FSM assinada por `bingogamesvc@active` (`fundgame` / `lockgame` /
`startdraw` / `claimwin` / `closegame` / `abortgame`) falhava com:

```
billed CPU time (XXX us) is greater than the maximum billable CPU time
for the transaction (YYY us) reached account cpu limit
```

O backoff exponencial (ADR-024 / PR #224) JÁ estava deployado e funcionava
(retries espaçados 15–30s, não rajada a cada 1s), mas o budget absoluto
da conta era ~0 — o backoff esperava, retomava, e falhava de novo. Loop
infinito de recovery sem progresso.

Ainda: `recoverCreatedGame` (roomManager.ts) usa `fundRetryMap` em
memória com `FUND_RETRY_MAX = 6`. Após 6 falhas pré-top-up, o Room 1
(`created`) entrou em branch de abort; com o mapa travado em `count >= 6`
ele nunca mais tentava `fundgame` nem abortava com sucesso — estado de limbo
só resolúvel com **restart do Container App** (que zera o mapa).

## Decisão

A recuperação é **infra**, não código. Sequência aplicada (testnet, baixo risco):

1. `delegatebw` self-stake de **+100 WAX** CPU em `bingogamesvc`
   (insuficiente — limit subiu ~207→274us, mas `startdraw` custa ~570us).
2. `delegatebw` self-stake de **+500 WAX** CPU (NET=0) em `bingogamesvc`
   → limit passou de 600us → `abortgame`/`fundgame` passaram → o worker
   abortou os jogos travados (`NO_TICKETS` / `NO_TICKETS_DRAWING`) e recriou
   os próximos via `ensureFirstGameForActiveRooms`.
3. `az containerapp revision restart -n worker-game-loop -g cryptobingo-testnet
   --revision <rev>` → zerou `fundRetryMap` → Room 1 (`created`, count=6)
   finalmente recuperou (`Game 1783613463861 fundado com sucesso!`).

Comando (via `docker exec bingo_waxdev cleos -u https://waxtestnet.greymass.com`,
chave `bingogamesvc@active` do RAG `agent://testnet-keys/2026-07-09`):

```bash
cleos -u https://waxtestnet.greymass.com system delegatebw \
  bingogamesvc bingogamesvc "500.0000 WAX" "0.0000 WAX" \
  -p bingogamesvc@active
```

## Consequências

### Positivas
- Salas voltaram a ciclar (todas com `current_game_id` novo em loop normal).
- Backoff #224 confirmado funcional — só precisava de budget de CPU.
- Recuperação 100% via infra, sem rebuild/deploy de código.

### Negativas / Riscos
- Testnet WAX tem CPU budget minúsculo (centenas de us). Um único
  `startdraw` (~570us) consome quase o limite inteiro.
- `fundRetryMap` em memória é **volátil**: após 6 falhas o jogo entra em
  limbo que só sai com restart do Container App.
- Sem alerta de CPU budget baixo, o próximo storm (ou picos de
  `recoverStuckGames` + auto-advance) pode exaurir de novo silenciosamente.

### Ações de seguimento (recomendadas)
- **Auto-top-up / alerta**: monitorar `cpu_limit.available` de `bingogamesvc`
  (App Insights / Grafana) e disparar `delegatebw` automático abaixo de
  ~2.000us, OU alertar no canal antes de zerar.
- **Persistir `fundRetryMap`** (Redis) para não depender de restart do
  Container App na recuperação de `created`.
- **Idempotência de abort em `created`**: `recoverCreatedGame` deve tentar
  `abortgame` (não só `fundgame`) quando `count >= FUND_RETRY_MAX`,
  para destravar sem restart.

## Referências
- Skill `cryptobingo-infra-ops` — Pitfall #13 (retry storm CPU) e #6 (jogos sem tickets).
- ADR-024 (backoff exponencial worker).
- PR #224 (backoff em startdraw/abortgame/creategame).
- Issue #234 (post-mortem desta incidente).
- Chaves testnet: RAG `agent://testnet-keys/2026-07-09`.
