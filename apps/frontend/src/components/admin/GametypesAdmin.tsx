import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminGametypes, createAdminGametype, deleteAdminGametype, fetchAdminPatterns, fetchGametypeMetadata, upsertGametypeMetadata, simulateWeights, type BlockchainGametype, type BlockchainPattern, type ExtendedRule, type CombinationRuleInput, type CombinationClauseInput, type McPatternStats, type McResult } from '../../services/api';

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

    // Fix: use destructuring properly
    const updateRuleField = (patternId: string, field: 'weight' | 'type', value: string) => {
        setSelectedRules(prev => {
            if (!prev[patternId]) return prev;
            return { ...prev, [patternId]: { ...prev[patternId], [field]: value } };
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
        if (!valid) return;
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
            });
            await upsertGametypeMetadata(String(gametype_id), { rules: rules_extended, combinations }).catch(() => {});
            setName('');
            setBaseMultiplier('1.0');
            setSelectedRules({});
            setCombinations([]);
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
    // Com 45 bolas: hit_rates realistas (7-50% para linhas, <5% para padrões complexos)
    // → pesos acima de 100 para todas as configurações → calibração converge para 85% RTP.
    // Com 75 (padrão): todas as cartelas completam todos os padrões → hit_rate=100% → RTP≥100%.
    const SUGGEST_MAX_BALLS = 45;

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
                simulations:     5_000,
                max_balls:       SUGGEST_MAX_BALLS,
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

            // ── Phase 2b: Gera combinações candidatas ─────────────────────────────
            // Usa hit_rates da Phase 1 (independem de pesos) e pesos já atualizados.
            const byType = buildByType(activeRulesExt);
            const combos = mcPatterns.length >= 2
                ? buildCombos(activePatterns, byType, phase1)
                : [];

            // ── Phase 3: Calibração iterativa de RTP ─────────────────────────────
            // Parte de pesos próximos ao alvo → converge em 1-3 iterações.
            const cal = await calibrateRtp(activePatterns, combos, baseMul, name || 'Gametype');

            // ── Aplica resultados: pesos calibrados (Phase 3) têm precedência ─────
            setSelectedRules(prev => {
                const next = { ...prev };
                if (cal) {
                    // Converte nome → pattern_id para atualizar selectedRules
                    const nameToId: Record<string, string> = {};
                    for (const p of mcPatterns) nameToId[p.name] = String(p.pattern_id);
                    for (const [patName, wHundredths] of Object.entries(cal.pattern_weights)) {
                        const pid = nameToId[patName];
                        if (pid && next[pid]) next[pid] = { ...next[pid], weight: (wHundredths / 100).toFixed(2) };
                    }
                } else {
                    // Fallback: aplica pesos da Phase 2
                    for (const r of activeRulesExt) {
                        if (next[r.pattern_id]) next[r.pattern_id] = { ...next[r.pattern_id], weight: (r.weight / 100).toFixed(2) };
                    }
                }
                return next;
            });
            applyCombos(combos, cal);

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
     * Calibração iterativa de RTP via busca binária sobre o fator de escala global.
     *
     * Por que busca binária e não escala simples (target/rtp)?
     * - Com floors de peso (min=10), a escala simples oscila: pesos batem no floor,
     *   o RTP não cai mais, o próximo scale tenta subir, oscila infinitamente.
     * - A busca binária rastreia limites [lo, hi] do fator de escala e bisecta,
     *   convergindo monotonicamente mesmo com floors.
     *
     * max_balls=SUGGEST_MAX_BALLS garante hit_rates < 100% → pesos > 10 → sem floor trap.
     */
    const calibrateRtp = async (
        patterns: { name: string; weight: number; mask: number; pattern_id: number; pattern_type?: string }[],
        combos: CombinationRuleInput[],
        baseMul: number,
        gtName: string,
    ): Promise<{ pattern_weights: Record<string, number>; combo_weights: Record<string, number> } | null> => {
        const TARGET   = 0.85;
        const TOL      = 0.015; // ±1.5%
        const MAX_ITER = 15;    // suficiente para busca binária convergir em ≤15 bisecções

        const patW: Record<string, number> = {};
        for (const p of patterns) patW[p.name] = p.weight;
        const comW: Record<string, number> = {};
        for (const c of combos) comW[c.name] = c.weight;

        // Limites do fator de escala global para busca binária
        let scaleLo = 0.05;  // escala mínima (pesos muito baixos)
        let scaleHi = 20.0;  // escala máxima (pesos muito altos)
        let lastRtp = -1;

        for (let iter = 0; iter < MAX_ITER; iter++) {
            const result = await simulateWeights({
                gametype_name:    gtName,
                base_multiplier:  baseMul,
                patterns:         patterns.map(p => ({ ...p, weight: patW[p.name] })),
                combinations:     combos.map(c => ({ ...c, weight: comW[c.name] })),
                simulations:      5_000,
                max_balls:        SUGGEST_MAX_BALLS,
            });

            const rtp = result.rtp;

            // Convergiu
            if (rtp >= TARGET - TOL && rtp <= TARGET + TOL) break;
            // Sem vencedores: pesos muito baixos, forçar escala máxima
            if (result.total_paid_out <= 0) {
                scaleLo = Math.max(scaleLo, 2.0);
            }
            // Sem alteração útil entre iterações (travado no floor)
            if (Math.abs(rtp - lastRtp) < 0.001 && iter > 2) break;
            lastRtp = rtp;

            // Busca binária: estreita os limites com base no sinal do erro
            if (rtp > TARGET) scaleHi = Math.min(scaleHi, TARGET / rtp * 1.1);
            else              scaleLo = Math.max(scaleLo, TARGET / rtp * 0.9);

            const scale = (scaleLo + scaleHi) / 2;
            for (const nm of Object.keys(patW)) patW[nm] = clamp(Math.round(patW[nm] * scale), 10, 25500);
            for (const nm of Object.keys(comW)) comW[nm] = clamp(Math.round(comW[nm] * scale), 10, 25500);

            // Reinicia os limites relativos ao novo estado dos pesos
            scaleLo = 0.05;
            scaleHi = 20.0;
        }

        return { pattern_weights: patW, combo_weights: comW };
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
                {/* Nome e Base Multiplier */}
                <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_name')}</label>
                        <input className="cb-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.gametypes_name_placeholder')} required />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_multiplier')}</label>
                        <input className="cb-input font-mono w-28" type="number" step="0.1" min="0.1" value={baseMultiplier} onChange={e => setBaseMultiplier(e.target.value)} required />
                    </div>
                </div>

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
                                                    className="w-14 text-xs font-mono px-1 py-0.5 rounded border border-[--cb-border-default] bg-transparent text-center"
                                                    type="number" min="1" step="0.01" value={sel.weight}
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
                                <input className="cb-input text-xs w-28" value={comboName} onChange={e => setComboName(e.target.value)} placeholder={t('admin.gametypes_combo_name_placeholder')} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-[--cb-text-tertiary]">{t('admin.gametypes_combo_weight')}</label>
                                <input className="cb-input text-xs w-20 font-mono" type="number" min="1" step="0.01" value={comboWeight} onChange={e => setComboWeight(e.target.value)} />
                            </div>
                        </div>

                        {/* Cláusulas */}
                        <div className="flex flex-col gap-2">
                            <span className="text-xs text-[--cb-text-tertiary] font-semibold">{t('admin.gametypes_clauses')}</span>
                            {comboClauses.map((clause, ci) => (
                                <div key={ci} className="flex flex-wrap items-start gap-2 p-2 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated]">
                                    <select
                                        className="text-xs px-1 py-0.5 rounded border border-[--cb-border-default] bg-[--cb-bg-elevated] text-[--cb-text-primary]"
                                        value={clause.type}
                                        onChange={e => updateClause(ci, { type: e.target.value as CombinationClauseInput['type'], pattern_ids: [], pattern_type: undefined, count: undefined })}
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
                                            {patterns.filter(p => selectedRules[p.pattern_id]).map(p => {
                                                const isSelected = (clause.pattern_ids ?? []).includes(p.pattern_id);
                                                return (
                                                    <button
                                                        key={p.pattern_id}
                                                        type="button"
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
                            <button type="button" className="cb-btn cb-btn-ghost cb-btn-xs" onClick={addClause}>
                                {t('admin.gametypes_clause_add')}
                            </button>
                            <button type="button" className="cb-btn cb-btn-outline cb-btn-xs" onClick={addCombination}
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

                <button type="button" className="cb-btn cb-btn-outline self-start" onClick={handleSuggest} disabled={suggesting}>
                    {suggesting
                        ? <><span className="cb-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> {t('common.loading')}</>
                        : `✨ ${t('admin.gametypes_suggest')}`
                    }
                </button>

                <button type="submit" className="cb-btn cb-btn-primary self-start" disabled={saving}>
                    {saving ? t('common.saving') : t('admin.gametypes_create')}
                </button>
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
                                    <button className="text-xs text-[--cb-danger] hover:underline" onClick={() => handleDelete(gt.gametype_id)}>{t('admin.gametypes_delete_btn')}</button>
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
