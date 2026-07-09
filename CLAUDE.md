# CryptoBingo — Guia do Projeto (CLAUDE.md)

Plataforma de BINGO GameFi on-chain na **WAX/Antelope**. Monorepo pnpm + Turbo.
Economia: **RTP 85% / GGR 15%**. Desenvolvimento **dirigido por ADRs** (`docs/adr/`).
Idioma do código/comentários/commits/docs: **português (PT-BR)**.

> Comentários explicam o *porquê*, não o *o quê*. Toda decisão estrutural vira ADR.

## Como trabalhamos (metodologia)

Operamos como uma **Célula de Engenharia de Elite**. A metodologia completa (persona, rigor
cognitivo, padrão de resposta em 8 seções) está em **`docs/MASTER-PROMPT.md`** — **leia-o para
tarefas complexas/arquiteturais**. Regras duráveis que valem SEMPRE (sem precisar anexar nada):

- **Production-first + sistêmico:** toda solução considera arquitetura, segurança, escala,
  observabilidade, testes, rollback e edge cases; nunca trate camadas isoladamente.
- **Diagnóstico antes de código:** causa-raiz → trade-offs (≥3 abordagens quando relevante) →
  decisão → implementação. Verificação final (CoVe): compila, tipa, testa, sem regressão.
- **Segurança é bloqueante:** authz/secrets/injeção/bypass on-chain → aponte e corrija; sem atalho.
- **ADR-driven:** decisão estrutural → ADR em `docs/adr/`; specs (`openapi`/`asyncapi`) e este
  CLAUDE.md acompanham a mudança.
- **TDD é obrigatório:** test-first (RED→GREEN→refactor) para toda implementação nova. Um teste
  por vez, código mínimo para passar. Nuca escrever implementação sem teste vermelho primeiro.
- **Git flow + testes verdes** antes do PR; PT-BR em código/commits/docs; honestidade sobre o que
  foi verificado vs. o que falta.
- **Camada → skill + revisor:** ao tocar uma camada, use a **skill** dela e delegue a revisão pré-PR
  ao **agent** correspondente (ver tabela em *Skills & Agents*).
- **Content QA é obrigatorio:** nao produza conteudo sem ativar personas (Copywriter, Editor, Visual
  Designer, SEO Specialist), consultar RAG (tags: content-quality, persona-decision, images) e
  executar `scripts/check-content-qa.mjs`. Info factual deve ser verificada contra pesquisa web
  (max 90 dias). Ver ADR-040.
- **Slugs traduziveis:** URLs usam slugs do `content/slugs.json`, nao nomes de arquivo. Modificar
  `lib/content.ts` ao adicionar novo locale. Nunca atrelar URL ao filename.
- **Imagens obrigatorias:** frontmatter `images: []` populado em todo post/tutorial. Figure component
  com lazy loading + zoom. Fontes: Unsplash (fotos), Mermaid (diagramas), screenshots (tutoriais).

## Layout

```
apps/
  frontend/          React + Vite + TS (vitest). i18n pt/en/zh em src/locales/.
  landing-page/      Landing page (SSG React Router v7) + API Functions (ADR-039).
  swap-ui/           DEX público bingogameswp (React + Vite + TS). Swap, liquidez, analytics.
  api-gateway/       Express + TS (jest). Controllers em src/controllers/. JWT + RBAC.
  worker-game-loop/  Resolução de jogos / payouts (jest). Wharfkit + RabbitMQ + Redis + PG.
  e2e-ui/            Testes E2E de UI (Cypress, ADR-017).
  harness/           E2E on-chain real (jest via run-tests.js). Precisa do nodeos + oracle.
packages/
  blockchain-core/   rpcClient + helpers Wharfkit compartilhados.
  shared-types/      Tipos TS espelhando structs do contrato.
contracts/bingo/     Contrato C++ (cdt-cpp). bingo.hpp / bingo.cpp / bingo.abi (ver abaixo).
contracts/orng/      Oráculo RNG (RSA-SHA256) + daemon scripts/orng-oracle.ts.
docs/adr/            Decisões arquiteturais (fonte de verdade de regras de negócio).
```

## Comandos

- **Tudo:** `pnpm test` / `pnpm build` (Turbo). Por pacote: `pnpm --filter @cryptobingo/<nome> test`.
- **Typecheck** (NÃO use `tsc --noEmit` solto — falha por rootDir no monorepo): use o build tsconfig:
  `npx tsc --project tsconfig.build.json --noEmit` (api/worker) · `npx tsc --noEmit` (frontend ok).
- **Frontend/Swap:** testes = `vitest run` (rode via `pnpm --filter @cryptobingo/frontend test` ou `pnpm --filter @cryptobingo/swap-ui test`).
- **Worker/API:** `npx jest <arquivo>` ou `-t '<nome>'` para um teste só.
- **Harness E2E:** `node run-tests.js` (pula se faltam env keys). Para um suite: ver seção Harness.

## Deploy Frontend (Manual)

GitHub Actions desabilitado (repo privado free tier). Deploy manual SEMPRE via `scripts/deploy-frontend.sh`.

**⚠️ REGRA CRÍTICA:** Vite embute `VITE_*` em tempo de build. Build sem `.env.production` correto → produção herda URLs de dev (localhost). Sintomas:
- Console: `[Wharfkit] RPC URL configurada para: http://127.0.0.1:8888`
- CSP bloqueia `localhost:8083/api/v1/...` (produção nunca precisa de localhost na CSP)

**Passos:**
```bash
# 1. Verificar env vars de produção
cat apps/frontend/.env.production  # deve ter URLs da testnet, NUNCA localhost

# 2. Build + deploy automático (verifica .env.production + varre JS contra localhost)
bash scripts/deploy-frontend.sh

# 3. OU manualmente (se o script falhar):
export SWA_DEPLOY_TOKEN_FRONTEND=$(az staticwebapp secrets list \
  --name cryptobingo-frontend --resource-group cryptobingo-testnet \
  --query "properties.apiKey" -o tsv)
cd apps/frontend && pnpm build
# Verificar JS: grep -oP 'https?://(localhost|127\.0\.0\.1)[^"'"'"']*' dist/assets/index-*.js
swa deploy dist --deployment-token "$SWA_DEPLOY_TOKEN_FRONTEND" \
  --app-name cryptobingo-frontend --env production \
  --swa-config-location /absolute/path/to/apps/frontend
```

**Pós-deploy (verificação obrigatória):**
1. Abrir `https://test.cryptobingo.bet` → F12 Console
2. NÃO deve aparecer `localhost` ou `127.0.0.1` em nenhum erro
3. CSP header: `curl -sI https://test.cryptobingo.bet | grep content-security-policy`
4. CSP não precisa de `localhost` — se vir, build foi com env errada

**Swap-ui:** não tem SWA config — CSP gerenciado via nginx/Cloudflare, não por SWA.

## Landing Page API (ADR-039)

API serverless da landing page (`apps/landing-page/api/`). Azure Function App standalone (Consumption, Node 22) + Aiven PostgreSQL.

**Problemas conhecidos:**
- **ESM não funciona** no Functions v4. Compilar TS com `module: "commonjs"` (CJS).
- **pnpm symlinks** corrompem zip deploy. Usar `npm install` limpo em `/tmp/fa-prod`, zipar e deployar.
- **Aiven SSL:** `sslmode=require` na URL sobrescreve pool config. Manter URL sem `sslmode`, configurar `ssl: { rejectUnauthorized: false }` no Pool.

**Infra:**
- Function App: `cryptobingo-landing-api` (Consumption, westus2)
- Domínio: `landing-api.cryptobingo.bet` (Cloudflare proxy, SSL automático)
- PostgreSQL: Aiven free tier (Aivencloud, Frankfurt)
- Frontend usa `VITE_API_URL` env var (build time) p/ apontar p/ API

**Deploy:**
```bash
# 1. Compilar
cd apps/landing-page/api && npx tsc

# 2. Montar pacote (npm install limpo)
rm -rf /tmp/fa-prod && mkdir -p /tmp/fa-prod
cd /tmp/fa-prod
jq '{name,version,main,dependencies}' ../apps/landing-page/api/package.json > package.json
npm install
mkdir -p _lib ideas votes admin
cp <api-dir>/{host.json,index.js,stats.js,stats_game.js,subscribe.js} ./
cp <api-dir>/_lib/*.js _lib/
cp <api-dir>/ideas/*.js ideas/
cp <api-dir>/votes/*.js votes/
cp <api-dir>/admin/*.js admin/

# 3. Deploy
zip -r /tmp/fa-prod.zip .
az webapp deployment source config-zip --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet --src /tmp/fa-prod.zip
```

**CI:** GitHub Actions em `.github/workflows/deploy-landing.yml`. Seta `VITE_API_URL` p/ build.

## Contrato C++ (workflow CRÍTICO e não-óbvio)

O contrato roda no container Docker **`bingo_waxdev`** (cdt-cpp instalado). `contracts/` é montado
read-only em `/app/contracts`. **Sempre** seguir este ciclo ao mexer no contrato:

1. **Editar** `contracts/bingo/include/bingo.hpp` e `src/bingo.cpp`.
2. **Compilar** (no container, em /tmp porque o mount é ro):
   ```bash
   docker exec bingo_waxdev bash -c "rm -rf /tmp/bingo && mkdir -p /tmp/bingo && \
     cp -r /app/contracts/bingo/* /tmp/bingo/ && \
     cdt-cpp -abigen -I /tmp/bingo/include /tmp/bingo/src/bingo.cpp /tmp/bingo/src/orng_mock.cpp \
       -o /tmp/bingo/bingo.wasm --contract bingo -O2"
   docker cp bingo_waxdev:/tmp/bingo/bingo.wasm contracts/bingo/bingo.wasm
   ```
3. **⚠️ CORRIGIR O ABI MANUALMENTE.** O ABI gerado pelo cdt-cpp é incompleto/instável. A fonte de
   verdade é o **`contracts/bingo/bingo.abi` mantido à mão**. Adicione lá, à mão, novos structs,
   campos de tabela e actions (espelhando o `.hpp`). NUNCA confie no `bingo_generated.abi`.
4. **Deploy:** `cleos set contract bingogamectr /app/contracts/bingo -p bingogamectr@active`
   (wallet `devwallet` destravada; chave de `bingogamectr` = `CONTRACT_PRIVATE_KEY` no env do worker/api).
5. **Validar:** `bash -n`? não — verifique a action no ABI on-chain (`get_abi`) e rode o harness.

**Migração de tabela (adicionar campo a struct de tabela com linhas existentes):** use
`eosio::binary_extension<T>` no `.hpp` e tipo `T[]$` (sufixo `$`) no ABI. Sem isso, linhas antigas
quebram com `unpack_exception` (não há action para limpar a tabela). Ex.: ADR-016 `combinations`.

**Modelo de auth (ADR-026):**
- `bingogamectr@active` (cold key) → somente `setconfig`, `settreasury`, `sweepggr`
- `bingogamectr@admin` (threshold 1: `bingogamectr@active` OU `bingogamesvc@active`) →
  actions operacionais chamadas pelos serviços: `creategame`, `addpattern/delpattern`,
  `addgametype/delgametype`, `setstages`, `setcombos`, `setnftconf/delnftconf`,
  `createroom`, `activateroom`, `pauseroom`, `closeroom`, `setroommeta`,
  `linkcampaign`, `closecmpgn`, `allocatedrop`, `deallocdrop`
- `bingogamectr@active` (cold key + `eosio.code` + **`bingogamesvc@active`** como satisfator)
  → actions que exigem `require_auth(get_self())`: `setconfig`, `settreasury`,
  `sweepggr` e **`updateroom`** (edição de preços de sala — ADR-045). O backend assina
  `updateroom` como `bingogamectr@active` com a chave do microserviço.
- `bingogamesvc@active` → actions FSM: `fundgame`, `lockgame`, `startdraw`, `claimwin`,
  `claimcombo`, `claimstage`, `closegame`, `execdrop`, `abortgame`
- **Serviços online usam apenas `MICROSERVICE_PRIVATE_KEY`** — `CONTRACT_PRIVATE_KEY` não
  é carregada em runtime (api-gateway e worker assinam como `bingogamectr@admin` ou
  `bingogamesvc@active` com a mesma chave do microserviço). O contrato **confia no worker**
  para avaliação mas **valida pesos on-chain** contra `gametypes` (anti-inflação de prêmio).

**Pesos** são sempre **hundredths** (100 = 1.00×; máx 25500 = 255×).

## Ambiente de dev local + Oracle

- Subir/reset: `./init_dev_env.sh` (ou `--reset` para recriar o container/chain do zero).
  Isso recria contas, deploya `bingogamectr` (do wasm/abi do host) + `orng.wax`, e inicia o oracle daemon.
- **Oracle daemon** (necessário para `startdraw` → `drawn`): roda `scripts/orng-oracle.ts`.
  `npx ts-node` FALHA no monorepo pnpm. Use o binário hoisted + transpile-only + project isolado:
  `node_modules/.pnpm/node_modules/.bin/ts-node --transpile-only --project scripts/tsconfig.json scripts/orng-oracle.ts`.
  (sem `--project scripts/tsconfig.json` → TS5011: rootDir conflict com declaration:true do tsconfig raiz)
  Verifique vida: `pgrep -f orng-oracle.ts` · log: `logs/orng-oracle.log` · reqs pendentes na
  tabela `orng.wax/reqs` devem drenar a 0.
- Reset zera os **gametypes on-chain** do app (recrie pela UI admin — o upsert sincroniza on-chain).
- Mongo (metadados off-chain): `mongodb://...@localhost:27017/cryptobingo_edge?authSource=admin`.

## Harness E2E

Roda contra o **nodeos real** (`127.0.0.1:8888`) + oracle daemon. Env keys em `.waxdev.env` +
`apps/worker-game-loop/.env`. Para rodar 1 suite com oracle vivo durante o jest (processos de
background morrem entre invocações), suba o oracle e o jest **no mesmo comando**:
```bash
<ts-node --transpile-only --project scripts/tsconfig.json scripts/orng-oracle.ts >> logs/...> & OPID=$!; sleep 4
cd apps/harness && npx jest tests/fsm.test.ts -t '<Suite>'; kill $OPID
```
Bounds de `get_table_rows` por chave i64: use `UInt64.from(id)`, não string.

## E2E de UI (Cypress — `apps/e2e-ui`, ADR-017)

Valida a **jornada visual** do usuário (player/admin/sponsor) no navegador — complementa o harness
(que é E2E de contrato/FSM). Modelo em **camadas**:
- **Tier 1 (determinístico, PR-gate):** `cy.intercept` + fixtures (sem WAX). `pnpm --filter
  @cryptobingo/frontend dev` + `pnpm --filter @cryptobingo/e2e-ui e2e`. Seletores só por
  `data-testid` (nunca por texto i18n); auth via `cy.devLogin(role)` (dev-login real interceptado).
- **Tier 2 (real, nightly/manual):** stack completo (`docker compose` + `init_dev_env.sh`).
  `pnpm --filter @cryptobingo/e2e-ui e2e:tier2`.

Use a skill `e2e-ui-cypress` (procedimentos + gotchas) e o revisor `e2e-reviewer`.

## Git flow + GitHub Project

**Início de feature (antes de criar a branch):**
1. Criar issue: `gh issue create --repo iurineumann/cryptobingo --title "tipo(escopo): descrição" --label "enhancement"`
2. Adicionar ao Kanban (#4): `gh project item-add 4 --owner iurineumann --url <issue-url>`
3. Criar branch a partir de `develop`: `git checkout -b feature/<slug>`

**Durante:**
- Commits lógicos e pequenos, padrão PT-BR `tipo(escopo): ...`,
  terminando com `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

**PR para `develop`:**
- Corpo estruturado com **`Closes #N`** (fecha a issue automaticamente no merge → board move para Done)
- Use o template em `.github/PULL_REQUEST_TEMPLATE.md`
- Pré-PR: typecheck + testes dos pacotes tocados verdes
- **SonarQube (obrigatório antes de cada commit):** rode `sonarqube_analyze_code_snippet` em cada
  arquivo `.ts`/`.tsx` modificado; corrija BLOCKER/CRITICAL/MAJOR **antes do commit**; MINOR aceitável
  com justificativa no PR body; NOSONAR só com comentário explicando o motivo (ex: CJS sem top-level await).
- Toda mudança estrutural → ADR em `docs/adr/` antes do PR

**Pós-merge (encerramento):**
1. Verificar se `Closes #N` fechou a issue automaticamente (board → Done)
2. Se não (PR incremental sem issue única), rodar `scripts/closeout.sh <issue> [pr]`
3. Atualizar `.opencode/plans/` com status
4. Verificar se ADR precisa ser criado/atualizado
5. Atualizar CLAUDE.md se novo componente/flow relevante
6. Adicionar ao memory/profile se feature duradoura

**`master`** recebe apenas PRs de `develop` quando estável. Branch principal: `master`.

**Automação do board** (github.com/users/iurineumann/projects/4 → Workflows):
Item adicionado → Backlog · PR aberto → In Progress · PR merged → Done

## Skills & Agents do projeto (`.claude/`)

Use a **skill** da camada que você for tocar (procedimentos + gotchas) e delegue a revisão pré-PR ao
**agent revisor** correspondente.

| Camada | Skill | Agent revisor |
|---|---|---|
| Contrato C++ | `wax-contract` | `cryptobingo-reviewer` (contrato + cross-cutting) |
| Worker / payouts | `worker-game-resolution` | `worker-reviewer` |
| API-gateway | `api-endpoint` | `api-reviewer` |
| Frontend | `frontend-feature` | `frontend-reviewer` |
| E2E de UI (Cypress) | `e2e-ui-cypress` | `e2e-reviewer` |
| Harness/E2E on-chain · DevOps · Economia | `harness-e2e`, `weights-calibration` | `platform-reviewer` |

## Invariantes de domínio

- **max_weight (ADR-005):** por cartela paga-se o maior peso entre padrões/combinações/stages.
- **Combinações (ADR-016):** peso on-chain (`gametype.combinations`, `claimcombo`); cláusulas/tipos
  off-chain (Mongo). combo_id = índice canônico alinhado Mongo↔chain.
- **Draw modes (ADR-012/013/014):** standard / fixed / firstfull / goldenball / multimatch (stages).
- **pricePaid (ADR-010):** prêmio = preço pago pela cartela × base_multiplier × weight/100 × golden.
- FREE SPACE = bit 12 do bitmask 5×5 (sempre setado).

## Prize Pipeline (ADR-038)

Prêmios seguem cadeia de 3 eventos WebSocket + persistência MongoDB + API REST.
Ver ADR-038 e SPEC.md §1.8.

### Eventos WS

```
winner_found → frontend: "preparing"
prize_tx_sent → frontend: "confirming"
prize_confirmed → frontend: "confirmed"
```

Worker dispara `winner_found` ANTES de `processAllGameWinners` (reorder necessário).

### Chave composta

`prizeStatuses` key = `ticket_id:winLabel` (não apenas `ticket_id`). `winLabel` opcional
nos eventos WS. MULTI_MATCH usa `stage_1`, `stage_2` etc.

### API de prêmios

`GET /api/v1/games/:gameId/prizes` → `{ items, total, gameId }`
Usado por `hydratePrizeStatuses` quando `isStaticFinalState == true` (jogos arquivados).
Não sobrescreve WS ativo — só preenche entries `'preparing'` ou ausentes.

### Duas seções de cartela (Premiadas / Disputando)

`groupTicketsByCategory` produz 2 grupos:
- `won` (Premiadas): `winnerMap.has(t.id)`, sort por totalPrize desc
- `active` (Disputando): resto, sort por compositeScore desc

Cartelas ativas recebem `suppressWinner={true}` — perdem decoração de vitória mesmo
se `completedPatterns.length > 0`.

### Observabilidade

Métricas Prometheus no worker: `prize_payments_total`, `prize_payments_amount_total`,
`prize_pipeline_duration`, `prize_persist_total`, `buyin_persisted_total`, `prize_rtp_ratio`.
Dashboard Grafana: `infra/grafana/dashboards/worker-game-loop.json`.

### Arquivos críticos

- `apps/worker-game-loop/src/services/broadcaster.ts:481-500`: notifyPrizeTxSent + notifyPrizeConfirmed
- `apps/worker-game-loop/src/services/evaluator.ts:494-539`: payMultiMatchStage pipeline
- `apps/worker-game-loop/src/services/gameOrchestrator.ts`: winner_found antes de processAllGameWinners
- `apps/frontend/src/hooks/useSlowReveal.ts:265-369`: dedup + composite key + hydratePrizeStatuses
- `apps/frontend/src/components/gameroom/useGameRoomState.ts:280-298`: API fetch effect
- `apps/frontend/src/components/ticketUtils.ts:176-225`: groupTicketsByCategory

## Sistema de Conteúdo Unificado (ADR-037)

API genérica de conteúdo editorial em `apps/api-gateway/src/controllers/contentController.ts`:
- `GET /api/v1/content/:type` — lista pública (com cache Redis 2min)
- `POST/PATCH/DELETE /api/v1/content/:type/:id` — CRUD admin com auto-translate
- Content format: `text` (FAQ) ou `blocks` (BlockNote editor para news/tutorials/etc)
- Locale overrides: revisão lado a lado no admin UI

**Frontend:**
- `ContentPage.tsx` — componente genérico que renderiza qualquer tipo de conteúdo
- `BlockContent.tsx` — renderiza BlockNote blocks em modo leitura
- `ContentAdmin.tsx` — CRUD com BlockNote editor, translation review UI
- Tipos suportados: faq, howitworks, sponsors, tutorials, news

## Infraestrutura Testnet (Azure)

RG: `cryptobingo-testnet` (westus/westus2). Free tier majoritário.

### Recursos

| Nome | Tipo | Região | Tier | Custo |
|------|------|--------|------|-------|
| `api-gateway` | Container App | westus | Consumption | ~$0 (tráfego mínimo) |
| `worker-game-loop` | Container App | westus | Consumption | ~$0 |
| `cryptobingo-mongo` | Cosmos DB MongoDB | westus | Free (1000 RU/s) | $0 |
| `cryptobingo-pg` | PostgreSQL Flexible | westus | Burstable B1ms | ~$25/mês |
| `cryptobingo-landing-api` | Function App | westus2 | Consumption | ~$0 |
| `cryptobingo-appinsights` | Application Insights | westus2 | Workspace-based | $0 (até 5GB/mês) |
| `cryptobingo-loganalytics` | Log Analytics | westus2 | Pay-as-you-go | $0 (baixo volume) |
| `cryptobingo-aca-env` | Container Apps Environment | westus | Consumption | $0 |
| Static Web Apps (frontend/swap) | Static Web Apps | westus | Free | $0 |

### Env vars por Container App

**api-gateway:**
```
MONGO_URL=mongodb://cryptobingo-mongo:<key>@cryptobingo-mongo.mongo.cosmos.azure.com:10255/cryptobingo?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@cryptobingo-mongo@&serverSelectionTimeoutMS=60000
POSTGRES_URL=postgresql://cryptobingo:<pw>@cryptobingo-pg.postgres.database.azure.com/postgres?sslmode=require
RPC_URL=https://waxtestnet.greymass.com
CHAIN_ID=f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12
CONTRACT_ACCOUNT=bingogamectr
SWAP_CONTRACT=bingogameswp
MICROSERVICE_ACTOR=bingogamesvc
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=***REMOVED-ROTATE-VIA-KEYVAULT***;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;ApplicationId=***REMOVED***
APPLICATIONINSIGHTS_SAMPLING_RATIO=0.2
APPLICATIONINSIGHTS_ENABLED=true
```

**⚠️ RPC e Node 22:** `testnet.waxsweden.org` tem `SocketError: other side closed` com undici (fetch nativo Node 22). Usar `waxtestnet.greymass.com` em produção. Local/CI com Node 18 pode usar qualquer um.

**worker-game-loop:**
```
MONGO_URL=<mesmo do api-gateway>
POSTGRES_URL=postgresql://cryptobingo:<pw>@cryptobingo-pg.postgres.database.azure.com/postgres?sslmode=verify-full
RABBITMQ_URL=amqps://<user>:<pw>@fly.rmq.cloudamqp.com/<vhost>
RPC_URL=https://testnet.waxsweden.org
CHAIN_ID=f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12
CONTRACT_ACCOUNT=bingogamectr
APPLICATIONINSIGHTS_CONNECTION_STRING=<mesmo do api-gateway>
APPLICATIONINSIGHTS_SAMPLING_RATIO=0.1
APPLICATIONINSIGHTS_ENABLED=true
```

> `.env.testnet` em cada app tem template com secrets mascarados. Obter valores reais com:
> `az containerapp show -n <app> -g cryptobingo-testnet --query "properties.template.containers[0].env" -o json`

### Cosmos DB MongoDB (ADR-041)

**Database:** `cryptobingo` (shared throughput, 400 RU/s → free tier).
**Collections com dados:** `systemtokens` (2), `gametypemetadatas` (7), `roommetadatas` (21), `sponsororgs` (1).
**Collections vazias (populam naturalmente):** `userprofiles`, `prizetxes`, `buyintxes`, `chatmessages`, `auditlogs`, `contents`, `referrals`, `daily_rewards`, `sponsordelegations`.

**Firewall:** `networkAclBypass=AzureServices`. Container Apps conectam via backbone Azure.
**Migração:** dados restaurados via mongodump do MongoDB local → Cosmos DB em 2026-07-06.
**Dados perdidos na migração:** `userprofiles` (~509 docs). Recriados no próximo login dos usuários.

**Comandos úteis:**
```bash
# Listar coleções com contagem
docker exec bingo_mongodb mongosh "mongodb://cryptobingo-mongo:<key>@cryptobingo-mongo.mongo.cosmos.azure.com:10255/cryptobingo?ssl=true&replicaSet=globaldb&retrywrites=false" --quiet --eval 'db.getCollectionNames().forEach(function(c){print(c+": "+db[c].countDocuments({}))})'

# Dump de coleção específica
docker exec bingo_mongodb mongodump --uri="<MONGO_URL>" --archive=/tmp/dump.gz --gzip --nsInclude="cryptobingo.<collection>"
```

### App Insights (ADR-043)

Azure Application Insights (free 5GB/mês) via `@azure/monitor-opentelemetry`.

| App | Sampling | Arquivo |
|-----|----------|---------|
| api-gateway | 20% | `apps/api-gateway/src/instrumentation.ts` |
| worker-game-loop | 10% | `apps/worker-game-loop/src/instrumentation.ts` |
| landing-page | n/d | `APPLICATIONINSIGHTS_CONNECTION_STRING` env var no Function App |

**Toggle:** `APPLICATIONINSIGHTS_ENABLED=false` desliga sem remover código.
**Connection string:** NUNCA logar ou hardcodar. Em produção: setada via `az containerapp update --set-env-vars`.
**Local `.env`:** vars vazias e `APPLICATIONINSIGHTS_ENABLED=false`.
**Worker específico:** mantém `@opentelemetry/instrumentation-amqplib` para tracing RabbitMQ.
**Fora do escopo:** frontend, swap-ui, landing SSG (client-side não telemetrado).

**Smoke test (Live Metrics):**
```bash
# Verificar se App Insights está recebendo telemetria
az monitor app-insights component show \
  --app cryptobingo-appinsights \
  --resource-group cryptobingo-testnet \
  --query "{ikey:instrumentationKey, appId:appId}"
```
Depois abrir portal → `cryptobingo-appinsights` → Live Metrics. Deve mostrar requests em tempo real ao chamar `/health/live` ou `/api/v1/health`.

### Azure Advisor — Recomendações aplicadas

| Recomendação | Ação | Status |
|---|---|---|
| Cosmos DB firewall rules | `networkAclBypass=AzureServices` | ✅ Aplicado |
| Cosmos DB Private Link | Não implementado (custo) | ⏳ Futuro |
| Desabilitar acesso público | Não implementado (sem Private Link) | ⏳ Futuro |

### Comandos úteis

```bash
# MONGO_URL com serverSelectionTimeout (evita timeout em cold start)
MONGO_URL=mongodb://<user>:<key>@<host>.mongo.cosmos.azure.com:10255/<db>?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@<account>@&serverSelectionTimeoutMS=60000

# App Insights connection string
InstrumentationKey=<ikey>;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;ApplicationId=<appId>

# Setar env var em Container App
az containerapp update -n <app> -g cryptobingo-testnet \
  --container-name <app> \
  --set-env-vars "KEY=value"

# Ver health checks
curl https://<app-fqdn>/health/live
curl https://<app-fqdn>/health/ready
```

## Gamificação (ADR-028 Fase 2)

**Achievements (29):** worker engine (`achievementEngine.ts`), API (`GET /profile/achievements`), frontend modal (`AchievementModal.tsx`), locales pt/en/zh.
Categorias: vitórias (first_win até win_100), combos, compras, partidas, streak, burns, golden_win, stage_win, tiers.

**Streak (login diário):** `xpEngine.ensureDailyStreak()` — tracking de dias consecutivos, XP bonus (`streakCount * 2`), achievements `streak_7/14/30`. Reset se pular 1 dia.

**XP/Level/Tier:** Fórmula Fibonacci (`PHI = 1.618034`), `BASE_XP = 906`, `MAX_LEVEL = 225`. 9 tiers (Cobre→Bronze→Prata→Ouro→Platina→Esmeralda→Safira→Rubi→Diamante). XP por: partida (+streak), win, combo, burn, compra.

## Permission System (ADR-036)

RBAC hierárquico: `admin.*` > `admin.content.*` > `admin.content.<type>.*`.
- `permissionController.ts` — CRUD de permissões por usuário
- `sponsorPermissionController.ts` — delegações com prevenção de escalação (delegations.manage proibido)
- Modelos: `SponsorOrg`, `SponsorDelegation` (MongoDB)
- Auditoria: `utils/audit.ts` registra toda mudança de permissão
