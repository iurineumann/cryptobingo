import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminGametypes, createAdminGametype, deleteAdminGametype, fetchAdminPatterns, fetchGametypeMetadata, upsertGametypeMetadata, setAdminGametypeStages, simulateWeights, calibrateWeightsApi, type CalibrateResult, type DrawMode, type StageRule, type BlockchainGametype, type BlockchainPattern, type ExtendedRule, type CombinationRuleInput, type CombinationClauseInput, type McPatternStats, type McResult } from '../../services/api';

const TYPE_COLORS: Record<string, string> = {
    simple:  'bg-blue-500/10 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700',
    special: 'bg-purple-500/10 text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700',
    master:  'bg-amber-500/10 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700',
};

export default function GametypesAdmin() {
    const { t } = useTranslation();
    const TYPE_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
        { value: 'simple',  label: t('admin.type_simple'),  desc: t('admin.type_simple_desc') },
        { value: 'special', label: t('admin.type_special'), desc: t('admin.type_special_desc') },
        { value: 'master',  label: t('admin.type_master'),  desc: t('admin.type_master_desc') },
    ];
    const [gametypes, setGametypes] = useState<BlockchainGametype[]>([]);
    const [patterns, setPatterns] = useState<BlockchainPattern[]>([]);
    const [metadataMap, setMetadataMap] = useState<Record<string, { rules: ExtendedRule[]; combinations: CombinationRuleInput[] }>>({});
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [baseMultiplier, setBaseMultiplier] = useState('1.0');
    // selectedRules: pattern_id → { weight, type }
    const [selectedRules, setSelectedRules] = useState<Record<string, { weight: string; type: string }>>({});
    const [combinations, setCombinations] = useState<CombinationRuleInput[]>([]);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ADR-012: campos de modo de sorteio
    const [drawMode, setDrawMode] = useState<DrawMode>('standard');
    const [maxBalls, setMaxBalls] = useState('35');
    const [goldenBallAfter, setGoldenBallAfter] = useState('35');
    const [masterWeightOverride, setMasterWeightOverride] = useState('5.00');

    // ADR-013: estágios MULTI_MATCH
    const [stages, setStages] = useState<StageRule[]>([]);
    const [savingStages, setSavingStages] = useState<string | null>(null); // gametype_id sendo salvo

    const addStage = () => {
        const nextStage = stages.length + 1;
        const prevRequired = stages.length > 0 ? stages[stages.length - 1].patterns_required : 0;
        setStages(prev => [...prev, { stage: nextStage, patterns_required: prevRequired + 1, weight: 100 }]);
    };

    const removeStage = (idx: number) => {
        setStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stage: i + 1 })));
    };

    const updateStageField = (idx: number, field: keyof StageRule, value: number) => {
        setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const handleSaveStages = async (gametypeId: string) => {
        setSavingStages(gametypeId);
        try {
            await setAdminGametypeStages(gametypeId, stages);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar estágios.');
        } finally {
            setSavingStages(null);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [gtData, patData] = await Promise.all([
                fetchAdminGametypes(),
                fetchAdminPatterns(),
            ]);
            setGametypes(gtData.gametypes);
            setPatterns(patData.patterns);

            // Carrega metadados off-chain de cada gametype
            const meta: Record<string, { rules: ExtendedRule[]; combinations: CombinationRuleInput[] }> = {};
            await Promise.all(gtData.gametypes.map(async (gt: BlockchainGametype) => {
                try {
                    const data = await fetchGametypeMetadata(gt.gametype_id);
                    meta[gt.gametype_id] = data;
                } catch { /* sem metadados = usa defaults */ }
            }));
            setMetadataMap(meta);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.gametypes_error_load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const toggleRule = (patternId: string) => {
        setSelectedRules(prev => {
            if (prev[patternId]) {
                const { [patternId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [patternId]: { weight: '1.00', type: 'simple' } };
        });
    };

    const updateRuleField = (patternId: string, field: 'weight' | 'type', value: string) => {
        setSelectedRules(prev => {
            if (!prev[patternId]) return prev;
            const updated = { ...prev[patternId], [field]: value };
            // MASTER = peso máximo fixo em todos os modos, EXCETO firstfull,
            // onde o peso da cartela cheia é o prêmio principal e deve ser configurável.
            if (field === 'type' && value === 'master' && drawMode !== 'firstfull') {
                updated.weight = '255.00';
            }
            return { ...prev, [patternId]: updated };
        });
    };

    // Combinações
    const [comboName, setComboName] = useState('');
    const [comboWeight, setComboWeight] = useState('1.00');
    const [comboClauses, setComboClauses] = useState<CombinationClauseInput[]>([{ type: 'all_of', pattern_ids: [] }]);
    const [editingComboIdx, setEditingComboIdx] = useState<number | null>(null);

    const updateClause = (idx: number, partial: Partial<CombinationClauseInput>) => {
        setComboClauses(prev => prev.map((c, i) => i === idx ? { ...c, ...partial } : c));
    };

    const removeClause = (idx: number) => {
        setComboClauses(prev => prev.filter((_, i) => i !== idx));
        if (comboClauses.length <= 1) setComboClauses([{ type: 'all_of', pattern_ids: [] }]);
    };

    const addClause = () => {
        setComboClauses(prev => [...prev, { type: 'all_of', pattern_ids: [] }]);
    };

    const toggleComboPattern = (patternId: string, clauseIdx: number) => {
        const clause = comboClauses[clauseIdx];
        if (!clause || clause.type === 'n_of_type') return;
        const ids = clause.pattern_ids ?? [];
        const next = ids.includes(patternId) ? ids.filter(id => id !== patternId) : [...ids, patternId];
        updateClause(clauseIdx, { pattern_ids: next });
    };

    const addCombination = () => {
        if (!comboName || !comboWeight || comboClauses.length === 0) return;
        const valid = comboClauses.every(c =>
            (c.type === 'n_of_type' && c.pattern_type && (c.count ?? 1) >= 1) ||
            ((c.type === 'all_of' || c.type === 'any_of') && (c.pattern_ids?.length ?? 0) >= 1)
        );
        if (!valid) {
            setError(t('admin.gametypes_error_combo_empty'));
            return;
        }
        setError(null);
        const entry: CombinationRuleInput = { name: comboName, weight: Math.round(parseFloat(comboWeight) * 100), clauses: comboClauses.map(c => ({ ...c })) };
        setCombinations(prev => {
            if (editingComboIdx !== null) {
                const next = [...prev];
                next[editingComboIdx] = entry;
                return next;
            }
            return [...prev, entry];
        });
        setComboName('');
        setComboWeight('1');
        setComboClauses([{ type: 'all_of', pattern_ids: [] }]);
        setEditingComboIdx(null);
    };

    const removeCombination = (idx: number) => {
        setCombinations(prev => prev.filter((_, i) => i !== idx));
    };

    // ── Edição de combinações de um gametype JÁ existente ────────────────────
    // Combinações só podiam ser definidas na criação. Este fluxo permite
    // adicionar/editar combinações (e persistir no MongoDB) de gametypes existentes.
    const [editComboGtId, setEditComboGtId] = useState<string | null>(null);
    const [savingCombos, setSavingCombos] = useState(false);

    const buildExtendedRules = (): ExtendedRule[] =>
        Object.entries(selectedRules)
            .filter(([_, v]) => v.weight && parseFloat(v.weight) > 0)
            .map(([pattern_id, v]) => ({ pattern_id, weight: Math.round(parseFloat(v.weight) * 100), type: v.type as ExtendedRule['type'] }));

    const startEditCombinations = (gt: BlockchainGametype) => {
        const meta = metadataMap[gt.gametype_id];
        // Reconstrói selectedRules a partir das regras on-chain (+ tipo do metadata),
        // para que o seletor de padrões das cláusulas funcione.
        const rebuilt: Record<string, { weight: string; type: string }> = {};
        for (const r of gt.rules) {
            const ruleMeta = meta?.rules?.find(m => m.pattern_id === r.pattern_id);
            rebuilt[r.pattern_id] = {
                weight: (r.weight / 100).toFixed(2),
                type:   ruleMeta?.type ?? 'simple',
            };
        }
        setSelectedRules(rebuilt);
        setCombinations(meta?.combinations ? meta.combinations.map(c => ({ ...c, clauses: c.clauses.map(cl => ({ ...cl })) })) : []);
        setComboName('');
        setComboWeight('1.00');
        setComboClauses([{ type: 'all_of', pattern_ids: [] }]);
        setEditingComboIdx(null);
        setError(null);
        setEditComboGtId(gt.gametype_id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditCombinations = () => {
        setEditComboGtId(null);
        setCombinations([]);
        setSelectedRules({});
        setComboName('');
        setComboWeight('1.00');
        setComboClauses([{ type: 'all_of', pattern_ids: [] }]);
        setEditingComboIdx(null);
        setError(null);
    };

    const saveEditedCombinations = async () => {
        if (!editComboGtId) return;
        setSavingCombos(true);
        setError(null);
        try {
            // Preserva as regras estendidas (tipos) existentes; sobrescreve combinações.
            const existingRules = metadataMap[editComboGtId]?.rules?.length
                ? metadataMap[editComboGtId].rules
                : buildExtendedRules();
            await upsertGametypeMetadata(editComboGtId, { rules: existingRules, combinations });
            await load();
            cancelEditCombinations();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.gametypes_error_combos_save'));
        } finally {
            setSavingCombos(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        const toHundredths = (v: string) => Math.round(parseFloat(v) * 100);
        const rules = Object.entries(selectedRules)
            .filter(([_, v]) => v.weight && parseFloat(v.weight) > 0)
            .map(([pattern_id, v]) => ({ pattern_id, weight: toHundredths(v.weight) }));
        if (rules.length === 0) { setError(t('admin.gametypes_error_no_rules')); return; }

        const rules_extended: ExtendedRule[] = Object.entries(selectedRules)
            .filter(([_, v]) => v.weight && parseFloat(v.weight) > 0)
            .map(([pattern_id, v]) => ({ pattern_id, weight: toHundredths(v.weight), type: v.type as ExtendedRule['type'] }));

        setSaving(true);
        setError(null);
        try {
            const maxId = gametypes.reduce((max, gt) => Math.max(max, parseInt(gt.gametype_id) || 0), 0);
            const gametype_id = maxId + 1;
            const res = await createAdminGametype({
                gametype_id, name, base_multiplier: parseFloat(baseMultiplier),
                rules, rules_extended, combinations,
                draw_mode:          drawMode,
                max_balls:          drawMode === 'fixed'      ? parseInt(maxBalls) || 0 : 0,
                golden_ball_after:  drawMode === 'goldenball' ? parseInt(goldenBallAfter) || 0 : 0,
                master_weight_ovrd: drawMode === 'firstfull'  ? Math.round(parseFloat(masterWeightOverride) * 100) : 0,
            });
            // Persiste combinações + tipos no MongoDB. NÃO engolir erro: se falhar, o
            // gametype existe on-chain mas sem combinações — o admin precisa saber para
            // reeditá-las pelo fluxo de edição de combinações.
            try {
                await upsertGametypeMetadata(String(gametype_id), { rules: rules_extended, combinations });
            } catch {
                setError(t('admin.gametypes_error_metadata_failed', { id: gametype_id }));
                await load();
                return;
            }
            setName('');
            setBaseMultiplier('1.0');
            setSelectedRules({});
            setCombinations([]);
            setDrawMode('standard');
            setMaxBalls('35');
            setGoldenBallAfter('35');
            setMasterWeightOverride('5.00');
            setStages([]);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.gametypes_error_create'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (gtId: string) => {
        if (!confirm(t('admin.gametypes_confirm_delete', { id: gtId }))) return;
        try {
            await deleteAdminGametype(gtId);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.gametypes_error_delete'));
        }
    };

    // Número de bolas simuladas por rodada.
    // Deve corresponder ao DEFAULT_DRAW_BALLS real do jogo (35 bolas de 75 disponíveis).
    // Com 35 bolas: hit_rates realistas (1-20% por padrão) → pesos calibráveis para RTP=85%.
    // Com 75 (oracle completo): todas as cartelas sempre completam → hit_rate=100% → impossível calibrar.
    const SUGGEST_MAX_BALLS = 35;

    /**
     * Peso inicial via inverse hit_rate escalado ao RTP alvo.
     * Com max_balls=45, hit_rates são < 100%, então C/hit_rate > 100 para a maioria
     * dos padrões — weights já começam dentro do intervalo válido on-chain.
     *
     * A contagem de células do padrão (popcount da máscara) serve como sinal
     * de dificuldade secundário: padrões com mais células dentro do mesmo
     * hit_rate recebem um bônus proporcional.
     *
     * Fórmula: w_i = (rtp × 100) / (N × base_mul × hit_rate_i) × difficulty_i
     *   difficulty_i = sqrt(cell_count_i / avg_cell_count)  (1.0 para padrão médio)
     */
    const computeInitialWeights = (
        hits: McPatternStats[],
        baseMul: number,
        targetRtp: number,
        patternCellCounts?: Record<string, number>,
    ): Record<string, number> => {
        const N = hits.length;
        const C = (targetRtp * 100) / (N * baseMul);

        const avgCells = patternCellCounts
            ? hits.reduce((s, h) => s + (patternCellCounts[h.name] ?? 5), 0) / N
            : 5;

        const result: Record<string, number> = {};
        for (const s of hits) {
            const cells      = patternCellCounts?.[s.name] ?? 5;
            const difficulty = Math.sqrt(cells / avgCells); // bônus por dificuldade estrutural
            const raw        = (C / s.hit_rate) * difficulty;
            // Floor 10 (0.10x) — permite pesos abaixo de 100 na simulação;
            // o admin verá o valor sugerido e decidirá se sobe ao mínimo on-chain (100).
            result[s.name] = clamp(Math.round(raw), 10, 25500);
        }
        return result;
    };

    const handleSuggest = async () => {
        const toHundredths = (v: string) => Math.round(parseFloat(v) * 100);
        const rules = Object.entries(selectedRules)
            .filter(([_, v]) => v.weight && parseFloat(v.weight) > 0);
        // Permite 1+ padrões — single pattern é tratado como "combo de 1"
        if (rules.length < 1) { setError(t('admin.gametypes_error_no_patterns_suggest')); return; }
        setSuggesting(true);
        setError(null);
        try {
            const baseMul = parseFloat(baseMultiplier) || 1;
            const rulesExtended: ExtendedRule[] = rules
                .map(([pattern_id, v]) => ({ pattern_id, weight: toHundredths(v.weight), type: v.type as ExtendedRule['type'] }));

            const mcPatterns = rulesExtended.map(r => {
                const p = patterns.find(p => String(p.pattern_id) === r.pattern_id);
                return { pattern_id: parseInt(r.pattern_id), name: p?.name ?? `#${r.pattern_id}`, mask: p ? Number(p.mask) : 0, weight: r.weight, pattern_type: r.type };
            }).filter(p => p.mask > 0);

            if (mcPatterns.length === 0) { setError(t('admin.gametypes_error_no_patterns_simulate')); setSuggesting(false); return; }

            // ── Phase 1: Simula padrões individuais para medir hit_rates ──────────
            // max_balls=45 modela um jogo que encerra quando o 1º jogador vence —
            // produz hit_rates realistas (< 100%) que permitem pesos > 100 e RTP=85%.
            // Com 75 bolas (padrão), hit_rate=100% para todos → RTP mínimo = 100%.
            const phase1 = await simulateWeights({
                gametype_name:   name || 'Gametype',
                base_multiplier: baseMul,
                patterns:        mcPatterns,
                simulations:     25_000,
                max_balls:       drawMode === 'fixed' ? parseInt(maxBalls) || 35 : 75,
            });

            // Contagem de células (bits ativos, excl. FREE) por padrão:
            // usada como sinal de dificuldade estrutural no cálculo de pesos iniciais.
            const patternCellCounts: Record<string, number> = {};
            for (const mp of mcPatterns) {
                let cells = 0;
                for (let b = 0; b < 25; b++) {
                    if (b !== 12 && (mp.mask & (1 << b))) cells++;
                }
                patternCellCounts[mp.name] = cells;
            }

            // ── Phase 2: Computa pesos iniciais por inverse hit_rate ──────────────
            let activeRulesExt = rulesExtended;
            let activePatterns = mcPatterns;

            const hits = phase1.pattern_stats.filter(s => s.hit_count > 0);
            if (hits.length > 0) {
                const computed = computeInitialWeights(hits, baseMul, 0.85, patternCellCounts);

                // Mapa nome → pattern_id para lookup reverso
                const nameToId: Record<string, string> = {};
                for (const p of mcPatterns) nameToId[p.name] = String(p.pattern_id);

                activeRulesExt = rulesExtended.map(r => {
                    const p = mcPatterns.find(mp => String(mp.pattern_id) === r.pattern_id);
                    const w = p ? (computed[p.name] ?? r.weight) : r.weight;
                    return { ...r, weight: w };
                });
                activePatterns = activeRulesExt.map(r => {
                    const p = patterns.find(pp => String(pp.pattern_id) === r.pattern_id);
                    return { pattern_id: parseInt(r.pattern_id), name: p?.name ?? `#${r.pattern_id}`, mask: p ? Number(p.mask) : 0, weight: r.weight, pattern_type: r.type };
                }).filter(p => p.mask > 0);
            }

            // ── Phase 2b: Geração Dinâmica de Múltiplas Combinações (Sem Sobreposição) ─────
            const combos: CombinationRuleInput[] = [];

            // 1. Combinações apenas de padrões SIMPLES (especiais têm precificação própria)
            const combinablePatterns = activePatterns.filter(p => p.pattern_type === 'simple');

            // 2. Algoritmo Recursivo de Busca em Profundidade (Backtracking)
            const generateNonOverlappingCombos = (
                startIndex: number,
                currentCombo: typeof combinablePatterns,
                currentMask: bigint
            ) => {
                // Se temos 2 ou mais padrões, registramos o combo
                if (currentCombo.length >= 2) {
                    combos.push({
                        name: currentCombo.map(p => p.name).join(' + '),
                        weight: 0, // Será calibrado pelo Motor Matemático
                        clauses: [
                            {
                                type: 'all_of',
                                // CORREÇÃO 2: Converter o ID numérico para string
                                pattern_ids: currentCombo.map(p => p.pattern_id.toString())
                            }
                        ]
                    });
                }

                // Explora as próximas camadas da árvore de combinações
                for (let i = startIndex; i < combinablePatterns.length; i++) {
                    const candidate = combinablePatterns[i];
                    
                    const candidateMask = BigInt(candidate.mask);

                    // A MAGIA ESTÁ AQUI: (currentMask & candidateMask) === 0n
                    if ((currentMask & candidateMask) === 0n) {
                        generateNonOverlappingCombos(
                            i + 1, 
                            [...currentCombo, candidate], 
                            currentMask | candidateMask
                        );
                    }
                }
            };

            // Inicia a recursão com máscara vazia
            generateNonOverlappingCombos(0, [], 0n);

            // ── Phase 3: Precificação das combinações por similaridade com especiais ──
            // Cada especial tem uma "dificuldade" = weight / células a acertar.
            // Para cada combo simples, encontramos o especial de "desenho" mais próximo
            // (máscara bit a bit) e precificamos proporcionalmente à dificuldade relativa.

            // Índice de dificuldade dos especiais
            interface SpecialInfo {
                name: string;
                mask: number;
                weight: number;
                cells: number;
                diffPerCell: number;
            }
            const specials: SpecialInfo[] = activePatterns
                .filter(p => p.pattern_type === 'special')
                .map(p => {
                    const cells = patternCellCounts[p.name] ?? 0;
                    return {
                        name: p.name,
                        mask: p.mask,
                        weight: p.weight,
                        cells,
                        diffPerCell: cells > 0 ? p.weight / cells : 0,
                    };
                });

            // Similaridade de Jaccard entre duas máscaras (exclui FREE)
            const maskSim = (a: number, b: number): number => {
                const clean = (m: number) => m & ~(1 << 12);
                const ca = clean(a), cb = clean(b);
                let inter = 0, union = 0;
                for (let bit = 0; bit < 25; bit++) {
                    if (bit === 12) continue;
                    const hasA = (ca & (1 << bit)) !== 0;
                    const hasB = (cb & (1 << bit)) !== 0;
                    if (hasA && hasB) inter++;
                    if (hasA || hasB) union++;
                }
                return union > 0 ? inter / union : 0;
            };

            const weightedCombos: CombinationRuleInput[] = combos.map(c => {
                const memberIds = c.clauses[0]?.pattern_ids ?? [];
                let combinedMask = 0;
                let comboCellCount = 0;
                for (const pid of memberIds) {
                    const mp = activePatterns.find(p => String(p.pattern_id) === pid);
                    if (mp) {
                        combinedMask |= mp.mask;
                        comboCellCount += patternCellCounts[mp.name] ?? 0;
                    }
                }

                if (specials.length > 0) {
                    // Encontra o especial com desenho mais parecido
                    let best = specials[0];
                    let bestSim = 0;
                    for (const si of specials) {
                        const sim = maskSim(combinedMask, si.mask);
                        if (sim > bestSim) { bestSim = sim; best = si; }
                    }
                    if (best.diffPerCell > 0) {
                        // Fator de dificuldade: combo é mais fácil ou mais difícil que o especial?
                        const diffFactor = comboCellCount / best.cells;
                        const price = best.diffPerCell * comboCellCount * diffFactor;
                        return { ...c, weight: clamp(Math.round(price), 100, 25500) };
                    }
                }

                // Fallback (sem especiais): soma dos membros × 0.8
                const sumW = memberIds.reduce((s, pid) => {
                    const mp = activePatterns.find(p => String(p.pattern_id) === pid);
                    return s + (mp?.weight ?? 100);
                }, 0);
                return { ...c, weight: clamp(Math.round(sumW * 0.8), 100, 25500) };
            });

            // ── Phase 4: Calibra RTP ──────────────────────────────────────────
            // firstfull: MASTER participa da calibração — seu peso define o prêmio
            //            da cartela cheia, que é o único padrão que importa no modo.
            // demais modos: MASTER excluído (peso fixo em 255.00) para não distorcer
            //               o RTP dos padrões simples/especiais.
            const patternsForCalibration = drawMode === 'firstfull'
                ? activePatterns
                : activePatterns.filter(p => p.pattern_type !== 'master');
            const cal = patternsForCalibration.length > 0
                ? await calibrateRtp(patternsForCalibration, weightedCombos, baseMul, name || 'Gametype')
                : null;

            // ── Phase 5: Aplica pesos calibrados ao estado ───────────────────
            setSelectedRules(prev => {
                const next = { ...prev };
                for (const [pid, rule] of Object.entries(next)) {
                    const mp = activePatterns.find(p => String(p.pattern_id) === pid);
                    if (!mp) continue;
                    if (mp.pattern_type === 'master' && drawMode !== 'firstfull') {
                        // MASTER = peso máximo em todos os modos exceto firstfull
                        next[pid] = { ...rule, weight: '255.00' };
                    } else if (cal) {
                        const w = cal.pattern_weights[mp.name] ?? mp.weight;
                        next[pid] = { ...rule, weight: (w / 100).toFixed(2) };
                    } else {
                        next[pid] = { ...rule, weight: (mp.weight / 100).toFixed(2) };
                    }
                }
                return next;
            });

            applyCombos(weightedCombos, cal);

        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.gametypes_error_suggest'));
        } finally {
            setSuggesting(false);
        }
    };

    // ── Pure helpers (no React state) ──────────────────────────────────────────

    const buildByType = (rules: ExtendedRule[]): Record<string, ExtendedRule[]> => {
        const byType: Record<string, ExtendedRule[]> = { simple: [], special: [], master: [] };
        for (const r of rules) { if (byType[r.type]) byType[r.type].push(r); }
        return byType;
    }

    const buildCombos = (
        mcPatterns: { name: string; weight: number; pattern_id: number; pattern_type?: string }[],
        byType: Record<string, ExtendedRule[]>,
        mcResult: McResult,
    ): CombinationRuleInput[] => {
        const suggested: CombinationRuleInput[] = [];
        const statsMap: Record<string, McPatternStats> = {};
        for (const s of mcResult.pattern_stats) statsMap[s.name] = s;

        // Mapa nome → peso (em hundredths) dos padrões com pesos já calculados.
        // McPatternStats.weight é sempre 0 no retorno da API (não é preenchido),
        // portanto usamos mcPatterns como fonte de verdade dos pesos.
        const weightMap: Record<string, number> = {};
        for (const p of mcPatterns) weightMap[p.name] = p.weight;

        // 1. N-of-type (2×, 3× … 5×) — combinação por categoria
        for (const [type, label] of Object.entries({ simple: t('admin.type_simple'), special: t('admin.type_special'), master: t('admin.type_master') })) {
            const list = byType[type] ?? [];
            for (let n = 2; n <= Math.min(list.length, 5); n++) {
                // Peso do combo N-of-type: soma dos pesos médios × N × 0.75
                // (combo exige N padrões simultâneos → paga proporcionalmente mais)
                const names = list.map(r => mcPatterns.find(mp => mp.pattern_id === parseInt(r.pattern_id))?.name ?? '').filter(Boolean);
                const avgWeight = names.length > 0
                    ? names.reduce((s, nm) => s + (weightMap[nm] ?? 100), 0) / names.length
                    : 100;
                suggested.push({
                    name: `${n}× ${label}`,
                    weight: Math.max(100, Math.round(avgWeight * n * 0.75)),
                    clauses: [{ type: 'n_of_type' as const, pattern_type: type as ExtendedRule['type'], count: n }],
                });
            }
        }

        // 2. Pares dos padrões mais frequentes (top 5 por hit_rate)
        const top: McPatternStats[] = mcResult.pattern_stats
            .filter((s: McPatternStats) => s.hit_count > 0)
            .sort((a: McPatternStats, b: McPatternStats) => b.hit_rate - a.hit_rate)
            .slice(0, 5);
        const findPid = (patName: string): string =>
            mcPatterns.find(p => p.name === patName)?.pattern_id.toString() ?? '';
        for (let i = 0; i < top.length - 1; i++) {
            for (let j = i + 1; j < top.length; j++) {
                const pidA = findPid(top[i].name);
                const pidB = findPid(top[j].name);
                if (!pidA || !pidB) continue;
                // FIX: usa weightMap (pesos reais) ao invés de top[i].weight que é sempre 0
                const wA = weightMap[top[i].name] ?? 100;
                const wB = weightMap[top[j].name] ?? 100;
                suggested.push({
                    name: `${top[i].name}+${top[j].name}`,
                    weight: Math.max(100, Math.round((wA + wB) * 0.9)),
                    clauses: [{ type: 'all_of' as const, pattern_ids: [pidA, pidB] }],
                });
            }
        }

        // 3. Pares especial + simples
        const findStats = (pid: string): McPatternStats | undefined => {
            // FIX: comparação String×String para evitar mismatch de tipo
            const p = patterns.find(pp => String(pp.pattern_id) === String(pid));
            return p ? statsMap[p.name] : undefined;
        };
        if (byType.special.length > 0 && byType.simple.length > 0) {
            for (const spec of byType.special) {
                const spStats = findStats(spec.pattern_id);
                if (!spStats || spStats.hit_count === 0) continue;
                for (const simple of byType.simple.slice(0, 3)) {
                    const siStats = findStats(simple.pattern_id);
                    if (!siStats || siStats.hit_count === 0) continue;
                    const sName  = patterns.find(p => String(p.pattern_id) === String(spec.pattern_id))?.name  ?? `#${spec.pattern_id}`;
                    const siName = patterns.find(p => String(p.pattern_id) === String(simple.pattern_id))?.name ?? `#${simple.pattern_id}`;
                    const wSpec  = weightMap[sName]  ?? spec.weight;
                    const wSimp  = weightMap[siName] ?? simple.weight;
                    suggested.push({
                        name: `${sName}+${siName}`,
                        weight: Math.max(100, Math.round((wSpec + wSimp) * 0.9)),
                        clauses: [
                            { type: 'all_of' as const, pattern_ids: [spec.pattern_id] },
                            { type: 'any_of' as const, pattern_ids: [simple.pattern_id] },
                        ],
                    });
                }
            }
        }

        return suggested;
    };

    /**
     * Calibração de RTP via motor de 4 fases do backend (ADR-014 analogia).
     *
     * Substitui o antigo loop de 15 chamadas a simulateWeights (estocástico + divergente).
     * O backend executa em uma única requisição:
     *   Fase 1 — descoberta empírica (20k rodadas, sem max_weight, sem ruído por iteração)
     *   Fase 2 — suavização de Laplace (epsilon para P=0 — evita ÷0 e ancora o MASTER)
     *   Fase 3 — calibração algébrica em memória (sem RNG, convergência garantida)
     *   Fase 4 — validação estocástica final (prova dos nove com 10k rodadas)
     */
    const calibrateRtp = async (
        patternsArg: { name: string; weight: number; mask: number; pattern_id: number; pattern_type?: string }[],
        combos: CombinationRuleInput[],
        baseMul: number,
        gtName: string,
    ): Promise<{ pattern_weights: Record<string, number>; combo_weights: Record<string, number> } | null> => {
        const mcPatterns = patternsArg.map(p => ({
            pattern_id:   p.pattern_id,
            name:         p.name,
            mask:         p.mask,
            weight:       p.weight,
            pattern_type: p.pattern_type,
        }));

        const result: CalibrateResult = await calibrateWeightsApi({
            gametype_name:   gtName,
            base_multiplier: baseMul,
            patterns:        mcPatterns,
            combinations:    combos,
            max_balls:       SUGGEST_MAX_BALLS,
            target_rtp:      0.85,
        });

        return { pattern_weights: result.pattern_weights, combo_weights: result.combo_weights };
    };

    const clamp = (v: number, lo: number, hi: number): number =>
        Math.max(lo, Math.min(hi, v));

    const applyCombos = (
        combos: CombinationRuleInput[],
        cal: { pattern_weights: Record<string, number>; combo_weights: Record<string, number> } | null,
    ): void => {
        const finalCombos = cal
            ? combos.map(c => ({ ...c, weight: cal.combo_weights[c.name] ?? c.weight }))
            : combos;

        setCombinations(prev => {
            const existing = new Set(prev.map(c => c.name));
            return [...prev, ...finalCombos.filter(c => !existing.has(c.name))];
        });
    }

    const getPatternMeta = (gametypeId: string, patternId: string): ExtendedRule | undefined => {
        return metadataMap[gametypeId]?.rules?.find(r => r.pattern_id === patternId);
    };

    return (
        <div>
            <h2 className="text-xl font-bold text-[--cb-text-primary] mb-1">{t('admin.gametypes_title')}</h2>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">
                {t('admin.gametypes_desc')}
            </p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            <form onSubmit={handleCreate} className="cb-card p-4 mb-6 flex flex-col gap-4">
                {editComboGtId && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[--cb-brand]/10 border border-[--cb-brand]">
                        <span className="text-sm text-[--cb-text-primary] font-medium">
                            🔗 {t('admin.gametypes_editing_combos', { id: editComboGtId })}
                        </span>
                        <button type="button" className="text-xs text-[--cb-text-tertiary] hover:underline" onClick={cancelEditCombinations}>
                            {t('admin.gametypes_cancel_edit')}
                        </button>
                    </div>
                )}
                {/* Nome e Base Multiplier */}
                <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_name')}</label>
                        <input className="cb-input" data-testid="gt-field-name" value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.gametypes_name_placeholder')} required />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_multiplier')}</label>
                        <input className="cb-input font-mono w-28" data-testid="gt-field-base_multiplier" type="number" step="0.1" min="0.1" value={baseMultiplier} onChange={e => setBaseMultiplier(e.target.value)} required />
                    </div>
                </div>

                {/* Modo de Sorteio — ADR-012 */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_draw_mode')}</label>
                        <select
                            className="cb-input"
                            data-testid="gt-draw-mode"
                            value={drawMode}
                            onChange={e => setDrawMode(e.target.value as DrawMode)}
                        >
                            <option value="standard">{t('admin.draw_mode_standard')}</option>
                            <option value="fixed">{t('admin.draw_mode_fixed')}</option>
                            <option value="firstfull">{t('admin.draw_mode_firstfull')}</option>
                            <option value="goldenball">{t('admin.draw_mode_goldenball')}</option>
                            <option value="multimatch">{t('admin.draw_mode_multimatch')}</option>
                        </select>
                    </div>

                    {drawMode === 'fixed' && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_max_balls')}</label>
                            <input
                                className="cb-input font-mono w-24"
                                type="number" min="10" max="74" step="1"
                                value={maxBalls}
                                onChange={e => setMaxBalls(e.target.value)}
                            />
                        </div>
                    )}

                    {drawMode === 'goldenball' && (
                        <div className="flex flex-col gap-1">
                            {/* golden_ball_after: bola logo após o sorteio normal (padrão 35) */}
                            <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_golden_ball_after')}</label>
                            <input
                                className="cb-input font-mono w-24"
                                type="number" min="20" max="73" step="1"
                                value={goldenBallAfter}
                                onChange={e => setGoldenBallAfter(e.target.value)}
                            />
                        </div>
                    )}

                    {drawMode === 'firstfull' && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_master_weight')}</label>
                            <input
                                className="cb-input font-mono w-28"
                                type="number" min="1" max="255" step="0.01"
                                value={masterWeightOverride}
                                onChange={e => setMasterWeightOverride(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {/* Editor de Estágios — MULTI_MATCH (ADR-013) */}
                {drawMode === 'multimatch' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-[--cb-text-tertiary] font-semibold uppercase tracking-wide">
                                {t('admin.gametypes_stages')}
                            </span>
                            <button type="button" className="cb-btn cb-btn-outline text-xs px-2 py-1" onClick={addStage}>
                                + {t('admin.gametypes_add_stage')}
                            </button>
                        </div>
                        {stages.length === 0 && (
                            <p className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_no_stages')}</p>
                        )}
                        {stages.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[--cb-border-default] bg-[--cb-bg-surface] text-xs">
                                <span className="font-semibold text-[--cb-brand] w-16">{t('admin.gametypes_stage')} {s.stage}</span>
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[--cb-text-tertiary]">{t('admin.gametypes_patterns_required')}</label>
                                    <input className="cb-input font-mono w-16 text-xs py-0.5" type="number" min="1" max="10" step="1"
                                        value={s.patterns_required}
                                        onChange={e => updateStageField(idx, 'patterns_required', parseInt(e.target.value) || 1)} />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[--cb-text-tertiary]">{t('admin.gametypes_weight')} (×)</label>
                                    <input className="cb-input font-mono w-20 text-xs py-0.5" type="number" min="0.01" max="255" step="0.01"
                                        value={(s.weight / 100).toFixed(2)}
                                        onChange={e => updateStageField(idx, 'weight', Math.round(parseFloat(e.target.value) * 100) || 100)} />
                                </div>
                                <button type="button" className="ml-auto text-[--cb-text-tertiary] hover:text-red-500 transition-colors" onClick={() => removeStage(idx)}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Regras com tipo */}
                <div>
                    <span className="text-xs text-[--cb-text-tertiary] font-semibold uppercase tracking-wide block mb-2">
                        {t('admin.gametypes_patterns')}
                    </span>
                    {patterns.length === 0 ? (
                        <p className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_no_patterns')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {patterns.map(p => {
                                const sel = selectedRules[p.pattern_id];
                                return (
                                    <div
                                        key={p.pattern_id}
                                        data-testid={`gt-rule-${p.pattern_id}`}
                                        className={`cb-chip flex flex-col gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                                            sel
                                                ? 'border-[--cb-brand] bg-[--cb-brand]/5'
                                                : 'border-[--cb-border-default] text-[--cb-text-secondary]'
                                        }`}
                                    >
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={!!sel}
                                                onChange={() => toggleRule(p.pattern_id)}
                                            />
                                            <span className="font-medium">{p.name}</span>
                                            <span className="text-xs text-[--cb-text-tertiary] font-mono">#{p.pattern_id}</span>
                                        </label>
                                        {sel && (
                                            <div className="flex items-center gap-2 pl-2">
                                                <select
                                                    className="text-xs px-1 py-0.5 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated] text-[--cb-text-primary]"
                                                    value={sel.type}
                                                    onChange={e => updateRuleField(p.pattern_id, 'type', e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    {TYPE_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                                <span className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_weight')}</span>
                                                <input
                                                    className={`w-14 text-xs font-mono px-1 py-0.5 rounded border border-[--cb-border-default] text-center ${sel.type === 'master' && drawMode !== 'firstfull' ? 'bg-amber-500/10 opacity-70 cursor-not-allowed' : 'bg-transparent'}`}
                                                    type="number" min="0.5" max="255" step="0.01"
                                                    value={sel.type === 'master' && drawMode !== 'firstfull' ? '255.00' : sel.weight}
                                                    disabled={sel.type === 'master' && drawMode !== 'firstfull'}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => updateRuleField(p.pattern_id, 'weight', e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Combinações */}
                <div>
                    <span className="text-xs text-[--cb-text-tertiary] font-semibold uppercase tracking-wide block mb-2">
                        {t('admin.gametypes_combinations')}
                    </span>
                    <p className="text-xs text-[--cb-text-tertiary] mb-2">
                        {t('admin.gametypes_combinations_desc')}
                    </p>

                    {/* Lista de combinações adicionadas */}
                    {combinations.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {combinations.map((c, i) => (
                                <div key={i}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                        editingComboIdx === i
                                            ? 'bg-[--cb-brand]/10 border-[--cb-brand] ring-1 ring-[--cb-brand]'
                                            : 'bg-[--cb-bg-surface] border-[--cb-border-default] hover:border-[--cb-brand]'
                                    }`}
                                    onClick={() => {
                                        setComboName(c.name);
                                        setComboWeight(String(c.weight / 100));
                                        setComboClauses(c.clauses.map(cl => ({ ...cl })));
                                        setEditingComboIdx(i);
                                    }}
                                >
                                    <span className="font-semibold text-[--cb-text-primary]">{c.name}</span>
                                    <span className="text-[--cb-text-tertiary]">
                                        {c.clauses.map((cl, ci) => (
                                            <span key={ci}>
                                                {ci > 0 && <span className="mx-1 text-[--cb-brand] font-bold">{t('admin.gametypes_and')}</span>}
                                                {cl.type === 'n_of_type'
                                                    ? `${cl.count ?? 1}× ${cl.pattern_type}`
                                                    : `${cl.type === 'all_of' ? t('admin.gametypes_all') : t('admin.gametypes_any')} [${(cl.pattern_ids ?? []).join(',')}]`
                                                }
                                            </span>
                                        ))}
                                    </span>
                                    <span className="font-mono font-bold text-[--cb-accent]">{(c.weight / 100).toFixed(2)}x</span>
                                    <button type="button" className="text-[--cb-danger] hover:underline ml-1" onClick={e => { e.stopPropagation(); removeCombination(i); }}>✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Builder de combinação */}
                    <div className="flex flex-col gap-3 p-3 rounded-lg border border-dashed border-[--cb-border-default]">
                        <div className="flex flex-wrap gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_combo_name')}</label>
                                <input className="cb-input text-xs w-28" data-testid="gt-combo-name" value={comboName} onChange={e => setComboName(e.target.value)} placeholder={t('admin.gametypes_combo_name_placeholder')} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_combo_weight')}</label>
                                <input className="cb-input text-xs w-20 font-mono" data-testid="gt-combo-weight" type="number" min="0.5" step="0.01" value={comboWeight} onChange={e => setComboWeight(e.target.value)} />
                            </div>
                        </div>

                        {/* Cláusulas */}
                        <div className="flex flex-col gap-2">
                            <span className="text-xs text-[--cb-text-tertiary] font-semibold">{t('admin.gametypes_clauses')}</span>
                            {comboClauses.map((clause, ci) => (
                                <div key={ci} data-testid={`gt-combo-clause-${ci}`} className="flex flex-wrap items-start gap-2 p-2 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated]">
                                    <select
                                        className="text-xs px-1 py-0.5 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated] text-[--cb-text-primary]"
                                        value={clause.type}
                                        onChange={e => {
                                            const newType = e.target.value as CombinationClauseInput['type'];
                                            updateClause(ci, {
                                                type: newType,
                                                pattern_ids: [],
                                                pattern_type: newType === 'n_of_type' ? 'simple' : undefined,
                                                count: undefined,
                                            });
                                        }}
                                    >
                                        <option value="all_of">{t('admin.gametypes_clause_all')}</option>
                                        <option value="any_of">{t('admin.gametypes_clause_any')}</option>
                                        <option value="n_of_type">{t('admin.gametypes_clause_n_of')}</option>
                                    </select>

                                    {clause.type === 'n_of_type' ? (
                                        <>
                                            <input
                                                className="w-12 text-xs font-mono px-1 py-0.5 rounded border border-[--cb-border-default] bg-transparent text-center"
                                                type="number" min="1" max="12"
                                                value={clause.count ?? 1}
                                                onChange={e => updateClause(ci, { count: parseInt(e.target.value) || 1 })}
                                                placeholder="N"
                                            />
                                            <span className="text-xs text-[--cb-text-tertiary] self-center">{t('admin.gametypes_clause_patterns_of_type')}</span>
                                            <select
                                                className="text-xs px-1 py-0.5 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated] text-[--cb-text-primary]"
                                                value={clause.pattern_type ?? 'simple'}
                                                onChange={e => updateClause(ci, { pattern_type: e.target.value as ExtendedRule['type'] })}
                                            >
                                                {TYPE_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        </>
                                    ) : (
                                        <div className="flex flex-wrap gap-1">
                                            {patterns.filter(p => selectedRules[p.pattern_id] && selectedRules[p.pattern_id].type !== 'master').map(p => {
                                                const isSelected = (clause.pattern_ids ?? []).includes(p.pattern_id);
                                                return (
                                                    <button
                                                        key={p.pattern_id}
                                                        type="button"
                                                        data-testid={`gt-clause-pattern-${p.pattern_id}`}
                                                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                                            isSelected
                                                                ? 'bg-[--cb-brand] text-white border-[--cb-brand]'
                                                                : 'border-[--cb-border-default] text-[--cb-text-secondary] hover:border-[--cb-border-strong]'
                                                        }`}
                                                        onClick={() => toggleComboPattern(p.pattern_id, ci)}
                                                    >
                                                        {p.name}
                                                    </button>
                                                );
                                            })}
                                            {patterns.filter(p => selectedRules[p.pattern_id]).length === 0 && (
                                                <span className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_clause_select_first')}</span>
                                            )}
                                        </div>
                                    )}

                                    {comboClauses.length > 1 && (
                                        <button type="button" className="text-xs text-[--cb-danger] hover:underline ml-auto" onClick={() => removeClause(ci)}>
                                            {t('admin.gametypes_clause_remove')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button type="button" className="cb-btn cb-btn-ghost cb-btn-xs" data-testid="gt-combo-add-clause" onClick={addClause}>
                                {t('admin.gametypes_clause_add')}
                            </button>
                            <button type="button" className="cb-btn cb-btn-outline cb-btn-xs" data-testid="gt-combo-add" onClick={addCombination}
                                disabled={!comboName || !comboWeight || comboClauses.length === 0}
                            >
                                {editingComboIdx !== null ? t('admin.gametypes_combo_update') : t('admin.gametypes_combo_add')}
                            </button>
                            {editingComboIdx !== null && (
                                <button type="button" className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]" onClick={() => {
                                    setComboName('');
                                    setComboWeight('1');
                                    setComboClauses([{ type: 'all_of', pattern_ids: [] }]);
                                    setEditingComboIdx(null);
                                }}>
                                    {t('admin.gametypes_combo_cancel')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <button type="button" className="cb-btn cb-btn-outline self-start" data-testid="gt-suggest" onClick={handleSuggest} disabled={suggesting}>
                    {suggesting
                        ? <><span className="cb-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> {t('common.loading')}</>
                        : `✨ ${t('admin.gametypes_suggest')}`
                    }
                </button>

                {editComboGtId ? (
                    <div className="flex gap-2 self-start">
                        <button type="button" className="cb-btn cb-btn-primary" data-testid="gt-save-combos" disabled={savingCombos} onClick={saveEditedCombinations}>
                            {savingCombos ? t('common.saving') : t('admin.gametypes_save_combos', { id: editComboGtId })}
                        </button>
                        <button type="button" className="cb-btn cb-btn-ghost" disabled={savingCombos} onClick={cancelEditCombinations}>
                            {t('admin.gametypes_cancel_edit')}
                        </button>
                    </div>
                ) : (
                    <button type="submit" className="cb-btn cb-btn-primary self-start" data-testid="gt-create" disabled={saving}>
                        {saving ? t('common.saving') : t('admin.gametypes_create')}
                    </button>
                )}
            </form>

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('admin.gametypes_loading')}</span></div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26rem, 1fr))' }}>
                    {gametypes.map(gt => {
                        const meta = metadataMap[gt.gametype_id];
                        return (
                            <div key={gt.gametype_id} className="cb-card p-4 flex flex-col gap-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="font-bold text-[--cb-text-primary]">{gt.name}</span>
                                        <span className="text-xs text-[--cb-text-tertiary] ml-2 font-mono">#{gt.gametype_id}</span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button data-testid="gt-edit-combos" className="text-xs text-[--cb-brand] hover:underline" onClick={() => startEditCombinations(gt)}>{t('admin.gametypes_edit_combos_btn')}</button>
                                        <button className="text-xs text-[--cb-danger] hover:underline" onClick={() => handleDelete(gt.gametype_id)}>{t('admin.gametypes_delete_btn')}</button>
                                    </div>
                                </div>
                                <span className="text-xs text-[--cb-text-secondary]">{t('admin.gametypes_multiplier_display')}<strong>{gt.base_multiplier}x</strong></span>

                                {/* Regras com tipo */}
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {gt.rules.map(r => {
                                        const ruleMeta = getPatternMeta(gt.gametype_id, r.pattern_id);
                                        const ptype = ruleMeta?.type ?? 'simple';
                                        return (
                                            <span key={r.pattern_id} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[ptype] ?? TYPE_COLORS.simple}`}>
                                                #{r.pattern_id} <strong>{(r.weight / 100).toFixed(2)}x</strong>
                                                <span className="ml-1 opacity-70">({ptype})</span>
                                            </span>
                                        );
                                    })}
                                </div>

                                {/* Combinações */}
                                {meta?.combinations && meta.combinations.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-[--cb-border-default]">
                                        <span className="text-xs text-[--cb-text-tertiary] font-semibold">{t('admin.gametypes_combinations_display')}</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {meta.combinations.map((c, i) => (
                                                <span key={i} className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded-full font-medium" title={c.clauses?.map(cl => {
                                                    if (cl.type === 'n_of_type') return `${cl.count ?? 1}× ${cl.pattern_type}`;
                                                    return `${cl.type === 'all_of' ? 'todos' : 'qualquer'}[${(cl.pattern_ids ?? []).join(',')}]`;
                                                }).join(' E ')}>
                                                    {c.name} <strong>{(c.weight / 100).toFixed(2)}x</strong>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {gametypes.length === 0 && <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.gametypes_empty')}</p>}
                </div>
            )}
        </div>
    );
}
