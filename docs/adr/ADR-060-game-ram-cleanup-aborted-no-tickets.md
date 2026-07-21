# ADR-060 — Limpeza Automática de Jogos Abortados Sem Cartelas

**Status:** Implementado (testnet)
**Data:** 2026-07-21

---

## Contexto

A tabela `games` do contrato `bingogamectr` acumulou ~23.000+ linhas de jogos
que foram abortados sem nunca terem vendido cartelas (`total_wagered == 0`).

Cada linha na tabela `games` (struct `game_state`, ~200 bytes serializada) é paga
pelo próprio contrato (`get_self()` como payer no `games.emplace`). O acúmulo
causou incidente de RAM insuficiente em 2026-07-19, resolvido com compra de
1000 WAX. Sem prevenção, o problema se repete.

O fluxo atual:
1. Worker chama `creategame` → row criada com RAM paga pelo contrato
2. Jogo fica em `funding` → ninguém compra → timeout
3. Worker chama `abortgame` → status muda para `aborted`, mas row permanece
4. RAM nunca é liberada, a menos que alguém chame `cleargame` manualmente

## Decisão

Duas mudanças no contrato:

### 1. `abortgame` — auto-delete se 0 tickets

Quando `abortgame` é chamado e `total_wagered.quantity.amount == 0` (ninguém
comprou cartela), o contrato faz `games.erase()` em vez de marcar `status=aborted`.
A RAM é devolvida ao payer (o contrato) imediatamente.

Se `total_wagered > 0` (jogo vendeu cartelas), o comportamento continua o mesmo:
`status=aborted` + reembolso via `refundticket`.

**Segurança:** `total_wagered` é a soma de todos os tickets comprados. Amount=0
= zero tickets vendidos. Não há risco de delete de jogo com cartelas vendidas.

### 2. `clearbatch` — limpeza em lote de jogos aborted existentes

Nova action que recebe `vector<uint64_t> game_ids`, valida cada jogo
(`aborted + total_wagered == 0`), libera a sala (`current_game_id = 0`) e
dá `games.erase`. Exige auth `admin`.

Permite limpar os ~23.000 jogos existentes em lotes de 50-100 por transação
(~230-460 txs) sem precisar de 23.000 txs de `cleargame` individuais.

## Alternativas Consideradas

1. **Worker chama `cleargame` pós-abort** — 2 txs por jogo, +CPU, +latência.
   Rejeitada.

2. **Adiar `creategame` até primeiro buy** — Muda fluxo inteiro, worker gerencia
   "pending game" off-chain, risco de race. Rejeitada.

3. **`clearallaborted` (varre tabela internamente)** — 1 tx mas pode estourar
   CPU bill com 23K jogos. Rejeitada; `clearbatch` é mais controlável.

## Consequências

**Positivas:**
- RAM do contrato não acumula para jogos sem cartelas (preventivo)
- Limpeza dos 23K existentes via script + `clearbatch` em lotes
- `clearbatch` é seguro (valida total_wagered == 0, não afeta jogos com tickets)

**Negativas:**
- `clearbatch` adiciona 1 action ao contrato (aumenta wasm em ~5KB)
- Script de limpeza leva algumas centenas de transações (~10 minutos)
- Jogos aborted sem cartelas perdem a linha na tabela — não é possível consultar
  histórico on-chain desses jogos (aceitável: são jogos sem relevância)

**Neutras:**
- `abortgame` com 0 tickets agora é destrutivo (erase vs modify) — compatível
  com worker existente (o worker só lê status de jogos ativos, não aborted)

## Arquivos Modificados

- `contracts/bingo/src/bingo.cpp` (+35 linhas): `abortgame` early-return se 0
  tickets + `clearbatch` implementação
- `contracts/bingo/include/bingo.hpp` (+1 linha): `clearbatch` declaração
- `contracts/bingo/bingo.abi` (+14 linhas): struct + action `clearbatch`
- `contracts/bingo/bingo.wasm` (regenerado): bytecode com as duas mudanças

## Deploy

- **Testnet:** 2026-07-21, TXs:
  - `set code`: e5c3f97501f47fa4e87f0361e0d8d01971945707cc959b1ff726c744f5011c47
  - `set abi`: 3bf91310df0c4050a51dc023b0da33baa707a1574fa43c7c953fc07ae15e53ff
  - `updatelegacy`: 7cec1076be93f81b400b0418c45ac1a9ed655b917b63babc4a557e18fb3e6953

## Referências

- Plano: `.hermes/plans/2026-07-21_game-ram-cleanup-aborted-no-tickets.md`
- Script limpeza: `.hermes/plans/stream_clear_aborted.py`
- Incidente RAM prévio: `agent://bugs/2026-07-19-bingogamectr-ram-resolvido-firehose-fallback`
