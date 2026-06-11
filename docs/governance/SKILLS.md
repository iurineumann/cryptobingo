# SKILLS.md — Skills do CryptoBingo

> Mapeamento das skills disponíveis em `.claude/skills/`.
> Cada skill encapsula procedimentos, gotchas e contexto de uma camada.
> Invoque com `/skill-name` ou via `Skill` tool antes de editar a camada.
>
> Tabela completa camada → skill → agent revisor em `CLAUDE.md`.

---

## Skill: `wax-contract`

**Arquivo:** `.claude/skills/wax-contract/`

**Camada:** `contracts/bingo/` e `contracts/swap/`

**Quando usar:** Qualquer edição em `.hpp`, `.cpp` ou `.abi`; compilação; deploy on-chain.

**Principais procedimentos (resumo — leia a skill completa antes de agir):**
1. Editar `.hpp` + `.cpp`
2. Compilar no container `bingo_waxdev` em `/tmp` (mount é read-only)
3. Copiar `bingo.wasm` de volta para o host
4. **Corrigir o ABI manualmente** — `bingo.abi` é a fonte de verdade; NUNCA usar `bingo_generated.abi` para deploy
5. Deploy via `cleos set contract bingogamectr /app/contracts/bingo -p bingogamectr@active`
6. Validar com harness E2E (oracle daemon vivo)

**Gotchas críticos:**
- Migração de tabela com linhas existentes → `eosio::binary_extension<T>` + tipo `T[]$` no ABI
- `require_auth("bingogamesvc"_n)` para actions de jogo (não `microservice`)
- Pesos em hundredths (100 = 1.00×, máx 25500)
- `orng.abi` também mantido à mão (bug CDT: tabela `reqs` ausente)

**Agent revisor:** `cryptobingo-reviewer`

---

## Skill: `worker-game-resolution`

**Arquivo:** `.claude/skills/worker-game-resolution/`

**Camada:** `apps/worker-game-loop/`

**Quando usar:** Edições no evaluator, orchestrator, draw modes, payouts, RabbitMQ, Redis cache, dropWorker.

**Principais procedimentos:**
- Evaluator: bitmasking O(1) com Bitwise AND; `findAllWinners` paginado (100/página)
- Draw modes: `standard` / `fixed` / `firstfull` / `goldenball` / `multimatch` (ADR-012/013)
- Payout: usa `ticket.price?.quantity` (ADR-010 pricePaid); `max_weight` (ADR-005)
- RabbitMQ: `prefetch(1)`, DLQ, NACK sem requeue para falhas permanentes
- Auto-advance: `autoLockFundingGames`, `autoStartLockedGames`, `autoClaimDrawnGames`
- Testes: `pnpm --filter @cryptobingo/worker-game-loop test`

**Gotchas críticos:**
- `combo_id` = índice canônico alinhado Mongo↔chain
- `patternCache.ts`: Redis TTL 1h, fail-open (nunca bloqueia resolução)
- FREE SPACE = bit 12 do bitmask 5×5 (sempre setado: `0x00001000`)

**Agent revisor:** `worker-reviewer`

---

## Skill: `api-endpoint`

**Arquivo:** `.claude/skills/api-endpoint/`

**Camada:** `apps/api-gateway/`

**Quando usar:** Novas rotas, controllers, middleware, auth, rate limiting, specs.

**Principais procedimentos:**
- Spec-Driven: adicionar rota no `docs/openapi.yaml` ANTES de implementar
- Controller em `apps/api-gateway/src/controllers/`
- JWT challenge-response (ADR-006): `verifySignature` no middleware de auth
- RBAC por role: `admin`, `sponsor`, `player`
- Rate limiting obrigatório; Helmet + CORS restrito
- Typecheck: `npx tsc --project tsconfig.build.json --noEmit`
- Testes: `pnpm --filter @cryptobingo/api-gateway test`

**Gotchas críticos:**
- Tipos devem espelhar `@cryptobingo/shared-types` (não redefinir localmente)
- Geração de cartelas usa ECDSA com `MICROSERVICE_PRIVATE_KEY` (ADR-001)
- healthController pula rate limiter (`/health/live` e `/health/ready`)

**Agent revisor:** `api-reviewer`

---

## Skill: `frontend-feature`

**Arquivo:** `.claude/skills/frontend-feature/`

**Camada:** `apps/frontend/` e `apps/swap-ui/`

**Quando usar:** Novos componentes React, hooks, serviços, locales, Wharfkit, design system.
Aplica-se a ambos os apps React — game frontend (5173) e swap DEX (5174).

**Principais procedimentos:**
- Dev server: `pnpm --filter @cryptobingo/frontend dev` (ou `swap-ui`)
- i18n: toda string visível em `src/locales/{pt,en,zh}.json`; `useTranslation()` nos componentes
- WharfKit: `SessionKit` para login; sem custódia de chaves; `WalletPluginPrivateKey` somente em `DEV`
- swapService.ts: `executeSwap/addLiquidity/removeLiquidity` via `session.transact()`
- `pool_id` é `string` (uint64 serializado pelo WAX) — converter com `Number()` só na chamada on-chain
- Design system: variáveis em `globals.design.css`; Tailwind v4 em `globals.css`
- Typecheck: `npx tsc --noEmit` (dentro do app)
- Testes: `pnpm --filter @cryptobingo/frontend test` (vitest)

**Gotchas críticos:**
- `t()` retorna `DefaultTFuncReturn` (inclui null) — usar `?? ''` em `placeholder` e attrs HTML
- Seletores Cypress: somente `data-testid` (nunca texto i18n)
- `VITE_SWAP_URL` / `VITE_GAME_URL` ligam os dois apps bidirecionalmente

**Agent revisor:** `frontend-reviewer`

---

## Skill: `e2e-ui-cypress`

**Arquivo:** `.claude/skills/e2e-ui-cypress/`

**Camada:** `apps/e2e-ui/`

**Quando usar:** Novos specs Cypress, fixtures, helpers, ou instrumentação `data-testid` no frontend.

**Principais procedimentos:**
- Tier 1 (PR-gate, determinístico):
  `pnpm --filter @cryptobingo/frontend dev` + `pnpm --filter @cryptobingo/e2e-ui e2e`
  Usa `cy.intercept` + fixtures; sem WAX real; `cy.devLogin(role)` interceptado
- Tier 2 (nightly/manual):
  Stack completo (`docker compose` + `init_dev_env.sh`) + `pnpm --filter @cryptobingo/e2e-ui e2e:tier2`
- Seletores: SOMENTE `data-testid` — nunca texto i18n, classes CSS ou estrutura DOM
- Auth: `cy.devLogin('admin'|'player'|'sponsor')` — dev-login real interceptado

**Gotchas críticos:**
- `data-testid` deve estar no elemento raiz do componente, não em wrappers internos
- Fixtures devem espelhar o contrato OpenAPI; atualizar junto com controllers
- CI gating: Tier 1 obrigatório no pipeline; Tier 2 apenas nightly/manual

**Agent revisor:** `e2e-reviewer`

---

## Skill: `harness-e2e`

**Arquivo:** `.claude/skills/harness-e2e/`

**Camada:** `apps/harness/`

**Quando usar:** Novos testes E2E on-chain (FSM, swap), alterações no `init_dev_env.sh`, bootstrap.

**Principais procedimentos:**
- Requer: nodeos em `127.0.0.1:8888` + oracle daemon vivo durante os testes
- Suba oracle e jest no mesmo comando para evitar que processos de background morram:
  ```bash
  node_modules/.pnpm/node_modules/.bin/ts-node --transpile-only scripts/orng-oracle.ts \
    >> logs/orng-oracle.log & OPID=$!; sleep 4
  cd apps/harness && npx jest tests/fsm.test.ts -t '<Suite>'; kill $OPID
  ```
- `node run-tests.js` para rodar todas as suites (pula se faltam env keys)
- Bounds i64 em `get_table_rows`: use `UInt64.from(id)`, não string

**Gotchas críticos:**
- `orng.abi` mantido à mão — CDT não gera a tabela `reqs` corretamente
- Reset com `init_dev_env.sh --reset` zera gametypes on-chain (recriar pela UI admin)
- Oracle daemon: verificar vida com `pgrep -f orng-oracle.ts`; log em `logs/orng-oracle.log`

**Agent revisor:** `platform-reviewer`

---

## Skill: `weights-calibration`

**Arquivo:** `.claude/skills/weights-calibration/`

**Camada:** Simulação Monte Carlo — `apps/api-gateway/src/controllers/monteCarloController.ts`

**Quando usar:** Calibração de pesos de padrões/combinações para manter RTP 85% / GGR 15%.

**Principais procedimentos:**
- Endpoint: `POST /admin/calibrate-weights` (requer role `admin`)
- Pesos em hundredths (100 = 1.00×, máx 25500 = 255×)
- `max_weight` (ADR-005): prêmio usa o maior peso entre padrões/combinações/stages
- Simular antes de ativar novo gametype em produção
- Resultado deve manter RTP entre 83%–87% (tolerância ±2%)

**Gotchas críticos:**
- Nunca alterar pesos diretamente on-chain sem rodar a simulação
- Combinações têm peso próprio — combinam com `max_weight`, não somam
- Pesos off-chain (Mongo metadata) são separados dos pesos on-chain (`gametypes` table)

**Agent revisor:** `platform-reviewer`
