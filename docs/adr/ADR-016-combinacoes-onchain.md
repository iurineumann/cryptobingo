# ADR-016: Combinações de Padrões como Tier de Prêmio On-Chain

**Data:** 2026-06-07
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O sistema permitia cadastrar **combinações de padrões** (ex.: "2 Simples" = completar 2 padrões
simples quaisquer) com peso próprio, exibidas na sala. Porém as combinações viviam **somente
off-chain** (MongoDB) e eram puramente decorativas: o pagamento real on-chain (`claimwin`) só
considerava o **peso do padrão individual** de maior valor por cartela (regra max_weight, ADR-005).
Combinações eram, portanto, **ignoradas na liquidação** — um jogador que satisfazia "2 Simples"
recebia apenas o maior padrão simples, não o prêmio da combinação.

Além disso, a persistência das combinações era frágil: gravadas só na criação do gametype, com
falha silenciosa, sem fluxo de edição — o que deixava gametypes sem combinações registradas.

---

## Regras

1. Uma **combinação** tem `weight` próprio (hundredths, 100 = 1×) e cláusulas que definem quando é
   satisfeita: `all_of` (todos os padrões), `any_of` (qualquer um) ou `n_of_type` (N padrões de um
   tipo: simple/special/master).
2. Por cartela, paga-se o **maior peso** entre {padrões vencedores, combinações satisfeitas}
   (max_weight global — extensão natural do ADR-005). Combinações aninhadas (ex.: "2 Simples" ⊂
   "6 Simples") são resolvidas automaticamente: só a de maior peso paga.
3. O prêmio segue a fórmula padrão: `ticket.price × base_multiplier × combo.weight / 100`,
   aceitando `golden_multiplier` (ADR-014).

---

## Decisões

### 1. Peso da combinação é a fonte-de-verdade **on-chain**; cláusulas ficam **off-chain**

Validar cláusulas (all_of/any_of/n_of_type) e tipos de padrão (simple/special/master) on-chain
seria caro e exigiria replicar metadados off-chain. Em vez disso, espelhamos o modelo já provado
de `claimwin`/`claimstage`: **o contrato confia no worker para a avaliação da satisfação** (assim
como confia no match de padrão), mas **valida o peso** contra um registro on-chain — impedindo que
um worker comprometido infle o prêmio.

```cpp
struct combo_rule {
    uint64_t combo_id;   // índice canônico estável (0..n-1), espelha o off-chain
    uint16_t weight;     // peso do prêmio em hundredths (100 = 1×)
};
```

`gametype_record` ganha `eosio::binary_extension<std::vector<combo_rule>> combinations`.

### 2. `binary_extension` para compatibilidade retroativa

Adicionar um campo a uma tabela com linhas existentes quebra a desserialização (`unpack_exception`).
Usar `binary_extension` (tipo ABI `combo_rule[]$`) torna o campo opcional no fim do registro:
linhas escritas antes do upgrade leem `combinations` como ausente/vazio. Verificado em produção
(dev chain) após o deploy.

### 3. Actions `setcombos` e `claimcombo`

- `setcombos(gametype_id, combinations)` — registra/substitui o vetor de combos. Valida `combo_id`
  único e `weight` ∈ [1, 25500]. Auth `get_self()` (admin). Espelha `setstages`.
- `claimcombo(game_id, ticket_id, ball_count, combo_id, golden_multiplier)` — paga o tier de
  combinação; valida `combo_id` contra `gametype.combinations` e usa o weight registrado on-chain.
  Auth `bingogamesvc`. Espelha `claimwin`.

### 4. Sincronização off-chain → on-chain (API)

`PUT /admin/gametypes/:id/metadata` (`upsertGametypeMetadata`) passa a:
1. atribuir `combo_id = índice` canônico e validar o peso;
2. persistir as combinações (com `combo_id` + cláusulas) no MongoDB;
3. **empurrar `setcombos` on-chain** (fonte-de-verdade do peso);
4. invalidar o cache Redis do worker.

Falha no passo 3 retorna erro explícito (evita drift Mongo↔chain silencioso). O fluxo de criação e o
novo fluxo de **edição de combinações** de gametypes existentes (admin UI) usam esse mesmo caminho.

### 5. Consumo pelo worker

`combinationEvaluator.ts` busca combos+cláusulas+tipos do endpoint `GET /gametypes/:id/patterns`
(cache 1 min). Por cartela, `selectBestPayout` escolhe o max_weight global entre padrões e
combinações satisfeitas; combinação → `executeClaimCombo`, senão `executeClaimWin`. A regra
max_weight do ADR-005 é preservada e estendida.

---

## Fluxo de Dados

```
Admin UI ──PUT /metadata──> API ──┬──> MongoDB (combos + cláusulas + combo_id)
                                  └──> setcombos on-chain (combo_id → weight)  ← fonte de verdade do peso
                                              │
Worker (resolução) ──GET /patterns──> cláusulas+tipos        gametype.combinations (peso validado)
   │ por cartela: max_weight{padrões, combos satisfeitos}
   └── combo? claimcombo(combo_id) : claimwin(mask)  ──> contrato valida weight on-chain ──> paga
```

---

## Segurança

- **Anti-inflação de prêmio:** o worker não escolhe o valor — envia `combo_id`; o contrato deriva o
  peso do registro on-chain. Combo inexistente → revert (`combo_id nao encontrado`).
- **Auth:** `setcombos` = admin (`get_self`); `claimcombo` = `bingogamesvc`. Idêntico ao restante.
- **Determinismo:** sem RNG; pagamento é função pura de (preço, base_multiplier, weight, golden).

---

## Testes

- **Worker unit (12):** `isComboSatisfied` (n_of_type/all_of/any_of), `bestSatisfiedCombo`
  (max_weight entre combos aninhados).
- **Harness E2E (Suite 8, 5 — live com oracle real):** `setcombos` registra on-chain; `claimcombo`
  paga `price×base×weight/100` (delta de balance verificado = 25 WAX); `combo_id` inexistente
  reverte; `closegame` → archived; backward-compat de leitura de linhas antigas.

---

## Consequências

**Positivas:** combinações passam a ser pagas de fato; superfície on-chain mínima; backward-compat;
consistência com stages/claimwin; persistência confiável + edição.

**Trade-offs:** peso duplicado (Mongo + chain) exige sincronização — mitigada centralizando no
`upsertGametypeMetadata` com erro explícito em caso de drift. A satisfação das cláusulas continua
confiando no worker (mesma premissa de `claimwin`), aceitável pelo modelo de confiança do
`bingogamesvc`.

---

## Referências

- ADR-005 (max_weight payout / RTP-GGR), ADR-013 (stages — modelo espelhado), ADR-014 (golden).
- Contrato: `contracts/bingo/{include/bingo.hpp,src/bingo.cpp}`, `contracts/bingo/bingo.abi`.
- Worker: `apps/worker-game-loop/src/services/{combinationEvaluator,evaluator,blockchain}.ts`.
- API: `apps/api-gateway/src/controllers/patternController.ts`.
- Frontend: `apps/frontend/src/components/{GameRoom,ticketUtils,admin/GametypesAdmin}.tsx`.
