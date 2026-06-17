// consumableService.ts — Decremento de usos em NFTs consumíveis (ADR-028 §3).
//
// Após `claimwin` (PRIZE_BOOST) ou `buytickets` (TICKET_DISCOUNT) com NFT consumível
// (max_uses > 0), o worker decrementa o campo de usos em mutable_serialized_data via
// atomicassets::setassetdata. Requer bingogamesvc como authorized_account na coleção.
//
// Fluxo: lê nftconfigs → acha regra com max_uses > 0 → lê mutable data do asset →
// decrementa campo → chama setassetdata com ATTRIBUTE_MAP completo.

import { rpcClient } from '@cryptobingo/blockchain-core';
import { getAssetMutableData, buildAttributeMap } from './atomicSchema';
import { executeSetAssetData } from './blockchain';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const ATOMIC_ACCOUNT   = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';

export interface ConsumableRule {
    maxUses:     number;
    usesField:   string;  // nome do campo em mutable_data (ex: "uses_remaining")
    ruleType:    number;
}

// ── Leitura de regras consumíveis ─────────────────────────────────────────

/** Retorna a regra consumível (max_uses > 0) do template, ou null se não for consumível. */
export async function getConsumableRule(templateId: string | number): Promise<ConsumableRule | null> {
    const res: any = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'nftconfigs',
        lower_bound: templateId as any, upper_bound: templateId as any,
        limit: 1, json: true,
    });
    const row = (res.rows as any[])?.[0];
    if (!row) return null;

    for (const r of (row.rules ?? [])) {
        if ((r.max_uses ?? 0) > 0) {
            return {
                maxUses:   r.max_uses,
                usesField: r.schema_field || 'uses_remaining',
                ruleType:  r.type,
            };
        }
    }
    return null;
}

// ── Leitura do contador de usos atual ────────────────────────────────────

/**
 * Lê o valor atual do campo de usos da NFT em mutable_data.
 * Retorna null se o campo não existir ou não for legível.
 */
export async function getCurrentUses(
    owner:      string,
    assetId:    string,
    collection: string,
    usesField:  string,
): Promise<number | null> {
    const { decoded } = await getAssetMutableData(owner, assetId, collection);
    const val = decoded[usesField];
    if (val === undefined || val === null) return null;
    const n = typeof val === 'string' ? parseInt(val, 10) : Number(val);
    return isNaN(n) ? null : n;
}

// ── Decremento ────────────────────────────────────────────────────────────

/**
 * Decrementa um uso da NFT consumível. Retorna true se bem-sucedido.
 * No-op se campo não encontrado, já em 0, ou se setassetdata falhar.
 */
export async function decrementNftUse(
    owner:      string,
    assetId:    string,
    collection: string,
    usesField:  string,
): Promise<boolean> {
    const { decoded, format } = await getAssetMutableData(owner, assetId, collection);
    const cur = decoded[usesField];
    if (cur === undefined || cur === null) {
        console.warn(`⚠️ [consumable] campo "${usesField}" ausente em asset ${assetId}`);
        return false;
    }
    const curNum = typeof cur === 'string' ? parseInt(cur, 10) : Number(cur);
    if (isNaN(curNum) || curNum <= 0) {
        console.warn(`⚠️ [consumable] asset ${assetId} já sem usos restantes`);
        return false;
    }

    decoded[usesField] = curNum - 1;
    const attributeMap = buildAttributeMap(decoded, format);

    try {
        await executeSetAssetData(owner, assetId, collection, attributeMap);
        return true;
    } catch (e: any) {
        console.warn(`⚠️ [consumable] setassetdata falhou asset ${assetId}: ${e?.message ?? e}`);
        return false;
    }
}

// ── API pública: processa lote de NFTs usadas ─────────────────────────────

/**
 * Verifica e decrementa usos de cada NFT em `usedNftIds`.
 * Busca template de cada asset on-chain para determinar collection/templateId.
 * Fire-and-forget seguro: erros são logados, nunca lançados.
 */
export async function decrementUsedNfts(owner: string, usedNftIds: string[]): Promise<void> {
    if (!usedNftIds.length) return;

    for (const assetId of usedNftIds) {
        try {
            // Lê o asset para obter template_id e collection_name
            const assetsRes: any = await rpcClient.v1.chain.get_table_rows({
                code: ATOMIC_ACCOUNT, scope: owner, table: 'assets',
                lower_bound: assetId as any, upper_bound: assetId as any,
                limit: 1, json: true,
            });
            const asset = assetsRes.rows?.[0];
            if (!asset) continue;

            const templateId  = String(asset.template_id);
            const collection  = String(asset.collection_name);
            const consumable  = await getConsumableRule(templateId);
            if (!consumable) continue;

            await decrementNftUse(owner, assetId, collection, consumable.usesField);
        } catch (e: any) {
            console.warn(`⚠️ [consumable] decrementUsedNfts falhou asset ${assetId}: ${e?.message ?? e}`);
        }
    }
}
