# ADR-049 — Conta do oráculo RNG parametrizada via `setoracle`

- Status: Aceito
- Data: 2026-07-10
- Tags: Infrastructure, Blockchain, Contract, Oracle, Testnet
- Corrige/estende: ADR-003 (oráculo de sorteio RNG)

## Contexto

O contrato `bingo` (conta `bingogamectr`) consome o oráculo RNG da WAX
(`orng.wax`) de forma **hardcoded** em `startdraw` e `receiverand`
(bingo.cpp ~linhas 950/960). Isso trava o endereço do oráculo no código e
impede:

1. Usar uma conta ORNG **própria** na testnet (`bingogamerng`) — necessária
   porque a testnet WAX **não tem** um contrato `orng.wax` funcional
   deployado/publicado para consumo genérico (o `orng.wax` oficial existe
   só na mainnet).
2. Trocar o oráculo sem redeploy de contrato.

Além disso, o daemon `scripts/orng-oracle.ts` (que assina e entrega o
`rand` ao contrato ORNG) tinha a conta do oráculo **hardcoded** como
`orng.wax`, e o `bootstrap.ts` do harness era **dead code** (aplicava
`.dune.env` inexistente, variáveis com nomes errados, bug de `signer_key`
usando a pubkey em vez da privada) — substituído por `init_dev_env.sh`
como fonte de verdade do ambiente dev.

## Decisão

### A — Contrato `bingo`: `oracle_account` configurável

Adicionar campo `oracle_account` (tipo `binary_extension<name>`) à
struct `config` do contrato, com **fallback `"orng.wax"`** quando vazio
(paridade mainnet — quem não chamar `setoracle` continua usando o
oráculo oficial).

Action `setoracle(name oracle)`:
- Protegida por `require_auth(permission_level{get_self(), "admin"_n})`.
- Valida `is_account(oracle)` antes de gravar.
- Só `bingogamectr@admin` pode alterar (ponte `bingogamectr@active` +
  `bingogamesvc@active`, conforme ADR-026).

`startdraw` e `receiverand` passam a chamar `requestrand` / ler o rand de
`config.oracle_account.value_or("orng.wax"_n)` em vez do literal.

**ABI mantida à mão** (CDT 4.0.1 gera `tables:[]` quebrando o ABI
on-chain — regra do projeto: nunca confiar no ABI do `cdt-cpp`, manter
`contracts/bingo/bingo.abi` manual e usar `--abi` no deploy).

### B — Daemon `orng-oracle.ts`: `ORNG_ACCOUNT` parametrizado

A conta do contrato ORNG que o daemon atende passa a ser lida de
`process.env.ORNG_ACCOUNT` (default `"orng.wax"`):
- Dev/local: `orng.wax` (criada pelo `init_dev_env.sh`).
- Testnet: `bingogamerng` (conta dedicada criada manualmente).

Ainda nesta mudança o daemon ganhou:
- **Telemetria App Insights opcional** via
  `APPLICATIONINSIGHTS_CONNECTION_STRING` / `APPINSIGHTS_INSTRUMENTATIONKEY`
  (fallback console-only para dev).
- **Paginação** da tabela `reqs` via `next_key` (não perde requisições
  se houver >100 pendentes).
- **Graceful shutdown** (SIGTERM/SIGINT, aguarda in-flight 10s).
- **PID file condicional** (`WRITE_PID_FILE=1`) — inútil em container.

### C — Remoção de `bootstrap.ts` (dead code)

`apps/harness/scripts/bootstrap.ts` removido (preservado em
`.hermes/bootstrap.legacy.ts` para referência). O `init_dev_env.sh` é a
fonte de verdade do ambiente dev (cria contas, deploya, `setconfig`
correto com `BINGOGAMESVC_PUB`).

### D — `linkauth` de `setoracle`

`setoracle` exige `require_auth(admin)`; adicionado `linkauth
setoracle -> admin` em `init_dev_env.sh` (e aplicado no node local e na
testnet) para que a action funcione sem assinar `admin` em toda tx.

## Consequências

### Positivas
- `bingogamectr` usa `bingogamerng` como oracle na testnet (on-chain
  confirmado: `config.oracle_account = bingogamerng`).
- Mainnet inalterada: fallback `orng.wax` preserva paridade.
- Daemon pronto para produção (telemetria, paginação, graceful
  shutdown) e reutilizável entre dev/testnet/mainnet via env.
- `bootstrap.ts` morto eliminado — menos superfície de bug.

### Negativas / trade-offs
- `oracle_account` como `binary_extension` exige que o contrato já esteja
  no formato novo (deploy do wasm novo é pré-requisito — feito na
  testnet em 2026-07-10, TX `a5584f66`).
- `setrand` na testnet usa a **chave RSA de dev**
  (`contracts/orng/dev-rsa-private.pem`) registrada via `regkey`/`setver`
  (ver=1). Para mainnet real, trocar por chave RSA dedicada + `regkey`
  com a chave de produção.
- App Insights só emite se o pacote `applicationinsights` estiver
  instalado e a env definida — senão cai em no-op (sem quebrar o dev).

### Verificação
- **Local (harness):** suite `ORACLE_CONFIG` (OC-0..3) — 4 passed / 0
  failed no node local. OC-0 valida `setoracle` via `admin`; OC-1/2
  rejeitam sem admin / conta inválida; OC-3 valida `startdraw → drawing
  → drawn` com oracle parametrizado.
- **Testnet (pontos a ponta):** daemon `orng-oracle.ts` subiu apontando
  `RPC=waxtestnet.greymass.com`, `ORNG_ACCOUNT=bingogamerng`,
  `ORNG_WAX_KEY=bingogamerng@active`, RSA dev. Pollando a tabela `reqs`
  do `bingogamerng`, assinou RSA-PKCS1v15-SHA256 e chamou `setrand` —
  provando que a cadeia conecta, assina e entrega (a falha "Game not
  found" em req artificial confirma que a **assinatura RSA passou** na
  validação do contrato ORNG).
- **On-chain:** `get table bingogamectr bingogamectr config` →
  `oracle_account: "bingogamerng"` (TX `3ad809dc`).

## Referências
- ADR-003 — oráculo de sorteio RNG (modelo original).
- ADR-026 — `setconfig`/`settreasury`/`sweepggr` em `get_self` (cold
  key); `admin` é ponte para `setoracle`.
- `contracts/bingo/src/bingo.cpp` — `setoracle`, `startdraw`, `receiverand`.
- `contracts/bingo/include/bingo.hpp` — `config::oracle_account`.
- `scripts/orng-oracle.ts` — daemon com `ORNG_ACCOUNT` + telemetria.
- `init_dev_env.sh` — `linkauth setoracle->admin`.
- Chaves testnet: RAG `agent://testnet-keys/2026-07-09`.
- RAG progresso: `agent://oracle-config/2026-07-10-etapa5`,
  `agent://oracle-config/2026-07-10-etapa6-daemon`.
