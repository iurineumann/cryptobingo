// apps/api-gateway/src/controllers/nftController.ts
// Sincroniza o inventário AtomicAssets do jogador com o MongoDB (nfts_cache).
// Ref: architecture.md §6.2, PROJECT-DETAILS.md §3 (ADR-004)

import { Request, Response } from 'express';
import { rpcClient }         from '@cryptobingo/blockchain-core';
import { UserProfile }       from '../models/UserProfile';
import type { MongoNftCache } from '@cryptobingo/shared-types';

const ATOMIC_CONTRACT  = 'atomicassets';
const BINGO_COLLECTION = 'cryptobingo1';

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
