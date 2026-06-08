---
name: weights-calibration
description: >
  Economia/tokenomics do CryptoBingo: calibração de pesos de padrões/combinações via
  simulação Monte Carlo para atingir RTP 85% / GGR 15%. Use ao mexer no
  monteCarloController, em pesos de gametype, ou ao avaliar viabilidade econômica de
  um gametype/combinação.
---

# Economia — Calibração de Pesos (Monte Carlo)

Objetivo do produto: **RTP 85% / GGR 15%**. Os pesos (hundredths) de padrões e combinações definem
o prêmio (`payout = price × base_multiplier × weight / 100`). Calibrá-los errado quebra a economia.

## Onde fica

- **API:** `apps/api-gateway/src/controllers/monteCarloController.ts` — endpoints de **simulação**
  (`simulateWeights`) e **calibração** (`calibrateWeights`). Testes: `monteCarloController*.test.ts`.
- **Frontend (admin):** `GametypesAdmin.tsx` consome `simulateWeights` / `calibrateWeightsApi` de
  `services/api.ts` ao criar/editar gametype (sugestão de pesos + viabilidade).

## Como a calibração funciona (conceito)

Pipeline determinístico (substitui loop estocástico divergente):
1. Descoberta empírica (~20k rodadas, sem ruído por iteração) das probabilidades de cada padrão.
2. Suavização de Laplace (epsilon p/ P=0 — evita ÷0 e ancora o MASTER).
3. Calibração algébrica em memória (sem RNG; convergência garantida) p/ atingir o `target_rtp`.
4. Validação estocástica final (prova dos nove, ~10k rodadas).

Entrada: padrões (`{pattern_id, name, mask, weight, pattern_type}`) + **combinações** (mesmas
cláusulas do ADR-016) + `base_multiplier` + `max_balls` + `target_rtp` (0.85). Saída:
`pattern_weights` + `combo_weights` calibrados + RTP/GGR resultantes + alertas + `is_viable`.

## Regras / invariantes

- Pesos resultantes em hundredths, **1–25500** (cap 255×, validado no contrato).
- Combinações entram na simulação com a MESMA semântica de satisfação do worker
  (all_of/any_of/n_of_type) e da regra **max_weight** (a cartela leva o maior prêmio elegível).
  Ao mudar a lógica de payout do worker, **reflita aqui** ou a calibração diverge da realidade.
- Calibrar é caro (muitas rodadas) → roda sob demanda no admin, não no caminho do jogador.
- Mudança na economia/fórmula → ADR (ver ADR-005 fixed-odds/RTP-GGR).

## Checklist ao alterar pesos/economia

- [ ] Simular e conferir RTP ≈ 0.85 / GGR ≈ 0.15 e `is_viable`.
- [ ] Combos incluídos na simulação com a semântica correta (max_weight + cláusulas).
- [ ] Pesos finais dentro de 1–25500.
- [ ] Persistir on-chain (padrões via `addgametype`/rules; combos via `setcombos`) + Mongo coerente.
- [ ] Testes do monteCarloController verdes; ADR se a fórmula mudou.
