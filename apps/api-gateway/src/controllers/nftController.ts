// apps/api-gateway/src/controllers/nftController.ts
// Sincroniza o inventário AtomicAssets do jogador com o MongoDB (nfts_cache).
// Ref: architecture.md §6.2, PROJECT-DETAILS.md §3 (ADR-004)

import { Request, Response } from 'express';
import { rpcClient }         from '@cryptobingo/blockchain-core';
import { UserProfile }       from '../models/UserProfile';
import type { MongoNftCache } from '@cryptobingo/shared-types';

const ATOMIC_CONTRACT  = 'atomicassets';
const BINGO_COLLECTION = 'cryptobingo1';
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT ?? 'bingogamectr';

const RULE_TICKET_DISCOUNT = 1;
const COND_OWNS            = 0;
const VALUE_FIXED          = 0;

// ==========================================
// GET /api/v1/nfts/my-assets
// Retorna os NFTs do jogador autenticado com metadados de utilidade.
// ==========================================

export async function getMyNfts(req: Request, res: Response): Promise<void> {
    const wallet = req.user!.wallet;

    try {
        // 1. Busca o cache MongoDB (< 5min de idade é considerado fresco)
        const profile = await (UserProfile as any).findOne(
            { wallet_address: wallet },
            { nft_cache: 1 }
        ).lean();

        const now      = new Date();
        const cache    = (profile as any)?.nft_cache as (MongoNftCache & { last_synced?: Date }) | null;
        const isFresh  = cache?.last_synced &&
            (now.getTime() - new Date(cache.last_synced).getTime()) < 5 * 60 * 1000;

        if (isFresh && cache?.assets?.length) {
            res.status(200).json({ assets: cache.assets, cached: true });
            return;
        }

        // 2. Cache expirado — busca on-chain da tabela AtomicAssets
        const atomicRes = await rpcClient.v1.chain.get_table_rows({
            code:  ATOMIC_CONTRACT,
            scope: wallet,
            table: 'assets',
            limit: 100,
            json:  true,
        });

        // Filtra apenas NFTs da coleção CryptoBingo
        const bingoAssets = (atomicRes.rows as any[]).filter(
            a => a.collection_name === BINGO_COLLECTION
        );

        const assets = bingoAssets.map(a => ({
            asset_id:      String(a.asset_id),
            schema_name:   String(a.schema_name),
            name:          String(a.template_id),
            backed_tokens: (a.backed_tokens ?? []).map((t: any) => String(t)).join(', '),
        }));

        // 3. Atualiza o cache no MongoDB
        await (UserProfile as any).updateOne(
            { wallet_address: wallet },
            {
                $set: {
                    'nft_cache.assets':      assets,
                    'nft_cache.last_synced': now,
                    'nft_cache.wallet_address': wallet,
                },
            },
            { upsert: true }
        );

        res.status(200).json({ assets, cached: false });

    } catch (err) {
        console.error('[NFTCtrl] Erro ao buscar NFTs:', err);
        res.status(503).json({ error: 'Erro ao buscar NFTs. Tente novamente.' });
    }
}

// ==========================================
// GET /api/v1/nfts/eligible-discount
// Retorna NFTs do jogador com regra TICKET_DISCOUNT (ADR-028 §6).
// Cruza assets AtomicAssets on-chain com nftconfigs do contrato.
// ==========================================

export interface EligibleDiscountNft {
    asset_id:            string;
    template_id:         number;
    collection_name:     string;
    discount_hundredths: number; // hundredths-de-% (500 = 5%)
    discount_pct:        number; // float para exibição (5.0)
    value_origin:        number; // 0=FIXED, 1=SCHEMA_FIELD
}

export async function getEligibleDiscountNfts(req: Request, res: Response): Promise<void> {
    const wallet = req.user!.wallet;

    try {
        // 1. Busca assets on-chain do jogador (coleção CryptoBingo)
        const atomicRes = await rpcClient.v1.chain.get_table_rows({
            code:  ATOMIC_CONTRACT,
            scope: wallet,
            table: 'assets',
            limit: 100,
            json:  true,
        });
        const playerAssets = (atomicRes.rows as any[]).filter(
            a => a.collection_name === BINGO_COLLECTION
        );

        if (playerAssets.length === 0) {
            res.status(200).json({ nfts: [] });
            return;
        }

        // 2. Lê nftconfigs on-chain (todos os templates configurados)
        const cfgRes = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'nftconfigs',
            limit: 200,
            json:  true,
        });

        // 3. Monta mapa template_id → melhor desconto TICKET_DISCOUNT OWNS
        const discountMap = new Map<number, { discount_hundredths: number; value_origin: number }>();
        for (const cfg of cfgRes.rows as any[]) {
            const templateId = Number(cfg.template_id);
            for (const rule of (cfg.rules ?? []) as any[]) {
                if (rule.type !== RULE_TICKET_DISCOUNT) continue;
                if (rule.condition !== COND_OWNS) continue;
                const h = rule.value_origin === VALUE_FIXED ? Number(rule.fixed_value) : 0;
                const existing = discountMap.get(templateId);
                if (!existing || h > existing.discount_hundredths) {
                    discountMap.set(templateId, { discount_hundredths: h, value_origin: Number(rule.value_origin) });
                }
            }
        }

        // 4. Filtra assets elegíveis e ordena por desconto desc
        const eligible: EligibleDiscountNft[] = playerAssets
            .filter(a => discountMap.has(Number(a.template_id)))
            .map(a => {
                const cfg = discountMap.get(Number(a.template_id))!;
                return {
                    asset_id:            String(a.asset_id),
                    template_id:         Number(a.template_id),
                    collection_name:     String(a.collection_name),
                    discount_hundredths: cfg.discount_hundredths,
                    discount_pct:        cfg.discount_hundredths / 100,
                    value_origin:        cfg.value_origin,
                };
            })
            .sort((a, b) => b.discount_hundredths - a.discount_hundredths);

        res.status(200).json({ nfts: eligible });

    } catch (err) {
        console.error('[NFTCtrl] Erro ao buscar NFTs elegíveis:', err);
        res.status(503).json({ error: 'Erro ao buscar NFTs elegíveis.' });
    }
}
