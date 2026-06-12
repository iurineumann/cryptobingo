# ADR-027 — Ambiente Local AtomicAssets para Dev/Harness

## Status: Aceito

## Contexto

O contrato `bingogamectr` integra com `atomicassets` em três pontos críticos:

1. `[[eosio::on_notify("atomicassets::transfer")]]` → `onnfttransfer()` — recebe NFTs
   depositados no vault pelo sponsor
2. `buytickets()` — lê `atomicassets::assets` (escopo = buyer) para validar ownership
   de NFT e aplicar desconto via `nftconfigs`
3. `reclaimasset()` / `execdrop()` — enviam inline actions `atomicassets::transfer`
   para devolver NFTs ao sponsor ou dropar para o vencedor

Sem `atomicassets` na chain local:
- `onnfttransfer` nunca dispara (contrato inexistente)
- `buytickets` com NFT sempre falha (`eosio_assert` em tabela remota)
- `execdrop` / `reclaimasset` abortam com "account does not exist"
- O painel NftAdmin não consegue push de actions on-chain no ambiente dev

## Decisão

Compilar e deployar o contrato `atomicassets`
([pinknetworkx/atomicassets-contract](https://github.com/pinknetworkx/atomicassets-contract))
na chain local durante `init_dev_env.sh`, seguindo o mesmo padrão já estabelecido para
o `orng.wax`: clonar em `/tmp` no container `bingo_waxdev`, compilar com `cdt-cpp`,
copiar `.wasm` + `.abi` para o host, deployar a partir do volume montado.

Adicionar `ipfs/kubo` ao `docker-compose.yml` como gateway IPFS local para servir as
imagens de NFT usando os brand assets do projeto, simulando o comportamento de mainnet.

### Por que compilar-na-hora vs. vendorizar o WASM

| Critério | Compilar no init | Vendorizar WASM |
|---|---|---|
| Repositório limpo | ✅ sem binário opaco | ❌ ~500 KB binário no git |
| Reprodutibilidade | ✅ pin de tag/commit | ✅ exato |
| Tempo de setup | ~2 min (primeira vez) | imediato |
| Auditabilidade | ✅ fonte visível | ❌ binário opaco |
| Consistência com orng | ✅ mesmo padrão | ❌ diverge |

Optamos por compilar-na-hora: repositório limpo, auditável e consistente com o padrão
existente do `orng.wax`. O `.wasm` é gitignored; o `.abi` também (copiado do repo
pinknetworkx — não mantido por nós, pois é contrato externo).

### Nota sobre ABI

O `contracts/atomicassets/atomicassets.abi` **não segue o ciclo de manutenção manual**
dos nossos contratos (bingo, orng). É copiado do repositório pinknetworkx durante o
`init_dev_env.sh` e cacheado localmente. A regra "ABI sempre manual" aplica-se apenas
aos nossos contratos — para contratos externos usamos a ABI canônica deles.

## Seed de dados de desenvolvimento

| Item | Detalhe |
|---|---|
| Collection | `cryptobingo1` (author: `bingogamectr`, allow_notify: true) |
| Schema `utility` | `img` (image), `discount_pct` (uint8), `is_vip` (bool), `name` (string) |
| Schema `prize` | `name` (string, obrigatório), `img` (image), `prize_type` (string), `season` (uint32), `rarity` (string) |
| Template 1 | utility — `icon.webp`, `discount_pct=10`, `is_vip=0`, `burnable=false` |
| Template 2 | prize — `fox-mascot.png`, `season=1`, `rarity=rare`, `burnable=true` |
| nftconfig | `template_id=1` → `bingogamectr` (10% desconto, `valid_until=0` = sem expiração) |
| NFTs utility | 1 por conta: `jogador1`, `jogador2`, `sponsor1111` |
| NFT prize | 1 para vault de `bingogamectr` (sem `backed_tokens` iniciais — ver abaixo) |

**Imagens**: pinadas no IPFS local (`bingo_ipfs`) se o container estiver ativo quando
`init_dev_env.sh` rodar. Caso contrário, usam placeholder `local-icon` / `local-fox` e
podem ser repin adas com `init_dev_env.sh --envs` após `docker compose up -d`.

## Como testar backed tokens de temporada

NFTs do schema `prize` têm `burnable=true`, permitindo que o vencedor queime o NFT
para resgatar WAX/BINGO embutidos. O backing é feito via transfer para `atomicassets`
com memo `"backasset <asset_id>"`:

```bash
# 1. Descobrir asset_id do prize NFT no vault
cleos get table atomicassets bingogamectr assets

# 2. Backing com WAX (ex.: asset_id = 1099511627776)
cleos push action eosio.token transfer \
  '["bingogamectr","atomicassets","50.0000 WAX","backasset 1099511627776"]' \
  -p bingogamectr@active

# 3. Verificar backed_tokens
cleos get table atomicassets bingogamectr assets
# → backed_tokens: [{"quantity":"50.0000 WAX","contract":"eosio.token"}]

# 4. Vencedor queima para resgatar WAX
cleos push action atomicassets burnasset '["jogador1",1099511627776]' \
  -p jogador1@active
# → WAX retorna para jogador1
```

Caso de uso: prêmio de ranking de temporada — o sponsor aloca WAX no prize NFT,
o vencedor recebe via `execdrop` e pode resgatar queimando o NFT.

## Infraestrutura adicionada

| Serviço | Container | Portas |
|---|---|---|
| AtomicAssets | `atomicassets` (conta na chain) | — |
| IPFS Gateway | `bingo_ipfs` (ipfs/kubo) | 5001 (API), 8080 (gateway) |

## Variáveis de ambiente adicionadas

| Variável | Valor dev | Arquivo |
|---|---|---|
| `VITE_IPFS_GATEWAY` | `http://localhost:8080/ipfs/` | `apps/frontend/.env` |
| `VITE_ATOMIC_API` | `https://test.api.atomicassets.io` | `apps/frontend/.env` |
| `VITE_ATOMIC_CONTRACT` | `atomicassets` | `apps/frontend/.env` |
| `ATOMIC_CONTRACT` | `atomicassets` | `apps/api-gateway/.env` |

## Escopo explicitamente fora desta ADR (Fase 2)

API REST local (`eosio-contract-api`) para o painel NftAdmin usar chain local em vez
do endpoint externo de teste. Requer PostgreSQL dedicado e configuração adicional de
indexação — escopo de uma ADR futura.

## Consequências

- Fluxo NFT completo funciona em dev local: deposit → buytickets com desconto →
  execdrop / reclaimasset
- O `onnfttransfer` dispara corretamente quando `bingogamectr` é o destinatário de
  um `atomicassets::transfer` local
- O harness E2E pode testar cenários com NFT sem dependência de mainnet
- Primeiro `init_dev_env.sh --reset` demora ~2 min a mais (compilação do contrato)
- Execuções subsequentes usam cache em `contracts/atomicassets/atomicassets.wasm`

## Referências

- [pinknetworkx/atomicassets-contract](https://github.com/pinknetworkx/atomicassets-contract)
- ADR-011 — Drop Vault (integração NFT no vault)
- ADR-026 — Modelo de Permissões EOSIO (`bingogamectr@admin` para `setnftconf`)
- [init_dev_env.sh](../../init_dev_env.sh) — seção 8f
