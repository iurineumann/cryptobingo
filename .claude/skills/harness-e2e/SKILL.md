---
name: harness-e2e
description: >
  Como rodar e escrever testes E2E on-chain do CryptoBingo (apps/harness) contra o
  nodeos real + oracle daemon, e como operar o ambiente de dev local (init_dev_env,
  container bingo_waxdev, serviços). Use ao escrever/rodar harness, debugar 'drawing'
  travado, ou subir/verificar o ambiente WAX local (DevOps).
---

# Harness E2E + Dev Env

`@cryptobingo/harness` roda a FSM completa contra o **nodeos real** (`127.0.0.1:8888`) usando o
contrato `bingogamectr` deployado + o **oracle daemon** (necessário p/ `startdraw` → `drawn`).
Arquivo principal: `tests/fsm.test.ts` (suites por modo/feature). Runner: `node run-tests.js`
(pula se faltam env keys).

## Ambiente de dev local (DevOps)

- Subir/reset: **o usuário** roda `./init_dev_env.sh` (ou `--reset`). Não reinicie a chain por conta
  própria — o reset zera estado on-chain. Cria contas, deploya `bingogamectr`+`orng.wax`, inicia oracle.
- Serviços de apoio: `docker compose up -d` (Mongo, Redis, RabbitMQ, Postgres, Grafana...). Apps:
  `pnpm dev`. Container da chain/CDT: `bingo_waxdev`.
- Verificar saúde: `curl -s http://127.0.0.1:8888/v1/chain/get_info` (nodeos);
  `pgrep -f orng-oracle.ts` (oracle); reqs pendentes em `orng.wax/reqs` devem drenar a 0.

## Oracle daemon (gotcha importante)

`npx ts-node` FALHA no monorepo pnpm (exit 127); o ts-node padrão type-checa o script (Buffer/console
not found). Sempre rode com o binário hoisted + `--transpile-only`:
```bash
node_modules/.pnpm/node_modules/.bin/ts-node --transpile-only scripts/orng-oracle.ts
```
(O `init_dev_env.sh` já faz isso com `nohup` + health check.) Se um jogo fica preso em `drawing`, o
oracle morreu — religue-o.

## Rodar um suite (com oracle vivo durante o jest)

Processos de background morrem entre invocações isoladas — suba o oracle e o jest **no mesmo comando**:
```bash
set -a; . .waxdev.env; . apps/worker-game-loop/.env; set +a
export RPC_URL=http://127.0.0.1:8888
TSNODE=node_modules/.pnpm/node_modules/.bin/ts-node
$TSNODE --transpile-only scripts/orng-oracle.ts >> logs/orng-oracle.log 2>&1 & OPID=$!
sleep 4
( cd apps/harness && npx jest tests/fsm.test.ts -t '<Nome do Suite>' )
kill $OPID
```
Env keys: `.waxdev.env` (EOSIO_KEY, JOGADOR1_KEY, BINGO_GAME_KEY...) + worker `.env` (MICROSERVICE_KEY).

## SonarQube (obrigatório antes de cada commit)

- Rode `sonarqube_analyze_code_snippet` em cada `.ts`/`.tsx` modificado
- Corrija BLOCKER/CRITICAL/MAJOR — zero tolerância antes do commit
- MINOR aceitável com justificativa inline
- NOSONAR só com comentário explicando o motivo
- Varredura só após testes verdes

## Escrever um novo suite

Espelhe um `describe` existente (ex.: Standard/MULTI_MATCH/COMBINAÇÕES). Fluxo típico:
`addpattern`(idempotente, try/catch) → `addgametype` (+ `setstages`/`setcombos` se aplicável) →
`creategame` → `fundgame` → `transfer`(deposit) → `buytickets` (assinatura contextual com
`bingoKey.signDigest`) → `lockgame` → `startdraw` → `waitForDrawn(idStr, attempts)` →
`claim*` → `closegame`. Verifique payout lendo a tabela `balances` (delta esperado).

## Gotchas

- Bounds de `get_table_rows` por chave i64 = `UInt64.from(id)` (string → `name_type_exception`).
- `waitForDrawn` depende do oracle; use timeout do teste ≥ `attempts×2s + folga`.
- gametype ids no harness: 1–4 e 8 já usados; escolha um livre para suites novos.
- Verificar action deployada: `get_abi` de `bingogamectr`.
