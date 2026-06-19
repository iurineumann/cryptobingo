// nftMechanics.ts — Motor de mecânicas NFT off-chain (ADR-028 §7).
//
// Pré-computa, para um vencedor, os asset_ids de NFTs com regra PRIZE_BOOST
// elegível. O contrato re-valida ownership + regra e aplica o MAIOR boost
// (claimwin valida on-chain — o worker apenas seleciona, não infla o prêmio,
// mesmo princípio do max_weight de combos).

import { rpcClient } from '@cryptobingo/blockchain-core';
import { getTemplateSchema } from './atomicSchema';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const ATOMIC_ACCOUNT   = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';

// Tipos das regras NFT (espelha o enum on-chain — ADR-028 §1)
const RULE_PRIZE_BOOST    = 2;
const VALUE_FIXED         = 0;
const VALUE_SCHEMA_FIELD  = 1;
const COND_OWNS           = 0;

interface NftRule {
    type:         number;
    value_origin: number;
    fixed_value:  number;
    schema_field: string;
    condition:    number;
}
interface NftConfigRow {
    template_id:     number | string;
    collection_name: string;
    rules:           NftRule[];
}

// template_id → { collection, boost(hundredths) } para regras PRIZE_BOOST (FIXED ou SCHEMA_FIELD) owns
type BoostMap = Map<string, { collection: string; boost: number }>;

let _boostCache: { map: BoostMap; at: number } | null = null;
const BOOST_TTL_MS = 60_000;

/**
 * Resolve o boost de uma regra VALUE_SCHEMA_FIELD lendo immutable_serialized_data do
 * template. O campo deve ser numérico (hundredths). Retorna 0 em caso de erro.
 */
async function resolveSchemaFieldBoost(
    collection: string,
    templateId: string | number,
    fieldName:  string,
): Promise<number> {
    try {
        const attrs = await getTemplateSchema(collection, templateId);
        const raw = attrs[fieldName];
        if (raw === undefined || raw === null) return 0;
        const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
        return isNaN(n) || n <= 0 ? 0 : n;
    } catch {
        return 0;
    }
}

/** Lê nftconfigs on-chain e indexa templates com PRIZE_BOOST (FIXED ou SCHEMA_FIELD) owns. Cache 60s. */
async function getBoostTemplates(): Promise<BoostMap> {
    if (_boostCache && Date.now() - _boostCache.at < BOOST_TTL_MS) return _boostCache.map;

    const map: BoostMap = new Map();
    let lowerBound: string | undefined = undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'nftconfigs',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const row of (res.rows as NftConfigRow[])) {
            let best = 0;
            for (const r of (row.rules || [])) {
                if (r.type !== RULE_PRIZE_BOOST || r.condition !== COND_OWNS) continue;

                let candidate = 0;
                if (r.value_origin === VALUE_FIXED) {
                    candidate = r.fixed_value ?? 0;
                } else if (r.value_origin === VALUE_SCHEMA_FIELD && r.schema_field) {
                    candidate = await resolveSchemaFieldBoost(
                        row.collection_name,
                        row.template_id,
                        r.schema_field,
                    );
                }
                if (candidate > best) best = candidate;
            }
            if (best > 100) {
                map.set(String(row.template_id), { collection: row.collection_name, boost: best });
            }
        }
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }

    _boostCache = { map, at: Date.now() };
    return map;
}

/**
 * Retorna os asset_ids (string) de NFTs do `owner` que carregam PRIZE_BOOST,
 * ordenados por boost decrescente (o contrato aplica o maior; a ordem ajuda a
 * distribuição entre tickets quando o caller usa o mesmo conjunto).
 * Retorna [] se não houver — claimwin aceita lista vazia.
 */
export async function getBoostNftIds(owner: string): Promise<string[]> {
    const boostTemplates = await getBoostTemplates();
    if (boostTemplates.size === 0) return [];

    const owned: { assetId: string; boost: number }[] = [];
    let lowerBound: string | undefined = undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: ATOMIC_ACCOUNT, scope: owner, table: 'assets',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const asset of (res.rows as any[])) {
            const tpl = String(asset.template_id);
            const cfg = boostTemplates.get(tpl);
            if (cfg && cfg.collection === asset.collection_name) {
                owned.push({ assetId: String(asset.asset_id), boost: cfg.boost });
            }
        }
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }

    owned.sort((a, b) => b.boost - a.boost);
    return owned.map(o => o.assetId);
}

/** Limpa o cache de templates de boost (usado em testes). */
export function _resetBoostCache(): void { _boostCache = null; }
