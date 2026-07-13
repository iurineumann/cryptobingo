# ADR 049: Oráculo RNG Parametrizável via `setoracle`

## Status
Aceito

## Contexto
O ADR-003 definiu que o sorteio (RNG) é delegado ao oráculo nativo da rede (`orng.wax` na Mainnet), via fluxo assíncrono `startdraw → requestrand → receiverand`. O contrato `bingogamectr` tinha o nome do oráculo **hardcoded** como `"orng.wax"` em `startdraw` e `receiverand`.

Esse acoplamento impede:
1. **Testnet sem ORNG nativo:** a WAX Testnet (greymass) não hospeda um contrato `orng.wax` funcional de forma estável. Para validar o fluxo de sorteio em testnet, precisamos de uma conta de oráculo própria (`bingogamerng`) com o contrato `orng` (código oficial WAX ORNG) deployado e operado por nós.
2. **Portabilidade:** não há como apontar para um oráculo diferente (ex.: outra conta, ou migração de infra) sem recompilar e reimplantar o contrato.

A solução anterior (mock `orng_mock.wasm`) era frágil e não exercitava a assinatura RSA real do oráculo — não validava o caminho de produção.

## Decisão
1. **Campo `oracle_account` na config:** adicionado `binary_extension<name> oracle_account` à `config_state` do contrato `bingogamectr`. O `binary_extension` garante **retrocompatibilidade**: contratos já implantados (sem esse campo) continuam funcionando, assumindo o fallback.
2. **Fallback mainnet:** quando `oracle_account` não está setado, `startdraw`/`receiverand` usam `value_or("orng.wax"_n)` — mantendo 100% de paridade com a Mainnet (onde o oráculo é `orng.wax`).
3. **Action `setoracle(name)`:** permite alterar a conta do oráculo em runtime, protegida por `require_auth(admin)` (ponte `bingogamectr@active` + `bingogamesvc@active`, conforme ADR-026). Foi adicionado `linkauth setoracle → admin` no `init_dev_env.sh` e aplicado na testnet.
4. **Conta `bingogamerng` na testnet:** conta dedicada criada manualmente, com o contrato `orng` (WAX ORNG oficial) deployado, `regkey`/`setver` (v1) configurados com a chave RSA de dev, e `active` permission contendo `eosio.code` (para `setrand` inline). O daemon `orng-oracle.ts` (parametrizado via `ORNG_ACCOUNT=bingogamerng`) roda apontando para ela.
5. **Daemon `orng-oracle.ts` parametrizado:** lê `ORNG_ACCOUNT` (default `orng.wax`), `ORNG_WAX_KEY`, `ORNG_RSA_PRIVATE_KEY_PATH`, `RPC_URL`, `CHAIN_ID`, `ORNG_POLL_INTERVAL_MS` e opcionalmente `APPLICATIONINSIGHTS_CONNECTION_STRING` (telemetria App Insights). Suporta paginação de `reqs` e graceful shutdown.

## Consequências

### Positivas
* **Testnet valida produção:** o fluxo de sorteio em testnet agora usa assinatura RSA real do oráculo (não mais mock), exercitando o caminho completo `startdraw → requestrand → daemon → setrand → receiverand`.
* **Zero risco mainnet:** o fallback `value_or("orng.wax")` garante que a Mainnet continua usando `orng.wax` sem nenhuma mudança operacional.
* **Operabilidade:** troca de oráculo (ex.: migração de conta) via `setoracle` em runtime, sem reimplantação de contrato.
* **Observabilidade:** telemetria opcional via App Insights (Azure) pronta para a ETAPA 6 (VM B1s).

### Negativas / Trade-offs
* **Superfície de ataque ampliada:** a action `setoracle` (via `admin`) permite redirecionar o oráculo para uma conta maliciosa. Mitigado por `require_auth(admin)` (ponte de 2 contas isoladas, ADR-026) e pelo fato de `admin` não ser a `active` pública.
* **Gestão de chaves:** a conta `bingogamerng` precisa de chave RSA registrada (`regkey`) e chave WAX para `setrand`. Na testnet usamos a chave RSA de dev (compartilhada com o `orng.wax` local) — para produção real seria necessária chave dedicada.

## Implementação
* `contracts/bingo/include/bingo.hpp`: `binary_extension<name> oracle_account` + action `setoracle`.
* `contracts/bingo/src/bingo.cpp`: `setoracle` com `require_auth(admin)`; `startdraw`/`receiverand` leem `config.oracle_account.value_or("orng.wax"_n)`.
* `contracts/bingo/bingo.abi`: action `setoracle` + campos `name$` (atualizada à mão — CDT 4.0.1 não gera ABI corretamente).
* `init_dev_env.sh`: `linkauth setoracle → admin` + `export ORNG_ACCOUNT=orng.wax`.
* `scripts/orng-oracle.ts`: parametrização completa (`ORNG_ACCOUNT`, telemetria, paginação, graceful shutdown).
* `apps/harness/tests/fsm.test.ts`: suíte `ORACLE_CONFIG` (OC-0..3) validando `setoracle` (admin/no-admin/conta-inválida) e `startdraw → drawing → drawn` com oracle parametrizado.

## Referências
* ADR-003: Oráculo de Sorteio e Geração de Números Aleatórios (RNG).
* ADR-026: Modelo de Permissões EOSIO (ponte `admin`).
* WAX ORNG: https://github.com/worldwide-asset-exchange/wax-orng
* Branch: `feat/oracle-config` (commit `7d1ffb7`).
