// apps/api-gateway/src/controllers/nftController.ts
// Sincroniza o inventário AtomicAssets do jogador com o MongoDB (nfts_cache).
// Ref: architecture.md §6.2, PROJECT-DETAILS.md §3 (ADR-004)

import { Request, Response }      from 'express';
import { rpcClient }              from '@cryptobingo/blockchain-core';
import { UserProfile }            from '../models/UserProfile';
import type { MongoNftCache }     from '@cryptobingo/shared-types';
import { Session }                from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { Checksum256 }            from '@wharfkit/antelope';

const ATOMIC_CONTRACT    = 'atomicassets';
const BINGO_COLLECTION   = 'cryptobingo1';
const CONTRACT_ACCOUNT   = process.env.CONTRACT_ACCOUNT   ?? 'bingogamectr';
const MICROSERVICE_ACTOR = process.env.MICROSERVICE_ACTOR ?? 'bingogamesvc';
const CHAIN_ID           = process.env.CHAIN_ID           ?? '';
const RPC_URL            = process.env.RPC_URL            ?? 'http://127.0.0.1:8888';

function getMicroserviceSession(): Session {
    const key = process.env.MICROSERVICE_PRIVATE_KEY;
    if (!key) throw new Error('MICROSERVICE_PRIVATE_KEY não definida');
    return new Session({
        actor:        MICROSERVICE_ACTOR,
        permission:   'active',
        chain:        { id: Checksum256.from(CHAIN_ID), url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

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

        // 2. Lê nftconfigs on-chain com paginação (todos os templates)
        const discountMap = new Map<number, { discount_hundredths: number; value_origin: number }>();
        let lowerBound: string | undefined;
        do {
            const cfgRes = await rpcClient.v1.chain.get_table_rows({
                code:        CONTRACT_ACCOUNT,
                scope:       CONTRACT_ACCOUNT,
                table:       'nftconfigs',
                limit:       200,
                json:        true,
                lower_bound: lowerBound,
            } as any);

            // 3. Monta mapa template_id → melhor desconto TICKET_DISCOUNT OWNS
            for (const cfg of cfgRes.rows as any[]) {
                const templateId = Number(cfg.template_id);
                for (const rule of (cfg.rules ?? []) as any[]) {
                    if (rule.type !== RULE_TICKET_DISCOUNT) continue;
                    if (rule.condition !== COND_OWNS) continue;
                    // SCHEMA_FIELD: desconto desconhecido em tempo de listagem — usa 0 como hundredths
                    const h = rule.value_origin === VALUE_FIXED ? Number(rule.fixed_value) : 0;
                    const existing = discountMap.get(templateId);
                    // VALUE_FIXED sempre vence VALUE_SCHEMA_FIELD (h=0) quando maior
                    if (!existing || h > existing.discount_hundredths || !existing.discount_hundredths) {
                        discountMap.set(templateId, { discount_hundredths: h, value_origin: Number(rule.value_origin) });
                    }
                }
            }

            lowerBound = (cfgRes as any).rows_more && cfgRes.rows.length > 0
                ? String(Number((cfgRes.rows as any[]).at(-1).template_id) + 1)
                : undefined;
        } while (lowerBound);

        // 4. Filtra assets elegíveis e ordena: FIXED desc, SCHEMA_FIELD no topo (desconto desconhecido = Infinity)
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
            .sort((a, b) => {
                // SCHEMA_FIELD (value_origin=1): desconto desconhecido → topo da lista
                const wa = a.value_origin === 1 ? Infinity : a.discount_hundredths;
                const wb = b.value_origin === 1 ? Infinity : b.discount_hundredths;
                return wb - wa;
            });

        res.status(200).json({ nfts: eligible });

    } catch (err) {
        console.error('[NFTCtrl] Erro ao buscar NFTs elegíveis:', err);
        res.status(503).json({ error: 'Erro ao buscar NFTs elegíveis.' });
    }
}

// ==========================================
// POST /api/v1/nfts/sync-burns
// Sincronização manual de queimas (ADR-028 §8).
// Detecta por ausência: assets que o jogador tinha (snapshot nftburns +
// assets atuais) e não estão mais na carteira → recordburn.
// ==========================================

const RULE_BURN_TO_CLAIM = 2;

async function fetchBurnToClaimTemplates(): Promise<Array<{ templateId: string; collection: string }>> {
    const templates: Array<{ templateId: string; collection: string }> = [];
    let lowerBound: string | undefined;
    do {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT,
            table: 'nftconfigs', limit: 200, json: true, lower_bound: lowerBound as any,
        });
        for (const cfg of res.rows as any[]) {
            const hasBurnRule = (cfg.rules ?? []).some((r: any) => r.type === RULE_BURN_TO_CLAIM);
            if (hasBurnRule) templates.push({ templateId: String(cfg.template_id), collection: String(cfg.collection_name) });
        }
        lowerBound = res.more && res.rows.length > 0
            ? String(Number(res.rows.at(-1).template_id) + 1) : undefined;
    } while (lowerBound);
    return templates;
}

async function getRegisteredBurnAssetIds(owner: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const res: any = await (rpcClient.v1.chain.get_table_rows as Function)({
        code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT,
        table: 'nftburns', limit: 500, json: true,
        index_position: 2, key_type: 'name',
        lower_bound: owner, upper_bound: owner,
    });
    for (const row of res.rows as any[]) ids.add(String(row.asset_id));
    return ids;
}

async function getOwnedBurnCandidates(
    owner: string,
    templates: Array<{ templateId: string; collection: string }>,
): Promise<Array<{ assetId: string; templateId: string; collection: string }>> {
    const templateMap = new Map(templates.map(t => [t.templateId, t.collection]));
    const candidates: Array<{ assetId: string; templateId: string; collection: string }> = [];
    let lowerBound: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const res: any = await rpcClient.v1.chain.get_table_rows({
            code: ATOMIC_CONTRACT, scope: owner, table: 'assets',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        for (const a of res.rows as any[]) {
            const tpl = String(a.template_id);
            if (templateMap.has(tpl) && templateMap.get(tpl) === a.collection_name)
                candidates.push({ assetId: String(a.asset_id), templateId: tpl, collection: String(a.collection_name) });
        }
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key;
    }
    return candidates;
}

export async function syncBurns(req: Request, res: Response): Promise<void> {
    const wallet = req.user!.wallet;
    try {
        const [templates, registeredIds] = await Promise.all([
            fetchBurnToClaimTemplates(),
            getRegisteredBurnAssetIds(wallet),
        ]);

        if (templates.length === 0) {
            res.status(200).json({ recorded: 0, asset_ids: [] });
            return;
        }

        const candidates = await getOwnedBurnCandidates(wallet, templates);
        // Assets já registrados on-chain → pular (idempotência)
        const toRegister = candidates.filter(c => !registeredIds.has(c.assetId));

        if (toRegister.length === 0) {
            res.status(200).json({ recorded: 0, asset_ids: [] });
            return;
        }

        const session  = getMicroserviceSession();
        const recorded: string[] = [];

        for (const c of toRegister) {
            try {
                await session.transact({
                    actions: [{
                        account:       CONTRACT_ACCOUNT,
                        name:          'recordburn',
                        authorization: [session.permissionLevel],
                        data: {
                            owner:       wallet,
                            asset_id:    c.assetId,
                            template_id: c.templateId,
                            collection:  c.collection,
                        },
                    }],
                }, { broadcast: true });
                recorded.push(c.assetId);
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (!/ja registrado/i.test(msg))
                    console.warn(`⚠️ [syncBurns] recordburn falhou ${c.assetId}: ${msg}`);
            }
        }

        res.status(200).json({ recorded: recorded.length, asset_ids: recorded });
    } catch (err) {
        console.error('[NFTCtrl] Erro ao sincronizar queimas:', err);
        res.status(503).json({ error: 'Erro ao sincronizar queimas.' });
    }
}
