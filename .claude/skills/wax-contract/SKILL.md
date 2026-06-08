---
name: wax-contract
description: >
  Workflow para alterar, compilar, corrigir ABI, deployar e testar o contrato C++
  WAX/Antelope do CryptoBingo (contracts/bingo). Use SEMPRE que for mexer em
  contracts/bingo/*.cpp|*.hpp|*.abi, adicionar/alterar actions ou tabelas, ou quando
  algo no contrato precisar ir on-chain. Cobre a correção MANUAL obrigatória do ABI,
  migração de tabela com binary_extension, deploy via cleos no container bingo_waxdev
  e validação via harness E2E.
---

# WAX Contract — alterar / compilar / deployar / testar

Contrato em `contracts/bingo/`: `include/bingo.hpp` (structs/tabelas/actions), `src/bingo.cpp`
(implementação), `bingo.abi` (**mantido à mão** — fonte de verdade). Roda no container Docker
`bingo_waxdev` (cdt-cpp). `contracts/` é montado read-only em `/app/contracts`.

## Pré-requisitos (verifique antes)

```bash
docker ps --format '{{.Names}}' | grep bingo_waxdev          # container vivo?
curl -s --max-time 5 http://127.0.0.1:8888/v1/chain/get_info # nodeos respondendo?
```
Se o nodeos estiver fora, peça ao usuário para rodar `./init_dev_env.sh` (operação do usuário —
não reinicie a chain por conta própria; o reset zera estado).

## Passo a passo

### 1. Editar `.hpp` + `.cpp`
- Actions de admin: `require_auth(get_self());`. Actions de jogo: `require_auth("microservice"_n);`.
- O contrato confia no worker para avaliação, mas **valida pesos on-chain** (anti-inflação).
- Pesos em hundredths (100 = 1.00×, máx 25500). Espelhe o padrão de actions vizinhas
  (`claimwin`/`claimstage`/`setstages`) para consistência.

### 2. ⚠️ Migração de tabela (só se adicionar campo a struct de TABELA existente)
Linhas já gravadas quebram a desserialização (`unpack_exception`) e **não há action para limpar**.
Solução obrigatória:
- `.hpp`: `eosio::binary_extension<std::vector<T>> campo;` (inclua `<eosio/binary_extension.hpp>`).
- Acesso no `.cpp`: `itr->campo.has_value()` / `itr->campo.value()`; escrita: `row.campo.emplace(v)`.
- ABI: tipo `T[]$` (sufixo `$`). Campos de ARGUMENTO de action permanecem sem `$`.

### 3. Compilar (no container, em /tmp porque o mount é read-only)
```bash
docker exec bingo_waxdev bash -c "rm -rf /tmp/bingo && mkdir -p /tmp/bingo && \
  cp -r /app/contracts/bingo/* /tmp/bingo/ && \
  cdt-cpp -abigen -I /tmp/bingo/include /tmp/bingo/src/bingo.cpp /tmp/bingo/src/orng_mock.cpp \
    -o /tmp/bingo/bingo.wasm --contract bingo -O2 2>&1 | grep -iE 'error|fatal'"
docker cp bingo_waxdev:/tmp/bingo/bingo.wasm contracts/bingo/bingo.wasm
docker cp bingo_waxdev:/tmp/bingo/bingo.abi  contracts/bingo/bingo_generated.abi  # só referência
```
Warnings de "ricardian contract" são esperados/ok. Só `error|fatal` importam.

### 4. ⚠️ CORRIGIR O ABI MANUALMENTE (passo mais esquecido)
A fonte de verdade é **`contracts/bingo/bingo.abi`** (mantido à mão). O ABI gerado pelo cdt-cpp é
incompleto/instável — NÃO o use para deploy. Edite o `bingo.abi` à mão adicionando, espelhando o
`.hpp`:
- novos **structs** (em `"structs"`);
- novo **campo** em struct de tabela (lembre do `$` se for binary_extension);
- structs dos **argumentos** das novas actions (1 struct por action, nome = nome da action);
- entradas em **`"actions"`** (`{name, type, ricardian_contract:""}`).
Valide JSON: `python3 -c "import json;json.load(open('contracts/bingo/bingo.abi'));print('ok')"`.
Use `bingo_generated.abi` apenas como referência dos tipos dos campos.

### 5. Deploy
```bash
WAX=/tmp/wax-blockchain/build/bin/cleos
docker exec bingo_waxdev bash -c \
  "$WAX --url http://127.0.0.1:8888 --wallet-url http://127.0.0.1:8900 \
   set contract bingo.game /app/contracts/bingo -p bingo.game@active 2>&1 | grep -iE 'executed|error'"
```
Se a wallet estiver travada: crie wallet temporária e importe a chave de `bingo.game`
(= `CONTRACT_PRIVATE_KEY` no `apps/worker-game-loop/.env`):
```bash
$WAX wallet create -n tmp --to-console; $WAX wallet import -n tmp --private-key <CONTRACT_PRIVATE_KEY>
```

### 6. Validar
```bash
# action existe no ABI on-chain?
curl -s -X POST http://127.0.0.1:8888/v1/chain/get_abi -d '{"account_name":"bingo.game"}' \
  | python3 -c "import sys,json;print([a['name'] for a in json.load(sys.stdin)['abi']['actions']])"
# leitura de tabela com campo novo não quebra? (migração ok)
curl -s -X POST http://127.0.0.1:8888/v1/chain/get_table_rows \
  -d '{"code":"bingo.game","scope":"bingo.game","table":"gametypes","json":true,"limit":3}'
```
Depois rode o harness (ver skill/seção Harness do CLAUDE.md) com o oracle daemon vivo.

## Erros comuns

- `unpack_exception ... unable to unpack field` → esqueceu binary_extension/`$` na migração (passo 2).
- `Invalid name at get_table_rows` → bound i64 passado como string; use `UInt64.from(id)`.
- Action nova "não existe" → esqueceu de corrigir o `bingo.abi` à mão (passo 4) ou não fez deploy.
- Deploy "unsatisfied authorization" → wallet sem a chave de `bingo.game@active`.

## Git

Commit do contrato inclui: `bingo.hpp`, `bingo.cpp`, `bingo.abi`, `bingo.wasm` (+ `bingo_generated.abi`).
Toda mudança de comportamento on-chain → ADR em `docs/adr/`.
