// apps/api-gateway/src/controllers/sponsorController.ts
// CRUD de campanhas B2B — expõe as actions linkcampaign/closecampaign.
// Ref: SPEC.md §1.4, brief.md §1, bingo.hpp campaigns table

import { Request, Response }     from 'express';
import { Session }               from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { UInt64 }                from '@wharfkit/antelope';
import { rpcClient }             from '@cryptobingo/blockchain-core';
import type { BlockchainCampaign } from '@cryptobingo/shared-types';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT      || 'bingogamectr';
const MICROSERVICE_KEY = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID         = process.env.CHAIN_ID!;
const RPC_URL          = process.env.RPC_URL               || 'http://127.0.0.1:8888';

// ADR-026: assina como bingogamectr@admin com a chave do bingogamesvc
function getAdminSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'admin',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_KEY),
    });
}

// ==========================================
// GET /api/v1/sponsors/campaigns
// ==========================================

/**
 * Lista todas as campanhas ativas on-chain.
 * Público — sponsors podem ver o status das suas campanhas.
 */
export async function listCampaigns(_req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'campaigns',
            limit: 50,
            json:  true,
        });
        res.status(200).json({ campaigns: response.rows as BlockchainCampaign[] });
    } catch (err) {
        console.error('[SponsorCtrl] Erro ao listar campanhas:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// GET /api/v1/sponsors/campaigns/:campaignId
// ==========================================

export async function getCampaign(req: Request, res: Response): Promise<void> {
    const { campaignId } = req.params;
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'campaigns',
            lower_bound: UInt64.from(campaignId),
            upper_bound: UInt64.from(campaignId),
            limit:       1,
            json:        true,
        });
        if (!response.rows.length) {
            res.status(404).json({ error: `Campanha ${campaignId} não encontrada.` });
            return;
        }
        res.status(200).json(response.rows[0] as BlockchainCampaign);
    } catch (err) {
        console.error('[SponsorCtrl] Erro ao buscar campanha:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// POST /api/v1/sponsors/campaigns/:campaignId/link
// Vincula uma campanha a um jogo (injeta payout_per_game no sponsor_pool).
// Auth: JWT admin
// ==========================================

export async function linkCampaignToGame(req: Request, res: Response): Promise<void> {
    const { campaignId } = req.params;
    const { game_id }    = req.body;

    if (!game_id) {
        res.status(400).json({ error: 'Campo "game_id" obrigatório.' });
        return;
    }

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'linkcampaign',
                authorization: [session.permissionLevel],
                data:          { game_id, campaign_id: campaignId },
            }],
        }, { broadcast: true });

        console.log(`✅ [SponsorCtrl] Campanha ${campaignId} vinculada ao jogo ${game_id}. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Campanha ${campaignId} vinculada ao jogo ${game_id}.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SponsorCtrl] Erro ao vincular campanha:', err);
        res.status(500).json({ error: `Erro ao vincular campanha: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/sponsors/campaigns/:campaignId/close
// Encerra campanha e liquida saldo residual conforme leftover_policy.
// Auth: JWT admin
// ==========================================

export async function closeCampaign(req: Request, res: Response): Promise<void> {
    const { campaignId } = req.params;

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'closecmpgn',
                authorization: [session.permissionLevel],
                data:          { campaign_id: campaignId },
            }],
        }, { broadcast: true });

        console.log(`✅ [SponsorCtrl] Campanha ${campaignId} encerrada. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Campanha ${campaignId} encerrada com sucesso.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SponsorCtrl] Erro ao encerrar campanha:', err);
        res.status(500).json({ error: `Erro ao encerrar campanha: ${msg}` });
    }
}
