import { Request, Response } from 'express';
import { Session, type SessionOptions } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { APIClient, UInt64 } from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { logger } from '../middleware/logger';
import { getRequestId } from '../middleware/requestId';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT      || 'bingogamectr';
const MICROSERVICE_KEY = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID         = process.env.CHAIN_ID!;
const RPC_URL          = process.env.RPC_URL               || 'http://127.0.0.1:8888';

const SHARED_CLIENT = new APIClient({ url: RPC_URL });

// ADR-026: assina como bingogamectr@admin com a chave do bingogamesvc
function getAdminSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'admin',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_KEY),
    }, { client: SHARED_CLIENT } as SessionOptions);
}

// ==========================================
// GET /api/v1/vault/deposits
// ==========================================
export async function listDeposits(req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'dropdeposits',
            limit: 100,
            json:  true,
        });
        res.status(200).json({ deposits: response.rows });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: err, tag: 'DropCtrl' }, 'Erro ao listar depósitos');
        res.status(503).json({ error: `Nó blockchain indisponível: ${msg}` });
    }
}

// ==========================================
// GET /api/v1/vault/deposits/:depositId
// ==========================================
export async function getDeposit(req: Request, res: Response): Promise<void> {
    const { depositId } = req.params;
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'dropdeposits',
            lower_bound: UInt64.from(depositId),
            upper_bound: UInt64.from(depositId),
            limit:       1,
            json:        true,
        });
        if (!response.rows.length) {
            res.status(404).json({ error: `Depósito ${depositId} não encontrado.` });
            return;
        }
        res.status(200).json(response.rows[0]);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: err, tag: 'DropCtrl' }, 'Erro ao buscar depósito');
        res.status(503).json({ error: `Nó blockchain indisponível: ${msg}` });
    }
}

// ==========================================
// GET /api/v1/vault/allocations
// ==========================================
export async function listAllocations(req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'dropallocs',
            limit: 100,
            json:  true,
        });
        let rows = response.rows as any[];
        const roomId = req.query.roomId as string | undefined;
        if (roomId) {
            rows = rows.filter(a => a.room_id === roomId);
        }
        res.status(200).json({ allocations: rows });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: err, tag: 'DropCtrl' }, 'Erro ao listar alocações');
        res.status(503).json({ error: `Nó blockchain indisponível: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/vault/allocate
// ==========================================
export async function allocateDrop(req: Request, res: Response): Promise<void> {
    const {
        deposit_id, room_id, quantity_per_drop, nft_asset_id, drop_chance_bps,
    } = req.body;

    if (!deposit_id || !room_id || drop_chance_bps === undefined) {
        res.status(400).json({ error: 'Campos obrigatórios: deposit_id, room_id, drop_chance_bps.' });
        return;
    }
    const bps = Number(drop_chance_bps);
    if (!Number.isInteger(bps) || bps < 1 || bps > 10000) {
        res.status(400).json({ error: 'drop_chance_bps deve ser um inteiro entre 1 e 10000.' });
        return;
    }

    // Busca o depósito para obter token_contract (necessário para extended_asset)
    // e verificar ownership do sponsor.
    const callerRole = (req as any).userRole as string;
    let depRow: any;
    try {
        const depResp = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT,
            table: 'dropdeposits', lower_bound: UInt64.from(deposit_id),
            upper_bound: UInt64.from(deposit_id), limit: 1, json: true,
        });
        depRow = depResp.rows[0];
    } catch {
        res.status(500).json({ error: 'Erro ao verificar depósito on-chain.' });
        return;
    }
    if (!depRow) {
        res.status(404).json({ error: `Depósito ${deposit_id} não encontrado.` });
        return;
    }
    if (callerRole === 'sponsor' && depRow.owner !== req.user?.wallet) {
        res.status(403).json({ error: 'Acesso negado: depósito não pertence ao sponsor.' });
        return;
    }

    // quantity_per_drop: extended_asset { quantity, contract }
    // Passa objetos planos — Wharfkit usa o ABI da chain para serializar; instâncias
    // de Name/Asset causam "Found undefined" no encoder quando embutidas no data object.
    const tokenContract: string = depRow.quantity_remaining?.contract ?? 'bingogametkn';
    const rawQty = quantity_per_drop || '1.0000 BINGO';

    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'allocatedrop',
                authorization: [session.permissionLevel],
                data: {
                    caller:            CONTRACT_ACCOUNT,
                    deposit_id:        UInt64.from(deposit_id),
                    room_id:           UInt64.from(room_id),
                    quantity_per_drop: { quantity: rawQty, contract: tokenContract },
                    nft_asset_id:      UInt64.from(nft_asset_id || '0'),
                    drop_chance_bps:   Number(drop_chance_bps),
                },
            }],
        }, { broadcast: true });

        logger.info({ tag: 'DropCtrl' }, `Alocação criada — deposit ${deposit_id} → room ${room_id}. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Alocação criada com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: err, tag: 'DropCtrl' }, 'Erro ao alocar');
        res.status(500).json({ error: `Erro ao alocar: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/vault/deallocate
// ==========================================
export async function deallocateDrop(req: Request, res: Response): Promise<void> {
    const { alloc_id } = req.body;

    if (!alloc_id) {
        res.status(400).json({ error: 'Campo obrigatório: alloc_id.' });
        return;
    }

    try {
        const session = getAdminSession();

        // Sponsors só podem desalocar próprias alocações (evita IDOR).
        const callerRole = (req as any).user?.role as string | undefined;
        if (callerRole === 'sponsor') {
            const allocRes = await session.client.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'dropallocs',
                lower_bound: UInt64.from(alloc_id), upper_bound: UInt64.from(alloc_id),
                limit: 1, json: true,
            });
            const allocRow = allocRes.rows[0];
            if (!allocRow) {
                res.status(404).json({ error: `Alocação ${alloc_id} não encontrada.` });
                return;
            }
            if (allocRow.owner !== (req as any).user?.wallet) {
                res.status(403).json({ error: 'Acesso negado: alocação não pertence ao sponsor.' });
                return;
            }
        }

        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'deallocdrop',
                authorization: [session.permissionLevel],
                data: {
                    caller:   CONTRACT_ACCOUNT,
                    alloc_id: UInt64.from(alloc_id),
                },
            }],
        }, { broadcast: true });

        logger.info({ tag: 'DropCtrl' }, `Alocação #${alloc_id} removida. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Alocação removida com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: err, tag: 'DropCtrl' }, 'Erro ao desalocar');
        res.status(500).json({ error: `Erro ao desalocar: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/vault/reclaim
// ==========================================
// reclaimasset exige require_auth(owner) no contrato — o backend não pode assinar
// como o owner do depósito. Esta ação deve ser chamada pelo frontend com a wallet
// do sponsor via Wharfkit. ADR-026: não expor ações owner-signed pelo backend.
export async function reclaimAsset(_req: Request, res: Response): Promise<void> {
    res.status(501).json({
        error: 'reclaimasset deve ser assinada pelo owner do depósito via wallet. Use o frontend com Wharfkit.',
    });
}
