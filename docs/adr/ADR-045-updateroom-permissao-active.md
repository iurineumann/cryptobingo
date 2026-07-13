# ADR-045 — Action `updateroom` e correção do modelo de permissões (auth `active`, não `admin`)

**Status:** Aceito
**Data:** 2026-07-09
**Autores:** Célula de Engenharia CryptoBingo
**Corrige:** ADR-026 (tabela "Admin de sala" — `updateroom` exige `active`, não `admin`)

---

## Contexto

A feature "Editar Preços da Sala" (Admin → Salas → edição) precisou de uma action
on-chain que alterasse **apenas os 3 preços de cartela** (`ticket_price_min`,
`ticket_price_max`, `ticket_price_default`) de uma sala já existente, com as mesmas
validações do `createroom` e bloqueio se houver jogo em andamento.

A action `setroommeta` (ADR-026, "Admin de sala") cobre `max_tickets_per_player`,
`room_drop_chance_bps` e `difficulty`. Os preços ficaram de fora do `setroomoommeta`
original; por isso criou-se a action dedicada `updateroom`.

### Descoberta crítica sobre o CDT 4.0.1 (altera o ADR-026)

Ao implementar `updateroom` com `require_auth(permission_level{get_self(), "admin"_n})`
(esperando espelhar `setroommeta`), o contrato compilado **exigia `bingogamectr@active`**,
não `admin`. Reproduzido via `cleos`:

- `cleos push action bingogamectr updateroom [...] -p bingogamectr@admin` (chave
  `bingogamesvc@active`) → erro `irrelevant authority 'bingogamectr@admin'; minimum
  authority is bingogamectr@active`.
- `cleos push action bingogamectr updateroom [...] -p bingogamectr@active` (chave cold
  `bingogamectr`) → **passou** na autorização (chegou ao check de jogo em andamento).

**Causa raiz:** o `cdt-cpp` 4.0.1 otimiza `require_auth(permission_level{get_self(),
"admin"_n})` para `require_auth(get_self())` **quando a permission é filha direta de
`get_self()`** (active). Ou seja, no WASM resultante, `updateroom` exige `active`, e
declarar `admin` na transação é "irrelevant authority" (active é pai de admin).

> Nota: o `setroommeta` (compilado em build anterior) manteve `admin` — o CDT só
> colapsou `admin`→`active` nos builds mais recentes. Por isso as duas actions irmãs
> passaram a ter exigências diferentes no WASM.

---

## Decisão

1. **`updateroom` exige `require_auth(get_self())` = `bingogamectr@active`.**
2. **Backend (api-gateway) assina `updateroom` como `bingogamectr@active` com a chave
   do microserviço (`MICROSERVICE_PRIVATE_KEY` = `bingogamesvc@active`).** Para isso
   funcionar, a hierarchy da conta `bingogamectr` foi estendida:
   ```
   bingogamectr
   ├── @active  → cold key + eosio.code
   │             + bingogamesvc@active   (w:1)  ← NOVO: microserviço satisfaz active
   │             SOMENTE actions que exigem active (ex: updateroom)
   └── @admin   → threshold 1
                   ├── bingogamectr@active  (w:1)
                   └── bingogamesvc@active  (w:1)  ← microserviço satisfaz admin
   ```
   Comando (testnet, via `cleos` com cold key `bingogamectr@active`):
   ```bash
   cleos set account permission bingogamectr active \
     '{"threshold":1,"keys":[],"accounts":[
        {"permission":{"actor":"bingogamectr","permission":"active"},"weight":1},
        {"permission":{"actor":"bingogamesvc","permission":"active"},"weight":1}
      ],"waits":[]}' owner -p bingogamectr@active
   ```
3. **`getAdminSession()` (roomController.ts) continua declarando `permission: 'admin'`
   para `setroommeta`, e a action `updateroom` é montada com `permission: 'active'`
   (mesmo `session`/chave `bingogamesvc`).** Ou seja, um único `Session` Wharfkit
   (actor `bingogamectr`, chave `bingogamesvc`) emite ambas as autorizações.
4. **`updateroom` é enxuto:** altera apenas os 3 preços. Campos de sala que não são
   preço (max_tickets, drop_chance, difficulty) continuam via `setroommeta`
   (`admin`).

### Assinatura (on-chain)

```cpp
// Altera os preços de ticket de uma sala existente.
// Mesma validação do createroom; bloqueia se há jogo em andamento.
void bingo_contract::updateroom(
    uint64_t       room_id,
    extended_asset ticket_price_min,
    extended_asset ticket_price_max,
    extended_asset ticket_price_default
) {
    require_auth(get_self());                 // exige bingogamectr@active
    // ...validação: min>0, max>=min, default em [min,max],
    //     os 3 preços mesmo token (símbolo+contract)...
    // bloqueia se status=="closed" ou current_game_id!=0
}
```

### Endpoint (api-gateway)

`PUT /api/v1/rooms/{roomId}/settings` monta até 2 actions:
- `setroommeta` (admin) — `max_tickets_per_player`, `room_drop_chance_bps`, `difficulty`.
- `updateroom` (active) — só quando ao menos um dos 3 preços é informado.

---

## Consequências

**Positivas:**
- Edição de preços da sala funciona end-to-end via backend (sem cold key).
- `bingogamectr` continua sendo **apenas** para `cleos set contract` (deploy);
  todas as operações online usam `bingogamesvc@active` (via `admin` ou `active`).
- Sem regressão em `setroommeta` (admin) nem nas actions `active` do contrato.

**Negativas / trade-offs:**
- A hierarchy `active` agora também aceita `bingogamesvc@active` (blast radius do
  microserviço cresce de `admin` para `active`). Mitigado porque as únicas actions
  `active` chamadas por serviços são `updateroom` + as FSM do worker (`bingogamesvc`
  direto). `setconfig`/`settreasury`/`sweepggr` continuam exigindo a cold key.
- O ADR-026 precisa de errata (abaixo) — a tabela "Admin de sala" estava incorreta
  para `updateroom`.

**Impacto em testes:**
- Harness/backend: `updateroom` deve ser testado com a sessão que assina `active`.
- Documentação (SPEC §2.4, openapi §/rooms/{id}/settings, CLAUDE.md auth) atualizada.

---

## Referências

- ADR-026 (modelo de permissões `bingogamectr@admin`) — corrigido por este ADR.
- `contracts/bingo/src/bingo.cpp` — `updateroom` (linha ~1587).
- `apps/api-gateway/src/controllers/roomController.ts` — `updateRoomSettings`.
- CLAUDE.md — "Modelo de auth (ADR-026)" atualizado.
- SESSION-SUMMARY 2026-07-09 (RAG tag `session-summary`).
