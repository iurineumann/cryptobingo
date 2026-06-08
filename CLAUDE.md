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
- **Git flow + testes verdes** antes do PR; PT-BR em código/commits/docs; honestidade sobre o que
  foi verificado vs. o que falta.
- **Camada → skill + revisor:** ao tocar uma camada, use a **skill** dela e delegue a revisão pré-PR
  ao **agent** correspondente (ver tabela em *Skills & Agents*).

## Layout

```
apps/
  frontend/          React + Vite + TS (vitest). i18n pt/en/zh em src/locales/.
  api-gateway/       Express + TS (jest). Controllers em src/controllers/. JWT + RBAC.
  worker-game-loop/  Resolução de jogos / payouts (jest). Wharfkit + RabbitMQ + Redis + PG.
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
- **Frontend:** testes = `vitest run` (rode via `pnpm --filter @cryptobingo/frontend test`; `npx jest` NÃO existe lá).
- **Worker/API:** `npx jest <arquivo>` ou `-t '<nome>'` para um teste só.
- **Harness E2E:** `node run-tests.js` (pula se faltam env keys). Para um suite: ver seção Harness.

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
4. **Deploy:** `cleos set contract bingo.game /app/contracts/bingo -p bingo.game@active`
   (wallet `devwallet` destravada; chave de `bingo.game` = `CONTRACT_PRIVATE_KEY` no env do worker/api).
5. **Validar:** `bash -n`? não — verifique a action no ABI on-chain (`get_abi`) e rode o harness.

**Migração de tabela (adicionar campo a struct de tabela com linhas existentes):** use
`eosio::binary_extension<T>` no `.hpp` e tipo `T[]$` (sufixo `$`) no ABI. Sem isso, linhas antigas
quebram com `unpack_exception` (não há action para limpar a tabela). Ex.: ADR-016 `combinations`.

**Modelo de auth:** actions admin → `require_auth(get_self())` (= `bingo.game`); actions de jogo →
`require_auth("microservice"_n)`. O contrato **confia no worker** para avaliação (match de padrão /
satisfação de combo) mas **valida pesos on-chain** contra `gametypes` (anti-inflação de prêmio).

**Pesos** são sempre **hundredths** (100 = 1.00×; máx 25500 = 255×).

## Ambiente de dev local + Oracle

- Subir/reset: `./init_dev_env.sh` (ou `--reset` para recriar o container/chain do zero).
  Isso recria contas, deploya `bingo.game` (do wasm/abi do host) + `orng.wax`, e inicia o oracle daemon.
- **Oracle daemon** (necessário para `startdraw` → `drawn`): roda `scripts/orng-oracle.ts`.
  `npx ts-node` FALHA no monorepo pnpm. Use o binário hoisted + transpile-only:
  `node_modules/.pnpm/node_modules/.bin/ts-node --transpile-only scripts/orng-oracle.ts`.
  Verifique vida: `pgrep -f orng-oracle.ts` · log: `logs/orng-oracle.log` · reqs pendentes na
  tabela `orng.wax/reqs` devem drenar a 0.
- Reset zera os **gametypes on-chain** do app (recrie pela UI admin — o upsert sincroniza on-chain).
- Mongo (metadados off-chain): `mongodb://...@localhost:27017/cryptobingo_edge?authSource=admin`.

## Harness E2E

Roda contra o **nodeos real** (`127.0.0.1:8888`) + oracle daemon. Env keys em `.waxdev.env` +
`apps/worker-game-loop/.env`. Para rodar 1 suite com oracle vivo durante o jest (processos de
background morrem entre invocações), suba o oracle e o jest **no mesmo comando**:
```bash
<ts-node --transpile-only scripts/orng-oracle.ts >> logs/...> & OPID=$!; sleep 4
cd apps/harness && npx jest tests/fsm.test.ts -t '<Suite>'; kill $OPID
```
Bounds de `get_table_rows` por chave i64: use `UInt64.from(id)`, não string.

## Git flow

- Branch de feature `feature/<slug>` a partir da branch de integração ativa. Commits lógicos e
  pequenos, mensagem PT-BR no padrão `tipo(escopo): ...`, terminando com
  `Co-Authored-By: Claude ...`. PR com corpo estruturado → branch de integração (o `develop` foi
  removido; confirme o alvo com `git ls-remote --heads origin`). Branch principal: `master`.
- Pré-PR: typecheck + testes dos pacotes tocados verdes. Toda mudança estrutural → ADR em `docs/adr/`.

## Skills & Agents do projeto (`.claude/`)

Use a **skill** da camada que você for tocar (procedimentos + gotchas) e delegue a revisão pré-PR ao
**agent revisor** correspondente.

| Camada | Skill | Agent revisor |
|---|---|---|
| Contrato C++ | `wax-contract` | `cryptobingo-reviewer` (contrato + cross-cutting) |
| Worker / payouts | `worker-game-resolution` | `worker-reviewer` |
| API-gateway | `api-endpoint` | `api-reviewer` |
| Frontend | `frontend-feature` | `frontend-reviewer` |
| Harness/E2E · DevOps · Economia | `harness-e2e`, `weights-calibration` | `platform-reviewer` |

## Invariantes de domínio

- **max_weight (ADR-005):** por cartela paga-se o maior peso entre padrões/combinações/stages.
- **Combinações (ADR-016):** peso on-chain (`gametype.combinations`, `claimcombo`); cláusulas/tipos
  off-chain (Mongo). combo_id = índice canônico alinhado Mongo↔chain.
- **Draw modes (ADR-012/013/014):** standard / fixed / firstfull / goldenball / multimatch (stages).
- **pricePaid (ADR-010):** prêmio = preço pago pela cartela × base_multiplier × weight/100 × golden.
- FREE SPACE = bit 12 do bitmask 5×5 (sempre setado).
