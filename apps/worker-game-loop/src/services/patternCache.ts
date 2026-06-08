// apps/worker-game-loop/src/services/patternCache.ts
// Cache Redis para padrões on-chain (PatternEntry[]).
//
// Estrutura:
//   Chave: worker:pattern:gametype:{gametypeId}  (≠ api-gateway: pattern:gametype:{id})
//   Valor: JSON — PatternEntry[] com mask serializado como string
//   TTL:   3600s (1h) — padrões mudam raramente
//
// Fallback: se Redis está indisponível, busca direto da blockchain.
//
// Ref: ADR-004 Fase 2

import { redisClient } from './redis';
import { rpcClient }   from '@cryptobingo/blockchain-core';
import { UInt64 }      from '@wharfkit/antelope';
import type { BlockchainGametype, BlockchainPattern } from '@cryptobingo/shared-types';

const CONTRACT_ACCOUNT    = process.env.CONTRACT_ACCOUNT || 'bingo.game';
const PATTERN_CACHE_TTL   = 3_600; // 1 hora

export interface PatternEntry {
    name:   string;
    mask:   bigint;
    weight: number;
}

interface PatternEntrySerialized {
    name:   string;
    mask:   string; // bigint serializado como string
    weight: number;
}

function cacheKey(gametypeId: string): string {
    // Chave exclusiva do worker (PatternEntry[]) — não colide com a chave
    // do api-gateway (pattern:gametype:{id}) que grava o formato rico
    // {patterns, rules, combinations} usado pelo combinationEvaluator.
    return `worker:pattern:gametype:${gametypeId}`;
}

/**
 * Busca os padrões diretamente da blockchain (sem cache).
 * Usado internamente como fallback.
 */
async function fetchPatternsFromChain(gametypeId: string): Promise<PatternEntry[]> {
    const gtRes = await rpcClient.v1.chain.get_table_rows({
        code:        CONTRACT_ACCOUNT,
        scope:       CONTRACT_ACCOUNT,
        table:       'gametypes',
        lower_bound: UInt64.from(gametypeId),
        upper_bound: UInt64.from(gametypeId),
        limit:       1,
        json:        true,
    });

    if (!gtRes.rows.length) {
        throw new Error(`[PatternCache] gametype_id ${gametypeId} não encontrado on-chain.`);
    }

    const gametype = gtRes.rows[0] as BlockchainGametype;
    const entries: PatternEntry[] = [];

    for (const rule of gametype.rules) {
        const patId = UInt64.from(String(rule.pattern_id));
        const patRes = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'patterns',
            lower_bound: patId,
            upper_bound: patId,
            limit:       1,
            json:        true,
        });

        if (patRes.rows.length) {
            const pattern = patRes.rows[0] as BlockchainPattern;
            entries.push({
                name:   pattern.name,
                mask:   BigInt(pattern.mask),
                weight: rule.weight,
            });
        }
    }

    if (entries.length === 0) {
        throw new Error(`[PatternCache] Nenhum padrão encontrado para gametype_id ${gametypeId}.`);
    }
    return entries;
}

/**
 * Tenta obter padrões do cache Redis.
 * Retorna null em cache miss ou erro de conexão.
 */
async function getFromCache(gametypeId: string): Promise<PatternEntry[] | null> {
    try {
        if (!redisClient.isOpen) return null;
        const raw = await redisClient.get(cacheKey(gametypeId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as PatternEntrySerialized[];
        return parsed.map(p => ({ name: p.name, mask: BigInt(p.mask), weight: p.weight }));
    } catch {
        return null;
    }
}

/**
 * Armazena padrões no cache Redis.
 * Falhas de conexão são silenciosas (fail-open).
 */
async function setInCache(gametypeId: string, patterns: PatternEntry[]): Promise<void> {
    try {
        if (!redisClient.isOpen) return;
        const serialized: PatternEntrySerialized[] = patterns.map(p => ({
            name:   p.name,
            mask:   p.mask.toString(),
            weight: p.weight,
        }));
        await redisClient.set(cacheKey(gametypeId), JSON.stringify(serialized), {
            EX: PATTERN_CACHE_TTL,
        });
    } catch (err) {
        console.warn(`[PatternCache] Erro ao cachear gametype ${gametypeId}:`, err);
    }
}

/**
 * Busca padrões com cache Redis.
 * - Cache hit → retorna do Redis
 * - Cache miss → busca da blockchain e popula o cache
 * - Redis indisponível → fallback direto para blockchain
 */
export async function fetchPatternsWithCache(gametypeId: string): Promise<PatternEntry[]> {
    const cached = await getFromCache(gametypeId);
    if (cached) {
        console.log(`[PatternCache] Cache hit para gametype ${gametypeId} (${cached.length} padrões)`);
        return cached;
    }

    console.log(`[PatternCache] Cache miss para gametype ${gametypeId} — buscando on-chain...`);
    const patterns = await fetchPatternsFromChain(gametypeId);
    await setInCache(gametypeId, patterns);
    return patterns;
}

/**
 * Invalida o cache de padrões de um gametype (ex: após admin upsert).
 */
export async function clearPatternCache(gametypeId: string): Promise<void> {
    try {
        if (!redisClient.isOpen) return;
        await redisClient.del(cacheKey(gametypeId));
        console.log(`[PatternCache] Cache invalidado para gametype ${gametypeId}`);
    } catch (err) {
        console.warn(`[PatternCache] Erro ao limpar cache do gametype ${gametypeId}:`, err);
    }
}
