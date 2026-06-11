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
import { UInt64 }            from '@wharfkit/antelope';
import type { BlockchainPattern, BlockchainGametype, StageRule } from '@cryptobingo/shared-types';
import { redisClient }          from '../database/redis';
import GametypeMetadataModel from '../models/GametypeMetadata';

const CONTRACT_ACCOUNT  = process.env.CONTRACT_ACCOUNT      || 'bingogamectr';
const MICROSERVICE_KEY  = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID          = process.env.CHAIN_ID!;
const RPC_URL           = process.env.RPC_URL               || 'http://127.0.0.1:8888';
const PATTERN_CACHE_TTL = 3_600; // 1 hora — alinhado ao patternCache.ts do worker

// ADR-026: assina como bingogamectr@admin com a chave do bingogamesvc
// bingogamectr@admin aceita bingogamesvc@active como signatário — CONTRACT_PRIVATE_KEY não é necessária
function getAdminSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'admin',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_KEY),
    });
}

// ADR-016: sincroniza as combinações (combo_id → weight) on-chain via setcombos.
// O contrato valida o weight em claimcombo, então a fonte de verdade do PESO é
// on-chain; as cláusulas permanecem off-chain (MongoDB). combo_id = índice canônico.
async function pushSetCombosOnChain(
    gametypeId: string,
    combos:     Array<{ combo_id: number; weight: number }>,
): Promise<string | undefined> {
    const session = getAdminSession();
    const result  = await session.transact({
        actions: [{
            account:       CONTRACT_ACCOUNT,
            name:          'setcombos',
            authorization: [session.permissionLevel],
            data:          { gametype_id: gametypeId, combinations: combos },
        }],
    }, { broadcast: true });
    return result.response?.transaction_id;
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

        await redisClient.del(`pattern:gametype:${gametype_id}`);
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

/**
 * PUT /api/v1/admin/gametypes/:gametypeId
 * Atualiza um gametype on-chain (addgametype upsert) + metadados.
 * Mesma validação do upsertGametype, mas gametype_id vem da URL.
 *
 * Body: { name, base_multiplier, rules, draw_mode, max_balls, golden_ball_after, master_weight_ovrd }
 */
export async function updateGametype(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;
    const {
        name, base_multiplier, rules,
        draw_mode, max_balls, golden_ball_after, master_weight_ovrd,
    } = req.body;

    if (!name || !base_multiplier || !rules) {
        res.status(400).json({ error: 'Campos obrigatórios: name, base_multiplier, rules.' });
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
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'addgametype',
                authorization: [session.permissionLevel],
                data: {
                    gametype_id: gametypeId, name, base_multiplier, rules,
                    draw_mode:            draw_mode ?? 'standard',
                    max_balls:            max_balls ?? 0,
                    golden_ball_after:    golden_ball_after ?? 0,
                    master_weight_ovrd:   master_weight_ovrd ?? 0,
                },
            }],
        }, { broadcast: true });

        // Invalida cache Redis do worker
        if (redisClient.isOpen) {
            await redisClient.del(`pattern:gametype:${gametypeId}`);
        }

        console.log(`✅ [PatternCtrl] Gametype ${gametypeId} (${name}) atualizado. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Gametype "${name}" atualizado com sucesso.`,
            gametype_id:    gametypeId,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao atualizar gametype:', err);
        res.status(500).json({ error: `Erro ao atualizar gametype: ${msg}` });
    }
}

/**
 * PUT /api/v1/admin/gametypes/:gametypeId/stages
 * Define os estágios progressivos de um gametype MULTI_MATCH (ADR-013).
 *
 * Body: { stages: StageRule[] }
 */
export async function saveStages(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;
    const { stages } = req.body;

    if (!Array.isArray(stages)) {
        res.status(400).json({ error: 'stages deve ser um array.' });
        return;
    }
    for (const s of stages) {
        if (!s.stage || !s.patterns_required || !s.weight) {
            res.status(400).json({ error: 'Cada stage deve ter stage, patterns_required e weight.' });
            return;
        }
        if (s.weight < 100 || s.weight > 25500) {
            res.status(400).json({ error: 'weight de cada stage deve ser 1.00-255.00 (100-25500 hundredths).' });
            return;
        }
    }

    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'setstages',
                authorization: [session.permissionLevel],
                data: {
                    gametype_id: gametypeId,
                    stages:      stages.map(s => ({
                        stage:             s.stage,
                        patterns_required: s.patterns_required,
                        weight:            Math.round(Number(s.weight)),
                    })),
                },
            }],
        }, { broadcast: true });

        if (redisClient.isOpen) {
            await redisClient.del(`pattern:gametype:${gametypeId}`);
        }

        console.log(`✅ [PatternCtrl] Stages do gametype ${gametypeId} atualizados. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        'Estágios atualizados com sucesso.',
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PatternCtrl] Erro ao salvar stages:', err);
        res.status(500).json({ error: `Erro ao salvar estágios: ${msg}` });
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
 * GET /api/v1/gametypes/:gametypeId/patterns  (público)
 * Retorna padrões on-chain + combinações off-chain em uma única chamada,
 * com cache Redis (TTL 1h).
 *
 * Cache key: pattern:gametype:{gametypeId} (formato rico — o worker usa worker:pattern:gametype:{id})
 *
 * Response: {
 *   patterns:     { name, mask, weight }[]   — on-chain
 *   rules:        { pattern_id, weight, type }[] — MongoDB extended rules
 *   combinations: CombinationRuleDoc[]        — MongoDB combos
 * }
 */
export async function getGametypePatternsPublic(req: Request, res: Response): Promise<void> {
    const { gametypeId } = req.params;

    try {
        // 1. Tenta Redis cache
        if (redisClient.isOpen) {
            const cached = await redisClient.get(`pattern:gametype:${gametypeId}`);
            if (cached) {
                res.status(200).json(JSON.parse(cached));
                return;
            }
        }

        // 2. Cache miss: busca on-chain patterns
        const gtRes = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'gametypes',
            lower_bound: UInt64.from(gametypeId), upper_bound: UInt64.from(gametypeId),
            limit: 1, json: true,
        });
        if (!gtRes.rows.length) {
            res.status(404).json({ error: 'Gametype não encontrado on-chain.' });
            return;
        }
        const gametype = gtRes.rows[0] as BlockchainGametype;

        const patterns: Array<{ pattern_id: string; name: string; mask: string; weight: number }> = [];
        for (const rule of gametype.rules) {
            const patRes = await rpcClient.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'patterns',
                lower_bound: UInt64.from(String(rule.pattern_id)),
                upper_bound: UInt64.from(String(rule.pattern_id)),
                limit: 1, json: true,
            });
            if (patRes.rows.length) {
                const p = patRes.rows[0] as BlockchainPattern;
                // pattern_id é necessário para o worker mapear tipo (simple/special/master)
                // das rules estendidas (off-chain) às combinações n_of_type. ADR-016.
                patterns.push({ pattern_id: String(rule.pattern_id), name: p.name, mask: String(p.mask), weight: rule.weight });
            }
        }

        // 3. Cache miss: busca combinations + extended rules do MongoDB
        const metadata = await GametypeMetadataModel.findOne({ gametype_id: gametypeId })
            .select('rules combinations')
            .lean();

        const payload = {
            patterns,
            rules:        (metadata as any)?.rules        ?? [],
            combinations: (metadata as any)?.combinations ?? [],
        };

        // 4. Popula o cache Redis
        if (redisClient.isOpen) {
            await redisClient.set(
                `pattern:gametype:${gametypeId}`,
                JSON.stringify(payload),
                { EX: PATTERN_CACHE_TTL },
            );
        }

        res.status(200).json(payload);
    } catch (err) {
        console.error('[PatternCtrl] Erro ao buscar padrões do gametype:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
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

    if (rules !== undefined && !Array.isArray(rules)) {
        res.status(400).json({ error: 'rules deve ser um array de objetos { pattern_id, weight, type }.' });
        return;
    }

    // ADR-016: atribui combo_id canônico (índice) e valida o peso on-chain (1.00–255.00).
    let combosWithId: Array<Record<string, unknown>> | undefined;
    if (Array.isArray(combinations)) {
        combosWithId = combinations.map((c: Record<string, unknown>, i: number) => ({ ...c, combo_id: i }));
        for (const c of combosWithId) {
            const w = Math.round(Number(c.weight));
            if (!Number.isFinite(w) || w < 1 || w > 25500) {
                res.status(400).json({ error: `combo "${c.name ?? '?'}" tem weight inválido (deve ser 1.00–255.00 / 1–25500 hundredths).` });
                return;
            }
        }
    }

    try {
        const $set: Record<string, unknown> = {};
        if (description !== undefined)      $set.description     = description;
        if (cover_image_url !== undefined)  $set.cover_image_url = cover_image_url;
        if (rules_summary !== undefined)    $set.rules_summary   = rules_summary;
        if (sort_order !== undefined)       $set.sort_order      = sort_order;
        if (rules)                          $set.rules           = rules;
        if (combosWithId)                   $set.combinations    = combosWithId;

        const metadata = await GametypeMetadataModel.findOneAndUpdate(
            { gametype_id: gametypeId },
            { $set },
            { upsert: true, new: true },
        ).lean();

        console.log(`✅ [PatternCtrl] Metadados do gametype ${gametypeId} upsertados.`);

        // ADR-016: sincroniza as combinações on-chain (fonte de verdade do peso).
        // Se falhar, há DRIFT (Mongo salvo, chain não) — surface erro p/ retry via "Editar combinações".
        if (combosWithId) {
            const onchain = combosWithId.map((c, i) => ({ combo_id: i, weight: Math.round(Number(c.weight)) }));
            try {
                const txId = await pushSetCombosOnChain(gametypeId, onchain);
                console.log(`🔗 [PatternCtrl] setcombos on-chain do gametype ${gametypeId}. TX: ${txId}`);
                // Invalida o cache do worker para refletir os novos pesos
                if (redisClient.isOpen) {
                    await redisClient.del(`pattern:gametype:${gametypeId}`);
                }
            } catch (chainErr) {
                const msg = chainErr instanceof Error ? chainErr.message : String(chainErr);
                console.error('[PatternCtrl] Falha ao sincronizar combinações on-chain:', chainErr);
                res.status(502).json({
                    error:  'Metadados salvos, mas a sincronização das combinações on-chain falhou. Tente novamente.',
                    detail: msg,
                });
                return;
            }
        }

        res.status(200).json(metadata);
    } catch (err) {
        console.error('[PatternCtrl] Erro ao upsert metadados do gametype:', err);
        res.status(500).json({ error: 'Erro ao salvar metadados.' });
    }
}
