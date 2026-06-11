# ADR-023 — Mapeamento de Contas WAX Mainnet

**Status:** Accepted
**Data:** 2026-06-11
**Decisores:** Iuri Neumann, Claude

---

## Contexto

O CryptoBingo foi originalmente desenvolvido com contas WAX de teste (`bingo.game`,
`bingo.token`, `bingo.swap`, `microservice`) para prototipagem e validação local. Com a
proximidade do mainnet, tornou-se necessário definir contas oficiais de 12 caracteres que
sejam:
- **semanticamente claras** (auto-descritivas sobre o papel de cada conta)
- **disponíveis na WAX mainnet**
- **consistentes** entre ambientes (dev ↔ staging ↔ prod)

As 4 chaves públicas (owner + active) foram geradas e registradas na WAX mainnet, e as
contas foram criadas.

---

## Decisão

### Mapeamento oficial

| Papel | Conta antiga (dev/test) | Conta nova (mainnet) |
|---|---|---|
| Contrato de jogo (core) | `bingo.game` | `bingogamectr` |
| Contrato do token BINGO | `bingo.token` | `bingogametkn` |
| Contrato AMM swap | `bingo.swap` | `bingogameswp` |
| Worker off-chain (auth de jogo) | `microservice` | `bingogamesvc` |

### Chaves públicas

```
bingogamectr
  owner:  PUB_K1_4yGYd5m8iJhR15J27voUBFeo8J3YW9D4No4sbg8irUGrnzSTHm
  active: PUB_K1_6RWLJRCaqoHjsJuoWXzR6PgsNbHsDjNUj1mG3guBLCXaqyfm97

bingogametkn
  owner:  PUB_K1_6Z8iq26yCCnxydDC7xPWaS9oJF6LNgZRvuz99M58B98A6tFv9S
  active: PUB_K1_7XDQkh6TY9VW2kWPq1eTzumxRa7o1XN99ce9fAkG38GtdzWctk

bingogameswp
  owner:  PUB_K1_7w6Bit237Q1YuQBdrnpAkpRMT17QcKavgqCsARTgwDxbNpNPPm
  active: PUB_K1_8Dex4pMcZd4JJUWu78GEA1AuvsojJSDk59SMDXWGWtPdAVQ67y

bingogamesvc
  owner:  PUB_K1_6UVCGQhGWWMqhfL8teh6bZ7wQkM9SYDRk3dtveZBm9uQGTUXzi
  active: PUB_K1_5eMvtKTYmnVnqaQik42LFGahMA6Xkkd3PB6d15ni6SqB3A5EBB
```

### Contas que NÃO foram alteradas

- `orng.wax` — oráculo oficial WAX, não é conta nossa
- `eosio.token` — contrato sistêmico WAX
- `atomicassets` — padrão NFT WAX
- Contas de teste dev (`jogador1`, `jogador2`, `gameadmin11`, `contractad1`,
  `sponsor1111`) — não têm contraparte mainnet

---

## Impacto

### Positivo
- Nomes semanticamente claros e consistentes em todos os ambientes
- Contas registradas na mainnet com as chaves corretas
- Facilita deploy em staging/prod sem remapeamento

### Negativo
- Mudança intrusiva (~60+ arquivos alterados entre C++, TS, docs, infra)
- `init_dev_env.sh` precisou ser refatorado para usar os novos nomes e gerar
  chaves locais para dev (as chaves mainnet são só para prod)
- Workers em execução precisam ser reiniciados após a mudança

### Modelo de autorização

mantido (inalterado):
- Actions admin → `require_auth(get_self())` (= `bingogamectr`)
- Actions de jogo → `require_auth("bingogamesvc"_n)`
- Swap admin → `require_auth(get_self())` (= `bingogameswp`)

---

## Implementação

Ver `TASKS.md` para o checklist completo da migração. O commit que aplica esta
decisão altera:
1. Contratos C++ (`bingo.{hpp,cpp}`, `swap.{hpp,cpp}`)
2. Script `init_dev_env.sh` (criação de contas, deploy, env vars)
3. Serviços backend (worker, api-gateway, blockchain-core, shared-types)
4. Frontend + swap-ui (env vars, componentes, branding)
5. Testes (harness, e2e-ui fixtures)
6. Documentação (CLAUDE.md, SPEC.md, ADRs, skills)
7. Infra (k8s configmap, docker-compose, CI workflow)

---
