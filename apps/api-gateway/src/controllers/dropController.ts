import { Request, Response } from 'express';
import { Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 } from '@wharfkit/antelope';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT      || 'bingogamectr';
const MICROSERVICE_KEY = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID         = process.env.CHAIN_ID!;
const RPC_URL          = process.env.RPC_URL               || 'http://127.0.0.1:8888';

// ADR-026: assina como bingogamectr@admin com a chave do bingogamesvc
function getSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'admin',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_KEY),
    });
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
        console.error('[DropCtrl] Erro ao listar depósitos:', err);
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
        console.error('[DropCtrl] Erro ao buscar depósito:', err);
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
        console.error('[DropCtrl] Erro ao listar alocações:', err);
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

    try {
        const session = getSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'allocatedrop',
                authorization: [session.permissionLevel],
                data: {
                    deposit_id:       UInt64.from(deposit_id),
                    room_id:          UInt64.from(room_id),
                    quantity_per_drop: quantity_per_drop || '0 TOKEN',
                    nft_asset_id:     nft_asset_id || '0',
                    drop_chance_bps,
                },
            }],
        }, { broadcast: true });

        console.log(`✅ [DropCtrl] Alocação criada — deposit ${deposit_id} → room ${room_id}. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Alocação criada com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[DropCtrl] Erro ao alocar:', err);
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
        const session = getSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'deallocdrop',
                authorization: [session.permissionLevel],
                data:          { alloc_id: UInt64.from(alloc_id) },
            }],
        }, { broadcast: true });

        console.log(`✅ [DropCtrl] Alocação #${alloc_id} removida. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Alocação removida com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[DropCtrl] Erro ao desalocar:', err);
        res.status(500).json({ error: `Erro ao desalocar: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/vault/reclaim
// ==========================================
export async function reclaimAsset(req: Request, res: Response): Promise<void> {
    const { deposit_id } = req.body;

    if (!deposit_id) {
        res.status(400).json({ error: 'Campo obrigatório: deposit_id.' });
        return;
    }

    try {
        const session = getSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'reclaimasset',
                authorization: [session.permissionLevel],
                data:          { deposit_id: UInt64.from(deposit_id) },
            }],
        }, { broadcast: true });

        console.log(`✅ [DropCtrl] Depósito #${deposit_id} reclaimado. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Ativo reclaimado com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[DropCtrl] Erro ao reclaimar:', err);
        res.status(500).json({ error: `Erro ao reclaimar: ${msg}` });
    }
}
