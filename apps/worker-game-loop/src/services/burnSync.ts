// burnSync.ts — Sincronização de burns de NFT (ADR-028 §8).
//
// Burn é detectado off-chain e registrado no contrato via recordburn (que gera
// grants BURN_TO_CLAIM). Em produção a fonte de verdade é a API do AtomicAssets
// (AtomicHub indexer expõe /burns). No dev local não há indexer, então a detecção
// é por ausência: um asset que o jogador TINHA e não está mais na sua carteira
// on-chain é tratado como queimado.
//
// Limitação assumida: sem indexer, transferência e burn são indistinguíveis. A
// fonte de candidatos (assets que o jogador tinha) vem do chamador — sync manual
// (perfil) ou um cron que mantém o snapshot anterior.

import { rpcClient } from '@cryptobingo/blockchain-core';
import { executeRecordBurn } from './blockchain';
import { awardBurnXP } from './xpEngine';
import { logger } from './logger';

const ATOMIC_ACCOUNT = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';

export interface BurnCandidate {
    assetId:    string;
    templateId: number | string;
    collection: string;
}

/** Retorna o conjunto de asset_ids atualmente na carteira on-chain do `owner`. */
export async function getOwnedAssetIds(owner: string): Promise<Set<string>> {
    const owned = new Set<string>();
    let lowerBound: string | undefined = undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: ATOMIC_ACCOUNT, scope: owner, table: 'assets',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const a of (res.rows as any[])) owned.add(String(a.asset_id));
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }
    return owned;
}

/**
 * Sincroniza burns: dos `candidates` (assets que o jogador tinha), registra via
 * recordburn os que não estão mais na carteira. Idempotente (o contrato rejeita
 * asset_id já registrado; tratamos a rejeição como no-op). Retorna os asset_ids
 * efetivamente registrados nesta passagem.
 */
export async function syncBurns(owner: string, candidates: BurnCandidate[]): Promise<string[]> {
    if (!candidates.length) return [];
    const owned = await getOwnedAssetIds(owner);

    const recorded: string[] = [];
    for (const c of candidates) {
        if (owned.has(c.assetId)) continue; // ainda possui → não queimou
        try {
            await executeRecordBurn(owner, c.assetId, c.templateId, c.collection);
            recorded.push(c.assetId);
            awardBurnXP(owner, c.collection, c.templateId).catch(() => {});
        } catch (e: any) {
            // "Burn ja registrado" → idempotente; demais erros logam e seguem
            const msg = String(e?.message ?? e);
            if (!/ja registrado/i.test(msg)) {
                logger.warn({ tag: 'burnSync' }, `recordburn falhou para asset ${c.assetId}: ${msg}`)
            }
        }
    }
    return recorded;
}
