// apps/api-gateway/src/services/comboGenerator.ts
// Gerador hierárquico de combinações para sugerir ao admin.
//
// Hierarquia (ADR-020 §2):
//   1. N-do-Tipo (n_of_type) — mais abrangente
//   2. Qualquer (any_of)
//   3. Todos (all_of) — mais específico
//
// Validações:
//   - Teto do master: combo.weight ≤ master.weight
//   - Conflito de máscara: combo não pode reconstruir pattern existente
//   - Redundância: combos subconjunto de outros são eliminados
//
// Pesos iniciais derivados de:
//   - Células totais do combo
//   - Co-ocorrência estimada (P(A∩B) ≈ P(A) × P(B))
//   - Densidade topológica (dispersão do desenho)
//   - Teto do especial mais similar (Jaccard)

const FREE_SPACE_BIT = 12;
const WEIGHT_MIN = 1;
const WEIGHT_MAX = 25_500;

export interface PatternInfo {
    pattern_id:   number | string;
    name:         string;
    mask:         number;
    weight:       number;
    pattern_type: string; // 'simple' | 'special' | 'master'
}

export interface ClauseInput {
    type:          'all_of' | 'any_of' | 'n_of_type';
    pattern_ids?:  string[];
    pattern_type?: string;
    count?:        number;
}

export interface ComboCandidate {
    name:    string;
    weight:  number;
    clauses: ClauseInput[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cellCount(mask: number): number {
    let count = 0;
    for (let b = 0; b < 25; b++) {
        if (b !== FREE_SPACE_BIT && (mask & (1 << b))) count++;
    }
    return count;
}

function cleanMask(mask: number): number {
    return mask & ~(1 << FREE_SPACE_BIT);
}

function maskSimilarity(a: number, b: number): number {
    const ca = cleanMask(a);
    const cb = cleanMask(b);
    let inter = 0, union = 0;
    for (let bit = 0; bit < 25; bit++) {
        if (bit === FREE_SPACE_BIT) continue;
        const hasA = (ca & (1 << bit)) !== 0;
        const hasB = (cb & (1 << bit)) !== 0;
        if (hasA && hasB) inter++;
        if (hasA || hasB) union++;
    }
    return union > 0 ? inter / union : 0;
}

function combinedMask(patterns: PatternInfo[], ids: (string | number)[]): number {
    let m = 0;
    for (const id of ids) {
        const p = patterns.find(x => String(x.pattern_id) === String(id));
        if (p) m |= p.mask;
    }
    return m;
}

// ── Conflitos e validação ────────────────────────────────────────────────────

function conflictsWithExisting(comboMask: number, patterns: PatternInfo[]): boolean {
    const cm = cleanMask(comboMask);
    for (const p of patterns) {
        if (cleanMask(p.mask) === cm) return true;
    }
    return false;
}

function hasSubsetConflict(combo: ComboCandidate, existing: ComboCandidate[]): boolean {
    const idsA = new Set(combo.clauses[0]?.pattern_ids ?? []);
    if (idsA.size === 0) return false; // n_of_type não tem pattern_ids — não é subconjunto de nada
    for (const other of existing) {
        const idsB = new Set(other.clauses[0]?.pattern_ids ?? []);
        if (idsB.size === 0) continue; // n_of_type não conflita com all_of
        if (idsA.size < idsB.size) continue;
        let subset = true;
        for (const id of idsB) { if (!idsA.has(id)) { subset = false; break; } }
        if (subset && combo.weight <= other.weight) return true;
    }
    return false;
}

// ── Estimativa de peso inicial ───────────────────────────────────────────────
//
// Modelo: weight_inicial = base_cells × cell_factor × cooc_factor × topo_factor
//   - cell_factor: peso por célula derivado da média dos especiais
//   - cooc_factor: correção para padrões que frequentemente co-ocorrem
//     (P(A∩B) real ≈ P(A)×P(B) para independentes; qto maior a co-ocorrência,
//      menor o fator porque o combo é menos "surpreendente")
//   - topo_factor: densidade topológica — desenhos dispersos (muitas colunas
//     envolvidas) são mais difíceis que desenhos concentrados

function estimateComboWeight(
    patterns: PatternInfo[],
    memberIds: (string | number)[],
    masterWeight: number | null,
    avgCellWeight: number,
): number {
    const members = memberIds.map(id => patterns.find(p => String(p.pattern_id) === String(id))).filter(Boolean) as PatternInfo[];
    if (members.length < 2) return 100;

    const totalCells = members.reduce((s, m) => s + cellCount(m.mask), 0);

    // Dispersion: quantas colunas (B,I,N,G,O) o combo ocupa
    const cols = new Set<number>();
    for (const m of members) {
        let cm = cleanMask(m.mask);
        for (let b = 0; b < 25; b++) {
            if (cm & (1 << b)) cols.add(b % 5);
        }
    }
    const colFactor = 1 + (cols.size - 1) * 0.05; // +5% por coluna extra

    // Estimativa por células: totalCells × avgCellWeight × dispersão
    const cellEstimate = Math.round(totalCells * avgCellWeight * colFactor);

    // Estimativa âncora: cada membro contribui com no mínimo 100 hundredths
    const sumWeights = members.reduce((s, m) => s + Math.max(m.weight, 100), 0);
    const anchorEstimate = Math.round(sumWeights * 0.9);

    // Usa a MAIOR das duas estimativas
    const estimated = Math.max(cellEstimate, anchorEstimate);

    // Teto: min(masterWeight, sumWeights)
    const maxAllowed = masterWeight !== null
        ? Math.min(masterWeight, Math.round(sumWeights))
        : Math.round(sumWeights);
    return Math.max(100, Math.min(maxAllowed, estimated));
}

function computeAvgCellWeight(patterns: PatternInfo[]): number {
    // Inclui simples E especiais com weight > 10 (filtra pesos colapsados)
    const relevant = patterns.filter(p =>
        p.pattern_type !== 'master' && p.weight > 10
    );
    if (relevant.length === 0) return 30;
    let totalWeight = 0, totalCells = 0;
    for (const p of relevant) {
        const c = cellCount(p.mask);
        if (c > 0) { totalWeight += p.weight; totalCells += c; }
    }
    const raw = totalCells > 0 ? totalWeight / totalCells : 30;
    return Math.max(raw, 30); // floor: 30 por célula
}

// ── Gerador hierárquico ──────────────────────────────────────────────────────

export interface GenerateCombosInput {
    patterns:       PatternInfo[];
    drawMode?:      string;  // 'standard' | 'fixed' | 'firstfull' | 'goldenball' | 'multimatch'
    maxCombos?:     number;  // limite máximo de combos a sugerir (padrão 20)
}

export interface GenerateCombosResult {
    combos: ComboCandidate[];
    alerts: string[];
}

export function generateCombos(input: GenerateCombosInput): GenerateCombosResult {
    const { patterns, drawMode, maxCombos = 20 } = input;
    const alerts: string[] = [];
    const combos: ComboCandidate[] = [];

    const simplePatterns  = patterns.filter(p => p.pattern_type === 'simple');
    const specialPatterns = patterns.filter(p => p.pattern_type === 'special');
    const masterPatterns  = patterns.filter(p => p.pattern_type === 'master');

    // Teto do master: se houver master, nenhum combo pode superá-lo
    const masterWeight = masterPatterns.length > 0
        ? Math.max(...masterPatterns.map(p => p.weight))
        : null;

    if (masterWeight !== null) {
        const masterNames = masterPatterns.map(p => p.name);
        alerts.push(`ℹ️ Master (${masterNames.join(', ')}) = ${masterWeight} hundredths. Combos limitados a este teto.`);
    }

    if (simplePatterns.length < 2 && specialPatterns.length < 2 && masterPatterns.length < 2) {
        alerts.push('ℹ️ Padrões insuficientes para gerar combinações (mínimo 2 do mesmo tipo).');
        return { combos, alerts };
    }

    const avgCellWeight = computeAvgCellWeight(patterns);

    // ─── Nível 1: N-do-Tipo (mais abrangente) ─────────────────────────────

    // N-of-type para simples (N = 2, 3, … até max)
    if (simplePatterns.length >= 2) {
        const maxN = Math.min(simplePatterns.length, 7);
        const avgWeight = simplePatterns.reduce((s, p) => s + p.weight, 0) / simplePatterns.length;
        for (let n = 2; n <= maxN; n++) {
            // Progressão triangular: avgWeight × n × (n+1) / 2
            // N=2→3×, N=3→6×, N=4→10×, N=5→15×, N=6→21×, N=7→28× avgWeight
            const baseWeight = Math.round(avgWeight * n * (n + 1) / 2);
            const maxAllowed = masterWeight !== null ? Math.min(masterWeight, baseWeight) : baseWeight;
            combos.push({
                name: `${n}x Simples`,
                weight: Math.max(100, maxAllowed),
                clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: n }],
            });
        }
    }

    // ─── Nível 2: Pares Any-of (abrangência sem exigir todos) ─────────────

    // Especial + qualquer simples
    if (specialPatterns.length > 0 && simplePatterns.length > 0) {
        for (const sp of specialPatterns.slice(0, 3)) {
            for (const si of simplePatterns.slice(0, 3)) {
                const comboMask = sp.mask | si.mask;
                if (conflictsWithExisting(comboMask, patterns)) continue;
                const weight = estimateComboWeight(patterns, [sp.pattern_id, si.pattern_id], masterWeight, avgCellWeight);
                const candidate: ComboCandidate = {
                    name: `${sp.name} + ${si.name}`,
                    weight,
                    clauses: [{
                        type: 'any_of',
                        pattern_ids: [String(sp.pattern_id), String(si.pattern_id)],
                    }],
                };
                if (!hasSubsetConflict(candidate, combos)) {
                    combos.push(candidate);
                }
            }
        }
    }

    // ─── Nível 3: Pares All-of (específicos, não-conflitantes) ────────────

    // Pares de simples que não reconstroem padrão existente
    const simplePairs = generateNonOverlappingPairs(simplePatterns, patterns, masterWeight, avgCellWeight);
    for (const pair of simplePairs) {
        if (!hasSubsetConflict(pair, combos)) {
            combos.push(pair);
        }
    }

    // Limite de combos
    if (combos.length > maxCombos) {
        alerts.push(`ℹ️ ${combos.length} combos gerados, limitando aos ${maxCombos} com maior peso.`);
        combos.sort((a, b) => b.weight - a.weight);
        combos.splice(maxCombos);
    }

    // Ordena por peso decrescente
    combos.sort((a, b) => b.weight - a.weight);

    return { combos, alerts };
}

// ── Geração de pares all_of não-sobrepostos e não-conflitantes ──────────────

function generateNonOverlappingPairs(
    simplePatterns: PatternInfo[],
    allPatterns: PatternInfo[],
    masterWeight: number | null,
    avgCellWeight: number,
): ComboCandidate[] {
    const pairs: ComboCandidate[] = [];
    const usedMasks = new Set<number>();

    for (let i = 0; i < simplePatterns.length - 1; i++) {
        for (let j = i + 1; j < simplePatterns.length; j++) {
            const a = simplePatterns[i];
            const b = simplePatterns[j];
            const comboMask = a.mask | b.mask;

            // Ignora se conflita com padrão existente
            if (conflictsWithExisting(comboMask, allPatterns)) continue;

            // Ignora se a máscara combinada já foi usada (mesma combinação)
            if (usedMasks.has(cleanMask(comboMask))) continue;
            usedMasks.add(cleanMask(comboMask));

            const weight = estimateComboWeight(allPatterns, [a.pattern_id, b.pattern_id], masterWeight, avgCellWeight);
            pairs.push({
                name: `${a.name} + ${b.name}`,
                weight,
                clauses: [{
                    type: 'all_of',
                    pattern_ids: [String(a.pattern_id), String(b.pattern_id)],
                }],
            });
        }
    }

    return pairs;
}

// ── Precificação por dificuldade (pattern weights fixos) ─────────────────────
//
// Usa as hit rates descobertas (Fase 1) para estimar a dificuldade relativa
// de cada combo e precificá-lo em relação ao maior pattern weight dos membros.
//
// Fórmula base:
//   - all_of:  markup = (P_min / P_combo) ^ 0.2  (diminishing returns)
//   - any_of:  markup = max_member × 1.2 + min_member × 0.2
//   - n_of_type: base = avg(type_weights) × N × (N+1) / 2  (triangular)

export function priceCombosByDifficulty(
    combos: ComboCandidate[],
    patterns: PatternInfo[],
    hitRates: Record<string, number>,
    masterWeight: number | null,
): ComboCandidate[] {
    const epsilon = 1e-12;
    const maxAllowed = masterWeight ?? WEIGHT_MAX;

    return combos.map(combo => {
        const clause = combo.clauses[0];
        if (!clause) return combo;

        let newWeight: number;

        if (clause.type === 'n_of_type') {
            const typePatterns = patterns.filter(p => p.pattern_type === clause.pattern_type);
            if (typePatterns.length < 2) return combo;

            const avgTypeWeight = typePatterns.reduce((s, p) => s + p.weight, 0) / typePatterns.length;
            const count = clause.count ?? 2;

            // Progressão triangular: avgTypeWeight × count × (count+1) / 2
            // N=2→3×, N=3→6×, ... O combo é mais caro que a média porque
            // o jogador precisa satisfazer N do tipo simultaneamente.
            newWeight = Math.round(avgTypeWeight * count * (count + 1) / 2);

        } else if (clause.type === 'any_of') {
            const ids = clause.pattern_ids ?? [];
            const members = ids.map(id => patterns.find(p => String(p.pattern_id) === String(id))).filter(Boolean) as PatternInfo[];
            if (members.length < 2) return combo;

            const maxMemberWeight = Math.max(...members.map(m => m.weight));
            const minMemberWeight = Math.min(...members.map(m => m.weight));
            // any_of markup: 1.2× o maior + 0.2× o menor
            // O combo é mais fácil que o pattern mais raro isoladamente,
            // mas ainda exige cobertura significativa
            newWeight = Math.round(maxMemberWeight * 1.2 + minMemberWeight * 0.2);

        } else {
            // all_of (only pairs, max 2 members)
            const ids = clause.pattern_ids ?? [];
            const members = ids.map(id => patterns.find(p => String(p.pattern_id) === String(id))).filter(Boolean) as PatternInfo[];
            if (members.length < 2) return combo;

            const maxMemberWeight = Math.max(...members.map(m => m.weight));

            // P(all) ≈ ∏ P(member)  (independência aproximada)
            let pCombo = 1;
            let minP = Infinity;
            for (const m of members) {
                const p = Math.max(hitRates[m.name] ?? epsilon, epsilon);
                pCombo *= p;
                minP = Math.min(minP, p);
            }

            const diffRatio = minP / Math.max(pCombo, epsilon);
            const cappedDiff = Math.min(diffRatio, 10);
            const markup = Math.pow(cappedDiff, 0.2);

            const base = Math.round(maxMemberWeight * markup);
            newWeight = Math.max(maxMemberWeight + 1, base);
        }

        return {
            ...combo,
            weight: Math.max(100, Math.min(maxAllowed, Math.round(newWeight))),
        };
    });
}

// ── Integração: recalcula pesos de combos após calibração ───────────────────

// Aplica escala relativa nos combos baseada nos pesos calibrados dos patterns
// e re-valida teto do master e conflitos
export function recalibrateComboWeights(
    combos: ComboCandidate[],
    calibratedPatternWeights: Record<string, number>,
    patterns: PatternInfo[],
    masterWeight: number | null,
): ComboCandidate[] {
    return combos.map(combo => {
        const clause = combo.clauses[0];
        if (!clause) return combo;

        const effectiveWeight = (name: string): number => {
            const cw = calibratedPatternWeights[name];
            return cw != null ? Math.max(cw, 100) : 100;
        };

        let newWeight = combo.weight;

        if (clause.type === 'n_of_type') {
            const typePatterns = patterns.filter(p => p.pattern_type === clause.pattern_type);
            if (typePatterns.length > 0) {
                const avgEffective = typePatterns.reduce((s, p) => {
                    return s + effectiveWeight(p.name);
                }, 0) / typePatterns.length;
                const count = clause.count ?? 2;
                // Progressão triangular (consistente com priceCombosByDifficulty)
                newWeight = Math.round(avgEffective * count * (count + 1) / 2);
            }
        } else if (clause.type === 'all_of' || clause.type === 'any_of') {
            const ids = clause.pattern_ids ?? [];
            if (ids.length > 0) {
                const effectiveWeights = ids.map(id => {
                    const p = patterns.find(x => String(x.pattern_id) === String(id));
                    return p ? effectiveWeight(p.name) : 0;
                });
                if (clause.type === 'any_of') {
                    const maxW = Math.max(...effectiveWeights);
                    const minW = Math.min(...effectiveWeights);
                    // any_of markup: 1.2× o maior + 0.2× o menor
                    newWeight = Math.round(maxW * 1.2 + minW * 0.2);
                } else {
                    const sumEffective = effectiveWeights.reduce((s, w) => s + w, 0);
                    newWeight = Math.round(sumEffective * 0.95);
                }
            }
        }

        if (masterWeight !== null) {
            newWeight = Math.min(newWeight, masterWeight);
        }

        return { ...combo, weight: Math.max(100, Math.min(WEIGHT_MAX, newWeight)) };
    });
}
