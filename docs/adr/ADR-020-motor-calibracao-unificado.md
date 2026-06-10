# ADR-020: Motor de Calibração e Sugestão Unificado (Backend)

**Data:** 2026-06-09
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O motor de sugestão de pesos e combinações estava dividido entre frontend e backend com
responsabilidades sobrepostas e heurísticas concorrentes:

1. **Frontend** (`GametypesAdmin.tsx`): gerava combos via backtracking (`all_of` não-sobrepostos),
   precificava por similaridade Jaccard com especiais, computava pesos iniciais via
   `computeInitialWeights` (inverse hit_rate + sqrt(dificuldade)), e depois chamava o backend
   para calibração final.
2. **Backend** (`monteCarloController.ts`): `calibrateWeights` executava descoberta → Laplace →
   algébrico → refinamento estocástico → validação, mas **sem conhecimento** de `pattern_type`,
   sem hierarquia de combos, sem validação de teto do master, sem detecção de conflito de máscaras.

Isso produzia:
- **4 heurísticas de precificação concorrentes** (frontend inverse-hit-rate, Jaccard, backend algébrico,
  refinamento estocástico) — instabilidade numérica e divergência entre sugestão e resultado final.
- **Combos exclusivamente `all_of`** — ignorando `n_of_type` (mais abrangente) e `any_of`.
- **Sem verificação de conflito**: combos que reconstroem padrões existentes (ex: ROW_0 + COL_N + ROW_4 = "I").
- **Sem teto do master**: combos podiam ter weight superior ao master, quebrando a hierarquia de domínio.
- **Ida-e-volta frontend↔backend**: 2 chamadas HTTP (simulate + calibrate) com lógica duplicada.

---

## Decisão

### 1. Unificar todo o motor de sugestão no backend

O frontend passa a ser um **thin orchestrator**: envia os parâmetros do gametype em uma única
requisição e recebe pesos + combos prontos para aplicar. Toda a lógica de geração de combos,
precificação e calibração vive no backend.

### 2. Hierarquia de combos

O gerador produz combos na seguinte ordem de preferência (da mais abrangente para a mais específica):

1. **N-do-Tipo** (`n_of_type`): para `simple`, `special` e `master`, variando N de 2 até o máximo
   disponível (limitado a 5 para simples, 3 para especiais, 1 para master).
2. **Qualquer** (`any_of`): quando faz sentido semântico (ex: "qualquer especial + qualquer simples").
3. **Todos** (`all_of`): apenas para pares específicos que não conflitam com padrões existentes.

### 3. Validações obrigatórias na geração

- **Teto do master**: nenhum combo pode ter `weight > master_weight` (se master existe no gametype).
  Em modos `firstfull` onde master é variável, o teto é o weight do master configurado.
- **Conflito de máscara**: se `mask(combo) & ~FREE_SPACE === mask(pattern) & ~FREE_SPACE`, o combo
  é rejeitado (já existe como padrão individual).
- **Sobreposição de combos**: combos que são subconjuntos de outros combos são eliminados
  (ex: "ROW_0 + COL_B" e "ROW_0 + COL_B + ROW_4" — só o maior sobrevive se tiver weight maior).

### 4. Pipeline unificada (`suggest-combos`)

```
POST /api/v1/admin/suggest-combos
{
  patterns: [{ pattern_id, name, mask, weight, pattern_type }],
  base_multiplier,
  draw_mode,
  max_balls,
  target_rtp (default 0.85)
}
```

Retorna:
```
{
  pattern_weights: Record<string, number>,   // pesos calibrados por padrão
  combos: [{ name, weight, clauses }],        // combos gerados + calibrados
  validation: SimulationResult,               // validação estocástica final
  is_viable: boolean,
  alerts: string[]
}
```

Pipeline interna:
1. **Descoberta** (Fase 1): mede hit_rates de cada padrão com max_balls limitado.
2. **Geração de combos** (Fase 2): usando a hierarquia, com pesos iniciais derivados da
   dificuldade real (células + co-ocorrência + complexidade topológica).
3. **Calibração algébrica** (Fase 3): escala global com weights clampados em [1, 25500]
   e respeitando teto do master.
4. **Refinamento estocástico** (Fase 3b): mini-sims corrigindo gap do max_weight.
5. **Validação** (Fase 4): simulação final com todos os padrões + combos.

### 5. Remoção de heurísticas concorrentes

- `computeInitialWeights` no frontend é substituído pela calibração algébrica do backend.
- Precificação Jaccard de combos é substituída por modelo baseado em:
  - **Células totais** do combo (soma das células dos padrões membro).
  - **Co-ocorrência estimada**: P(A∩B) ≈ P(A) × P(B) para padrões independentes.
  - **Densidade topológica**: fator de correção baseado em quão disperso vs. concentrado
    é o desenho resultante.
  - **Teto do especial mais próximo**: o weight do combo é limitado pelo weight do padrão
    especial com desenho mais similar (Jaccard), ajustado pela diferença de dificuldade.

---

## Consequências

### Positivas
- **Fonte única da verdade** para precificação: o backend.
- **Redução de ~300 linhas** de lógica concorrente no frontend.
- **Combos mais inteligentes**: hierarquia respeitada, sem conflitos, com teto do master.
- **Consistência**: o que o admin vê na sugestão é exatamente o que vai on-chain.
- **Performance**: uma única chamada HTTP substitui 2+ chamadas + processamento local.

### Negativas/Riscos
- Backend fica mais pesado computacionalmente (geração + calibração numa só rota).
  Mitigado por: combo generator é O(n²) com n = padrões (tipicamente < 20), e a calibração
  algébrica é instantânea (sem RNG). O gargalo continua sendo a simulação (Fase 1/4),
  que já executa em worker threads.
- Mudança no frontend: `handleSuggest` precisa ser refatorado. Aproveitamos para simplificar.

---

## Referências

- ADR-005 (max_weight payout / RTP-GGR)
- ADR-016 (combinações on-chain)
- ADR-004 (bitmasking)
- `monteCarloController.ts` — estado anterior do motor
- `GametypesAdmin.tsx` — `handleSuggest`, `computeInitialWeights`, `buildCombos`
