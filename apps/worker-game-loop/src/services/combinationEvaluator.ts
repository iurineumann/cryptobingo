// apps/worker-game-loop/src/services/combinationEvaluator.ts
//
// ADR-016 — Avaliação de COMBINAÇÕES de padrões como tier de prêmio superior.
//
// Arquitetura:
//   • O PESO de cada combinação é a fonte-de-verdade ON-CHAIN (gametype.combinations,
//     combo_id → weight). O contrato valida em claimcombo, impedindo inflar prêmio.
//   • As CLÁUSULAS (all_of/any_of/n_of_type) e os TIPOS de padrão (simple/special/
//     master) são off-chain (MongoDB), expostos pelo endpoint do api-gateway
//     GET /gametypes/:id/patterns. combo_id = índice canônico (alinhado ao on-chain).
//
// O worker, por cartela, escolhe o MAIOR peso entre {padrões vencedores, combinações
// satisfeitas} (regra max_weight, ADR-005). Combinações aninhadas são naturalmente
// resolvidas pela seleção do maior peso.

import { fetchPatternsWithCache, type PatternEntry } from './patternCache';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://api-gateway:8080';
const COMBO_CACHE_TTL_MS = 60_000; // 1 min — alinhado à invalidação por setcombos

export type ClauseType = 'all_of' | 'any_of' | 'n_of_type';

export interface ComboClause {
    type:          ClauseType;
    pattern_ids?:  string[];
    pattern_type?: string;
    count?:        number;
}

export interface ComboDef {
    combo_id: number;
    name:     string;
    weight:   number;        // hundredths (100 = 1×)
    clauses:  ComboClause[];
}

export interface ComboContext {
    combos:            ComboDef[];
    patternTypeByName: Map<string, string>; // nome do padrão → simple|special|master
    patternNameById:   Map<string, string>; // pattern_id → nome
}

interface ApiPatternsResponse {
    patterns:     Array<{ pattern_id?: string; name: string; mask: string; weight: number }>;
    rules:        Array<{ pattern_id: string; weight: number; type: string }>;
    combinations: Array<{ combo_id?: number; name: string; weight: number; clauses: ComboClause[] }>;
}

const cache = new Map<string, { ctx: ComboContext; expires: number }>();

/**
 * Busca e monta o contexto de combinações de um gametype (com cache curto em memória).
 * Combina padrões on-chain + rules/combinações off-chain do endpoint do api-gateway.
 * Em falha, retorna contexto vazio (fail-safe → paga só por padrão).
 */
export async function fetchComboContext(
  gametypeId: string,
  onChainPatterns?: PatternEntry[],
): Promise<ComboContext> {
    const cached = cache.get(gametypeId);
    if (cached && cached.expires > Date.now()) return cached.ctx;

    const empty: ComboContext = { combos: [], patternTypeByName: new Map(), patternNameById: new Map() };
    try {
        const res = await fetch(`${API_GATEWAY_URL}/api/v1/gametypes/${gametypeId}/patterns`);
        if (!res.ok) return empty;
        const data = await res.json() as ApiPatternsResponse;

        // Mapeia nome do gateway -> type (do rules), para cruzar com on-chain
        const typeByNameGateway = new Map<string, string>();
        for (const r of data.rules ?? []) {
            const gp = (data.patterns ?? []).find(p => String(p.pattern_id) === String(r.pattern_id));
            if (gp) typeByNameGateway.set(gp.name, r.type);
        }

        // Padrões on-chain = fonte de verdade para NOMES (ADR-016).
        // Se não vieram do caller, busca do cache/on-chain.
        const onChain = onChainPatterns ?? (await fetchPatternsWithCache(gametypeId).catch(() => null));
        const patternNameById   = new Map<string, string>();
        const patternTypeByName = new Map<string, string>();

        if (onChain && onChain.length) {
            // CHAVE = nome ON-CHAIN (igual ao wonPatternNames do evaluator)
            for (const op of onChain) {
                patternTypeByName.set(op.name, typeByNameGateway.get(op.name) ?? 'simple');
            }
            // patternNameById: gateway pattern_id -> nome on-chain (p/ all_of/any_of)
            for (const gp of data.patterns ?? []) {
                const oc = onChain.find(o => o.name === gp.name);
                if (oc) patternNameById.set(String(gp.pattern_id), oc.name);
            }
        } else {
            // Fallback: mantém comportamento anterior (nomes do gateway)
            const typeById = new Map<string, string>();
            for (const r of data.rules ?? []) typeById.set(String(r.pattern_id), r.type);
            for (const p of data.patterns ?? []) {
                if (p.pattern_id !== undefined) {
                    patternNameById.set(String(p.pattern_id), p.name);
                    patternTypeByName.set(p.name, typeById.get(String(p.pattern_id)) ?? 'simple');
                }
            }
        }

        const combos: ComboDef[] = (data.combinations ?? []).map((c, i) => ({
            combo_id: c.combo_id ?? i,           // fallback p/ índice (alinhado ao on-chain)
            name:     c.name,
            weight:   c.weight,
            clauses:  c.clauses ?? [],
        }));

        const ctx: ComboContext = { combos, patternTypeByName, patternNameById };
        cache.set(gametypeId, { ctx, expires: Date.now() + COMBO_CACHE_TTL_MS });
        return ctx;
    } catch {
        return empty;
    }
}

/** Limpa o cache de combos (usado em testes / após setcombos). */
export function clearComboCache(gametypeId?: string): void {
    if (gametypeId) cache.delete(gametypeId);
    else cache.clear();
}

/**
 * Verifica se uma combinação é satisfeita pelo conjunto de padrões vencedores.
 * Cláusulas são combinadas com AND (todas devem ser satisfeitas).
 * Porta da lógica do frontend (ticketUtils.isCombinationSatisfied) — ADR-016.
 */
export function isComboSatisfied(
    combo:             ComboDef,
    wonPatternNames:   Set<string>,
    patternTypeByName: Map<string, string>,
    patternNameById:   Map<string, string>,
): boolean {
    // Resolve ids → nomes para cláusulas all_of/any_of
    const wonWithIds = new Set<string>(wonPatternNames);
    for (const [id, name] of patternNameById) {
        if (wonPatternNames.has(name)) wonWithIds.add(id);
    }
    return combo.clauses.every(clause => {
        if (clause.type === 'all_of') {
            return (clause.pattern_ids ?? []).every(id => wonWithIds.has(id));
        }
        if (clause.type === 'any_of') {
            return (clause.pattern_ids ?? []).some(id => wonWithIds.has(id));
        }
        if (clause.type === 'n_of_type') {
            const needed = clause.count ?? 1;
            const type   = clause.pattern_type ?? 'simple';
            let count    = 0;
            for (const name of wonPatternNames) {
                if (patternTypeByName.get(name) === type) count++;
            }
            return count >= needed;
        }
        return false;
    });
}

/**
 * Dentre as combinações satisfeitas pela cartela, retorna a de MAIOR peso.
 * Retorna null se nenhuma combinação for satisfeita.
 */
export function bestSatisfiedCombo(
    wonPatternNames: string[],
    ctx:             ComboContext,
): { combo_id: number; weight: number; name: string } | null {
    if (!ctx.combos.length) return null;
    const wonSet = new Set(wonPatternNames);
    let best: { combo_id: number; weight: number; name: string } | null = null;
    for (const combo of ctx.combos) {
        if (!isComboSatisfied(combo, wonSet, ctx.patternTypeByName, ctx.patternNameById)) continue;
        if (!best || combo.weight > best.weight) {
            best = { combo_id: combo.combo_id, weight: combo.weight, name: combo.name };
        }
    }
    return best;
}
