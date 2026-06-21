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
const CHAIN_ID           = process.env.CHAIN_ID;
const RPC_URL            = process.env.RPC_URL            ?? 'http://127.0.0.1:8888';
const IPFS_GATEWAY       = process.env.IPFS_GATEWAY       ?? 'https://ipfs.io/ipfs/';
if (!CHAIN_ID) throw new Error('[nftController] CHAIN_ID não definido');

// ── Deserializador AtomicAssets ────────────────────────────────────────────────
// A AtomicAssets serializa metadados em bytes (immutable_serialized_data) usando
// o formato definido no schema da collection. Identifier = 4 + index no format.
// Ref: github.com/pinknetworkx/atomicassets-contract/wiki/Serialization

function readVarint(buf: Uint8Array, pos: number): { value: number; bytes: number } {
    let v = 0, shift = 0, bytes = 0;
    while (pos < buf.length) {
        const b = buf[pos++]; bytes++;
        v |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) return { value: v, bytes };
    }
    return { value: v, bytes };
}

function readAtomicValue(buf: Uint8Array, pos: number, type: string): { value: unknown; bytes: number } { // NOSONAR — deserializador AtomicAssets com 15+ tipos primitivos (varint, fixedN, float, string, arrays); complexidade inerente ao protocolo de serialização
    const isArr = type.endsWith('[]');
    const base  = isArr ? type.slice(0, -2) : type;
    const start = pos;

    if (isArr) {
        const { value: cnt, bytes: cb } = readVarint(buf, pos);
        pos += cb;
        const items: unknown[] = [];
        for (let i = 0; i < cnt; i++) {
            const { value, bytes } = readAtomicValue(buf, pos, base);
            pos += bytes;
            items.push(value);
        }
        return { value: items, bytes: pos - start };
    }

    const dv = (n: number) => new DataView(buf.buffer, buf.byteOffset + pos, n);

    // AtomicAssets: ALL integers (uint*/int*/bool/byte) usam varint encoding.
    // Apenas fixed*/float/double usam largura fixa LE.
    // Ref: github.com/pinknetworkx/atomicassets-contract/wiki/Serialization
    switch (base) {
        case 'uint8': case 'uint16': case 'uint32': case 'uint64':
        case 'byte': {
            const { value: v, bytes: b } = readVarint(buf, pos);
            return { value: v, bytes: b };
        }
        case 'int8': case 'int16': case 'int32': case 'int64': {
            // signed: varint decodifica como unsigned, reinterpreta bits
            const { value: v, bytes: b } = readVarint(buf, pos);
            const mask = base === 'int8' ? 0xFFn : base === 'int16' ? 0xFFFFn : base === 'int32' ? 0xFFFFFFFFn : 0xFFFFFFFFFFFFFFFFn; // NOSONAR (S3358) — ternário encadeado para seleção de máscara BigInt por tamanho de tipo; lookup-table exigiria BigInt literal em Map (não aceito pelo TS sem cast)
            const sign = BigInt(1) << (base === 'int8' ? 7n : base === 'int16' ? 15n : base === 'int32' ? 31n : 63n); // NOSONAR (S3358) — idem: seleção de bit de sinal por tipo
            const uv = BigInt(v) & mask;
            const sv = uv >= sign ? uv - (sign << 1n) : uv;
            return { value: base === 'int64' ? sv : Number(sv), bytes: b };
        }
        case 'fixed8':
            return { value: buf[pos], bytes: 1 };
        case 'fixed16':
            return { value: dv(2).getUint16(0, true), bytes: 2 };
        case 'fixed32':
            return { value: dv(4).getUint32(0, true), bytes: 4 };
        case 'fixed64':
            return { value: dv(8).getBigUint64(0, true), bytes: 8 };
        case 'float':
            return { value: dv(4).getFloat32(0, true), bytes: 4 };
        case 'double':
            return { value: dv(8).getFloat64(0, true), bytes: 8 };
        case 'bool': {
            const { value: v, bytes: b } = readVarint(buf, pos);
            return { value: v !== 0, bytes: b };
        }
        case 'string': case 'image': case 'ipfs': {
            const { value: len, bytes: lb } = readVarint(buf, pos);
            const str = new TextDecoder().decode(buf.slice(pos + lb, pos + lb + len));
            return { value: str, bytes: lb + len };
        }
        case 'bytes': {
            const { value: len, bytes: lb } = readVarint(buf, pos);
            return { value: buf.slice(pos + lb, pos + lb + len), bytes: lb + len };
        }
        default:
            throw new Error(`Tipo AtomicAssets desconhecido: ${type}`);
    }
}

function deserializeAtomic(hex: string, fmt: Array<{ name: string; type: string }>): Record<string, unknown> {
    if (!hex) return {};
    const buf = new Uint8Array(Buffer.from(hex, 'hex'));
    let pos = 0;
    const out: Record<string, unknown> = {};
    const idMap = new Map<number, { name: string; type: string }>();
    for (let i = 0; i < fmt.length; i++) idMap.set(4 + i, fmt[i]);
    while (pos < buf.length) {
        const { value: id, bytes: ib } = readVarint(buf, pos);
        pos += ib;
        const f = idMap.get(id);
        if (!f) break;
        const { value, bytes } = readAtomicValue(buf, pos, f.type);
        pos += bytes;
        out[f.name] = value;
    }
    return out;
}

function getMicroserviceSession(): Session {
    const key = process.env.MICROSERVICE_PRIVATE_KEY;
    if (!key) throw new Error('MICROSERVICE_PRIVATE_KEY não definida');
    return new Session({
        actor:        MICROSERVICE_ACTOR,
        permission:   'active',
        chain:        { id: Checksum256.from(CHAIN_ID!), url: RPC_URL },
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

        // Busca esquemas e deserializa metadados dos templates
        const schemaRes = await rpcClient.v1.chain.get_table_rows({
            code: ATOMIC_CONTRACT, scope: BINGO_COLLECTION,
            table: 'schemas', limit: 10, json: true,
        });
        const schemaFormat = new Map<string, Array<{ name: string; type: string }>>();
        for (const row of schemaRes.rows as any[]) {
            schemaFormat.set(String(row.schema_name), (row as any).format ?? []);
        }

        const templateIds = [...new Set(bingoAssets.map(a => Number(a.template_id)))];
        const templateMeta = new Map<number, Record<string, any>>();
        if (templateIds.length > 0) {
            const tmplRes = await rpcClient.v1.chain.get_table_rows({
                code: ATOMIC_CONTRACT, scope: BINGO_COLLECTION,
                table: 'templates', limit: 200, json: true,
            });
            for (const row of tmplRes.rows as any[]) {
                const tid = Number(row.template_id);
                if (templateIds.includes(tid)) {
                    const fmt = schemaFormat.get(String(row.schema_name)) ?? [];
                    templateMeta.set(tid, deserializeAtomic(row.immutable_serialized_data as string, fmt));
                }
            }
        }

        const assets = bingoAssets.map(a => {
            const meta   = templateMeta.get(Number(a.template_id)) || {};
            const imgCid = String(meta.img ?? '').replace(/^ipfs:\/\//, '');
            const imgUrl = imgCid ? `${IPFS_GATEWAY}${imgCid}` : undefined;
            return {
                asset_id:        String(a.asset_id),
                schema_name:     String(a.schema_name),
                name:            String(meta.name ?? a.template_id),
                backed_tokens:   (a.backed_tokens ?? []).map((t: any) => String(t)).join(', '),
                template_id:     Number(a.template_id),
                collection_name: String(a.collection_name),
                img_url:         imgUrl,
            };
        });

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

export async function getEligibleDiscountNfts(req: Request, res: Response): Promise<void> { // NOSONAR — elegibilidade de desconto NFT com leitura on-chain, deserialização AtomicAssets e múltiplos critérios de filtro (ADR-028 §6)
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

const RULE_BURN_TO_CLAIM = 4;

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
        const failed:   string[] = [];

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
                if (/ja registrado/i.test(msg)) {
                    recorded.push(c.assetId); // já registrado = idempotente, conta como sucesso
                } else {
                    console.warn(`⚠️ [syncBurns] recordburn falhou ${c.assetId}: ${msg}`);
                    failed.push(c.assetId);
                }
            }
        }

        const status = failed.length > 0 && recorded.length === 0 ? 502 : 200;
        res.status(status).json({ recorded: recorded.length, asset_ids: recorded, failed });
    } catch (err) {
        console.error('[NFTCtrl] Erro ao sincronizar queimas:', err);
        res.status(503).json({ error: 'Erro ao sincronizar queimas.' });
    }
}
