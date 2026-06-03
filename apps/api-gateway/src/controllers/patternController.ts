// apps/api-gateway/src/controllers/patternController.ts
// CRUD de padrões e gametypes via transações on-chain.
//
// Todas as rotas exigem requireAuth. Em produção, adicionar verificação
// de role 'admin' via middleware RBAC (pendente ADR futuro).
//
// Ref: ADR-004 Fase 2, openapi.yaml v1.3.0

import { Request, Response } from 'express';
import { Session }           from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { rpcClient }         from '@cryptobingo/blockchain-core';
import type { BlockchainPattern, BlockchainGametype } from '@cryptobingo/shared-types';
import mongoose, { Schema, Document } from 'mongoose';

const CONTRACT_ACCOUNT      = process.env.CONTRACT_ACCOUNT      || 'bingo.game';
const MICROSERVICE_PRIV_KEY = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID              = process.env.CHAIN_ID!;
const RPC_URL               = process.env.RPC_URL               || 'http://127.0.0.1:8888';

interface GametypeMetadataDocument extends Document {
    gametype_id: string;
    description: string;
    cover_image_url: string;
    rules_summary: string;
    sort_order: number;
}

const GametypeMetadataSchema = new Schema<GametypeMetadataDocument>({
    gametype_id:     { type: String, required: true, unique: true, index: true },
    description:     { type: String, default: '' },
    cover_image_url: { type: String, default: '' },
    rules_summary:   { type: String, default: '' },
    sort_order:      { type: Number, default: 0 },
}, { timestamps: true });

const GametypeMetadataModel = mongoose.model<GametypeMetadataDocument>('GametypeMetadata', GametypeMetadataSchema);

// Sessão do microserviço para enviar transações admin ao contrato
function getAdminSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'active',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_PRIV_KEY),
    });
}

// ==========================================
// PATTERNS
// ==========================================

/**
 * GET /api/v1/admin/patterns
 * Lista todos os padrões de vitória registrados on-chain.
 */
export async function listPatterns(_req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'patterns',
            limit: 50,
            json:  true,
        });
        res.status(200).json({ patterns: response.rows as BlockchainPattern[] });
    } catch (err) {
        console.error('[PatternCtrl] Erro ao listar patterns:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

/**
 * POST /api/v1/admin/patterns
 * Cria ou atualiza um padrão de vitória on-chain.
 *
 * Body: { pattern_id: number, name: string, mask: number }
 * mask: uint32 bitmask (máx 25 bits — cartela 5x5)
 */
export async function upsertPattern(req: Request, res: Response): Promise<void> {
    const { pattern_id, name, mask } = req.body;

    if (!pattern_id || !name || mask === undefined) {
        res.status(400).json({ error: 'Campos obrigatórios: pattern_id, name, mask.' });
        return;
    }
    if (typeof mask !== 'number' || mask <= 0 || mask >= (1 << 25)) {
        res.status(400).json({ error: 'mask deve ser um uint32 entre 1 e 33554431 (25 bits).' });
        return;
    }
    if (typeof name !== 'string' || name.length > 64) {
        res.status(400).json({ error: 'name deve ser uma string de até 64 caracteres.' });
        return;
    }

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'addpattern',
                authorization: [session.permissionLevel],
                data:          { pattern_id, name, mask },
            }],
        }, { broadcast: true });

        console.log(`✅ [PatternCtrl] Padrão ${pattern_id} (${name}) upsertado. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Padrão "${name}" registrado com sucesso.`,
            pattern_id,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao upsert pattern:', err);
        res.status(500).json({ error: `Erro ao registrar padrão: ${msg}` });
    }
}

/**
 * DELETE /api/v1/admin/patterns/:patternId
 * Remove um padrão de vitória on-chain.
 */
export async function deletePattern(req: Request, res: Response): Promise<void> {
    const { patternId } = req.params;

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'delpattern',
                authorization: [session.permissionLevel],
                data:          { pattern_id: patternId },
            }],
        }, { broadcast: true });

        console.log(`✅ [PatternCtrl] Padrão ${patternId} removido. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Padrão ${patternId} removido com sucesso.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao deletar pattern:', err);
        res.status(500).json({ error: `Erro ao remover padrão: ${msg}` });
    }
}

// ==========================================
// GAMETYPES
// ==========================================

/**
 * GET /api/v1/admin/gametypes
 * Lista todos os gametypes registrados on-chain.
 */
export async function listGametypes(_req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'gametypes',
            limit: 50,
            json:  true,
        });
        res.status(200).json({ gametypes: response.rows as BlockchainGametype[] });
    } catch (err) {
        console.error('[PatternCtrl] Erro ao listar gametypes:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

/**
 * POST /api/v1/admin/gametypes
 * Cria ou atualiza um gametype on-chain (addgametype).
 *
 * Body: {
 *   gametype_id: number,
 *   name: string,
 *   base_multiplier: number,        // uint8 (1-255)
 *   rules: [{ pattern_id, weight }],
 *   draw_mode?: string,             // 'standard' | 'fixed' | 'firstfull' | 'goldenball' | 'multimatch'
 *   max_balls?: number,             // uint8
 *   golden_ball_after?: number,     // uint8
 *   master_weight_ovrd?: number,    // uint8
 * }
 */
export async function upsertGametype(req: Request, res: Response): Promise<void> {
    const {
        gametype_id, name, base_multiplier, rules,
        draw_mode, max_balls, golden_ball_after, master_weight_ovrd,
    } = req.body;

    if (!gametype_id || !name || !base_multiplier || !rules) {
        res.status(400).json({ error: 'Campos obrigatórios: gametype_id, name, base_multiplier, rules.' });
        return;
    }
    if (!Array.isArray(rules) || rules.length === 0) {
        res.status(400).json({ error: 'rules deve ter pelo menos 1 elemento.' });
        return;
    }
    if (typeof base_multiplier !== 'number' || base_multiplier < 1 || base_multiplier > 255) {
        res.status(400).json({ error: 'base_multiplier deve ser um inteiro entre 1 e 255.' });
        return;
    }

    for (const rule of rules) {
        if (!rule.pattern_id || !rule.weight || rule.weight < 100 || rule.weight > 25500) {
            res.status(400).json({ error: 'Cada rule deve ter pattern_id e weight (1.00-255.00).' });
            return;
        }
    }

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'addgametype',
                authorization: [session.permissionLevel],
                data: {
                    gametype_id, name, base_multiplier, rules,
                    draw_mode:       draw_mode ?? 'standard',
                    max_balls:       max_balls ?? 0,
                    golden_ball_after: golden_ball_after ?? 0,
                    master_weight_ovrd: master_weight_ovrd ?? 0,
                },
            }],
        }, { broadcast: true });

        console.log(`✅ [PatternCtrl] Gametype ${gametype_id} (${name}) upsertado. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Gametype "${name}" registrado com sucesso.`,
            gametype_id,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao upsert gametype:', err);
        res.status(500).json({ error: `Erro ao registrar gametype: ${msg}` });
    }
}

/**
 * DELETE /api/v1/admin/gametypes/:gametypeId
 * Remove um gametype on-chain.
 */
export async function deleteGametype(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;

    try {
        const session = getAdminSession();
        const result  = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'delgametype',
                authorization: [session.permissionLevel],
                data:          { gametype_id: gametypeId },
            }],
        }, { broadcast: true });

        console.log(`✅ [PatternCtrl] Gametype ${gametypeId} removido. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Gametype ${gametypeId} removido com sucesso.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao deletar gametype:', err);
        res.status(500).json({ error: `Erro ao remover gametype: ${msg}` });
    }
}

// ==========================================
// GAMETYPE METADATA (off-chain, MongoDB)
// ==========================================

/**
 * GET /api/v1/admin/gametypes/:gametypeId/metadata
 * Retorna metadados off-chain de um gametype.
 */
export async function getGametypeMetadata(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;

    try {
        const metadata = await GametypeMetadataModel.findOne({ gametype_id: gametypeId }).lean();
        if (!metadata) {
            res.status(404).json({ error: 'Metadados não encontrados para este gametype.' });
            return;
        }
        res.status(200).json(metadata);
    } catch (err) {
        console.error('[PatternCtrl] Erro ao buscar metadados do gametype:', err);
        res.status(500).json({ error: 'Erro ao buscar metadados.' });
    }
}

/**
 * GET /api/v1/gametypes/:gametypeId/metadata  (público)
 * Retorna apenas as combinações e regras estendidas de um gametype — sem auth.
 */
export async function getGametypeMetadataPublic(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;
    try {
        const metadata = await GametypeMetadataModel.findOne({ gametype_id: gametypeId })
            .select('gametype_id rules combinations')
            .lean();
        if (!metadata) {
            res.status(200).json({ gametype_id: gametypeId, rules: [], combinations: [] });
            return;
        }
        res.status(200).json({
            gametype_id:  metadata.gametype_id,
            rules:        (metadata as any).rules        ?? [],
            combinations: (metadata as any).combinations ?? [],
        });
    } catch (err) {
        console.error('[PatternCtrl] Erro ao buscar metadados públicos do gametype:', err);
        res.status(500).json({ error: 'Erro ao buscar metadados.' });
    }
}

/**
 * PUT /api/v1/admin/gametypes/:gametypeId/metadata
 * Cria ou atualiza metadados off-chain de um gametype.
 *
 * Body: { description, cover_image_url, rules_summary, sort_order, rules, combinations }
 *   rules:        ExtendedRule[]   — pattern_id + weight (hundredths) + type
 *   combinations: CombinationRuleInput[] — combinações com weight (hundredths)
 */
export async function upsertGametypeMetadata(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;
    const { description, cover_image_url, rules_summary, sort_order, rules, combinations } = req.body;

    try {
        const $set: Record<string, unknown> = {
            description:     description ?? '',
            cover_image_url: cover_image_url ?? '',
            rules_summary:   rules_summary ?? '',
            sort_order:      sort_order ?? 0,
        };
        if (rules)        $set.rules        = rules;
        if (combinations) $set.combinations  = combinations;

        const metadata = await GametypeMetadataModel.findOneAndUpdate(
            { gametype_id: gametypeId },
            { $set },
            { upsert: true, new: true },
        ).lean();

        console.log(`✅ [PatternCtrl] Metadados do gametype ${gametypeId} upsertados.`);
        res.status(200).json(metadata);
    } catch (err) {
        console.error('[PatternCtrl] Erro ao upsert metadados do gametype:', err);
        res.status(500).json({ error: 'Erro ao salvar metadados.' });
    }
}
