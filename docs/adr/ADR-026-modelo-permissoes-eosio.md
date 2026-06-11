# ADR-026 — Modelo de Permissões EOSIO: `bingogamectr@admin`

**Status:** Aceito  
**Data:** 2026-06-11  
**Contexto:** Segurança de chaves privadas nos serviços online

---

## Problema

O api-gateway e o worker carregavam `CONTRACT_PRIVATE_KEY` (chave do dono do contrato,
`bingogamectr@active`) em memória em runtime. Comprometer qualquer um dos dois processos daria
controle total do contrato — incluindo `settreasury`, `sweepggr` e `setconfig` —, que são ações de
altíssimo impacto financeiro. A superfície de ataque era desnecessariamente ampla: os serviços
online não precisam de permissão de owner para operar.

---

## Decisão

Criar a permissão customizada **`bingogamectr@admin`** no sistema de permissões nativo do
WAX/Antelope. Essa permissão tem threshold 1 e dois signatários autorizados:

- `bingogamectr@active` (weight 1) — o owner sempre pode chamar
- `bingogamesvc@active` (weight 1) — o microserviço opera via api-gateway e worker

No contrato, as actions **operacionais** (chamadas pelos serviços online) trocam
`require_auth(get_self())` por `require_auth2(get_self(), "admin"_n)`. As actions **financeiras
críticas** (`setconfig`, `settreasury`, `sweepggr`) mantêm `require_auth(get_self())` e só podem
ser chamadas com a cold key do owner.

---

## Hierarquia de permissões resultante

```
bingogamectr
├── @owner          → cold key (fora dos serviços online)
├── @active         → cold key + eosio.code
│                     SOMENTE: setconfig, settreasury, sweepggr
└── @admin          → threshold 1
                      ├── bingogamectr@active  (w:1)  ← owner pode sempre
                      └── bingogamesvc@active  (w:1)  ← microserviço opera
                      Cobre: creategame, addpattern/delpattern, addgametype/delgametype,
                             setstages, setcombos, setnftconf/delnftconf,
                             createroom, activateroom, pauseroom, closeroom, setroommeta,
                             linkcampaign, closecmpgn, allocatedrop, deallocdrop
```

---

## Modelo de auth por action (fonte de verdade)

| Categoria | Actions | Auth no contrato | Assinante nos serviços |
|---|---|---|---|
| Config crítica | `setconfig`, `settreasury`, `sweepggr` | `require_auth(get_self())` = `@active` | cleos direto (cold key) |
| Admin operacional | `creategame`, `addpattern`, `delpattern`, `addgametype`, `delgametype`, `setstages`, `setcombos`, `setnftconf`, `delnftconf` | `require_auth(permission_level{get_self(),"admin"_n})` | api-gateway / worker como `bingogamectr@admin` com chave `bingogamesvc` |
| Admin de sala | `createroom`, `activateroom`, `pauseroom`, `closeroom`, `setroommeta` | `require_auth(permission_level{get_self(),"admin"_n})` | api-gateway como `bingogamectr@admin` com chave `bingogamesvc` |
| Multi-party | `linkcampaign`, `closecmpgn` | `require_auth(permission_level{get_self(),"admin"_n})` OU `has_auth(sponsor)` | api-gateway (`bingogamectr@admin`) ou sponsor direto |
| Multi-party drop | `allocatedrop`, `deallocdrop` | `require_auth(permission_level{get_self(),"admin"_n})` OU `has_auth(owner)` | api-gateway (`bingogamectr@admin`) ou owner direto |
| FSM microserviço | `fundgame`, `lockgame`, `startdraw`, `claimwin`, `claimcombo`, `claimstage`, `closegame`, `execdrop` | `require_auth("bingogamesvc"_n)` | worker como `bingogamesvc@active` |
| Abort dual | `abortgame` | `has_auth(bingogamesvc)` OU `require_auth(permission_level{get_self(),"admin"_n})` | worker (`bingogamesvc@active`) ou `bingogamectr@admin` — cold key removida |
| Permissionless | `refundticket`, `cleargame` | status check apenas | qualquer um |
| Buyer/owner | `buytickets`, `withdraw`, `reclaimasset` | `require_auth(buyer/owner)` | player on-chain |
| Oracle | `receiverand` | `require_auth("orng.wax"_n)` | oráculo |

---

## Sessões Wharfkit por serviço

### api-gateway (4 controllers)
```typescript
// Única sessão necessária — assina como bingogamectr@admin com chave do bingogamesvc
new Session({
    actor:        'bingogamectr',
    permission:   'admin',
    walletPlugin: new WalletPluginPrivateKey(process.env.MICROSERVICE_PRIVATE_KEY),
})
```

### worker-game-loop (blockchain.ts)
```typescript
// FSM — actions require_auth("bingogamesvc"_n)
export const microserviceSession = new Session({
    actor: 'bingogamesvc', permission: 'active',
    walletPlugin: new WalletPluginPrivateKey(process.env.MICROSERVICE_PRIVATE_KEY),
});

// Admin operacional — apenas creategame (require_auth2(get_self(), "admin"_n))
export const adminSession = new Session({
    actor: 'bingogamectr', permission: 'admin',
    walletPlugin: new WalletPluginPrivateKey(process.env.MICROSERVICE_PRIVATE_KEY),
});
// CONTRACT_PRIVATE_KEY não é mais necessária no worker
```

---

## Setup on-chain (init_dev_env.sh)

```bash
cleos set account permission bingogamectr admin \
  '{"threshold":1,"keys":[],"accounts":[
    {"permission":{"actor":"bingogamectr","permission":"active"},"weight":1},
    {"permission":{"actor":"bingogamesvc","permission":"active"},"weight":1}
  ],"waits":[]}' active -p bingogamectr@active

# linkauth: restringe quais actions a permissão admin pode chamar
for ACTION in creategame setnftconf delnftconf addpattern delpattern \
              addgametype delgametype setstages setcombos \
              createroom activateroom pauseroom closeroom setroommeta \
              linkcampaign closecmpgn allocatedrop deallocdrop; do
    cleos set action permission bingogamectr bingogamectr $ACTION admin \
      -p bingogamectr@active
done
```

---

## Consequências

**Positivas:**
- `CONTRACT_PRIVATE_KEY` removida de todos os serviços online — owner key vira cold key
- Blast radius reduzido: comprometer api-gateway ou worker não dá acesso a `settreasury`/`sweepggr`
- `linkauth` restringe quais actions `bingogamectr@admin` pode chamar (defesa em profundidade)
- Padrão alinhado à melhor prática WAX/Antelope para aplicações multi-serviço

**Negativas/trade-offs:**
- Requer ciclo completo de deploy do contrato (mudança de `require_auth` → `require_auth2`)
- `init_dev_env.sh --reset` deve criar a permissão antes de qualquer operação online

**Impacto em testes:**
- Harness e2e: deve usar a nova sessão `adminSession` para actions admin (se aplicável)
- Mocks do worker: ajustar `contractSession` → `adminSession` nos arquivos `.test.ts`

---

## Referências

- EOSIO Permission System: `updateauth`, `linkauth`, `require_auth2`
- ADR-023 (contas mainnet) — define `bingogamectr`, `bingogamesvc`, `bingogametkn`
- CLAUDE.md — Modelo de auth (atualizado junto com este ADR)
