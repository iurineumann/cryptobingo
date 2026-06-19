import { Request, Response } from 'express';
import UserProfile from '../models/UserProfile';
import { Signature, Checksum256 } from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';

// Curva φ-tier (espelhada do xpEngine.ts — ADR-028 §9)
const PHI = 1.618034;
const BASE_XP = 906;
const N_PER_TIER = 25;
const MAX_LEVEL = 225;
const TIERS = ['Cobre','Bronze','Prata','Ouro','Platina','Esmeralda','Safira','Rubi','Diamante'];

function tierXp(t: number): number {
    return Math.floor(BASE_XP * Math.pow(PHI, t));
}

function tierThreshold(t: number): number {
    return Math.floor(BASE_XP * (Math.pow(PHI, t + 1) - 1) / (PHI - 1));
}

function totalXp(level: number): number {
    if (level <= 0) return 0;
    if (level >= MAX_LEVEL) return tierThreshold(8);
    const t = Math.min(8, Math.floor((level - 1) / N_PER_TIER));
    const inTier = level - t * N_PER_TIER;
    const prev = t > 0 ? tierThreshold(t - 1) : 0;
    const range = tierXp(t);
    return prev + Math.floor(range * Math.pow(inTier / N_PER_TIER, 2));
}

function deriveLevel(xp: number): { level: number; tier: string; sub_level: number } {
    let lo = 1, hi = MAX_LEVEL;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (totalXp(mid) <= xp) lo = mid;
        else hi = mid - 1;
    }
    const t = Math.min(8, Math.floor((lo - 1) / N_PER_TIER));
    return { level: lo, tier: TIERS[t], sub_level: ((lo - 1) % N_PER_TIER) + 1 };
}

/**
 * GET /api/v1/profile
 *
 * Retorna o perfil do usuário autenticado.
 * Cria o perfil automaticamente se for o primeiro login (upsert implícito).
 *
 * O wallet é lido exclusivamente de `req.user.wallet`, injetado pelo
 * middleware `requireAuth`. Não aceita wallet via query param — isso
 * foi o vetor de vulnerabilidade que existia anteriormente.
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    // req.user é garantido pelo middleware requireAuth — nunca será undefined aqui
    const wallet_address = req.user!.wallet;

    try {
        let profile = await UserProfile.findOne({ wallet_address });

        // Primeiro login: cria o perfil com valores padrão do schema
        if (!profile) {
            profile = await UserProfile.create({ wallet_address });
            console.log(`✨ [Profile] Novo perfil criado para: ${wallet_address}`);
        }

        // Enriquecimento de progressão (ADR-028 2D)
        const { xp = 0, tier, level, sub_level, games_played = 0 } = profile.progression || {};
        const currentXp = xp || 0;
        const derived = deriveLevel(currentXp);
        const nextLevel = Math.min(derived.level + 1, MAX_LEVEL);
        const nextLevelXp = totalXp(nextLevel);
        const currentLevelXp = totalXp(derived.level);
        const xpIntoLevel = currentXp - currentLevelXp;
        const xpNeeded = nextLevelXp - currentLevelXp;

        res.status(200).json({
            ...profile.toObject(),
            progression: {
                xp: currentXp,
                tier: derived.tier,
                level: derived.level,
                sub_level: derived.sub_level,
                games_played,
                next_level_xp: nextLevelXp,
                xp_to_next_level: Math.max(0, xpNeeded - xpIntoLevel),
                progress_pct: xpNeeded > 0 ? Math.round((xpIntoLevel / xpNeeded) * 100) : 100,
            },
        });
    } catch (error) {
        console.error(`[Profile] Erro ao buscar perfil de ${wallet_address}:`, error);
        res.status(500).json({ error: 'Erro interno ao buscar perfil.' });
    }
};

/**
 * Verifica assinatura WAX para updates sensíveis de perfil.
 *
 * Dois modos (espelha authController):
 *   - Digest (dev): cliente assina SHA256("UPDATE_PROFILE:<wallet>:<ts>:<bodyJson>") diretamente.
 *   - Transação (prod): cliente assina eosio.null:nonce com payload em hex; server verifica
 *     via transaction.id e checa que o nonce data == hex(payload).
 */
async function verifyProfileSignature(
    wallet: string,
    ts: number,
    bodyJson: string,
    signature: string,
    transactionPayload?: object,
): Promise<boolean> {
    if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;

    const payload    = `UPDATE_PROFILE:${wallet}:${ts}:${bodyJson}`;
    const payloadHex = Buffer.from(payload, 'utf-8').toString('hex');

    try {
        const sig = Signature.from(signature);
        let recovered: string;

        if (transactionPayload) {
            // Modo produção: verifica via transaction.id
            const { Transaction } = await import('@wharfkit/antelope');
            const tx = Transaction.from(transactionPayload as any);
            // Valida que o data da action é o hex do payload esperado
            const actionDataHex = tx.actions[0]?.data?.toString() ?? '';
            if (actionDataHex.toLowerCase() !== payloadHex.toLowerCase()) return false;
            recovered = sig.recoverDigest(tx.id).toString();
        } else {
            // Modo dev: verifica via digest direto
            const digest = Checksum256.hash(Buffer.from(payload, 'utf-8'));
            recovered    = sig.recoverDigest(digest).toString();
        }

        const accountInfo: any = await rpcClient.v1.chain.get_account(wallet as any);
        const activeKeys: string[] = accountInfo.permissions
            ?.find((p: any) => String(p.perm_name) === 'active')
            ?.required_auth?.keys?.map((k: any) => String(k.key)) ?? [];

        return activeKeys.includes(recovered);
    } catch (err) {
        console.error('[Profile] verifyProfileSignature erro interno:', err);
        return false;
    }
}

/**
 * PUT /api/v1/profile
 *
 * Atualiza preferências e dados de perfil do usuário autenticado.
 * Campos sensíveis (nickname, avatar_nft_asset_id) requerem WAX signature.
 *
 * Body: { nickname?, locale?, avatar_nft_asset_id?, signature?, ts? }
 * signature + ts obrigatórios se nickname ou avatar_nft_asset_id presentes.
 */
export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const wallet_address = req.user!.wallet;
    const { nickname, locale, avatar_nft_asset_id, signature, ts, transactionPayload } = req.body;

    const hasSensitive = nickname !== undefined || avatar_nft_asset_id !== undefined;

    if (nickname !== undefined && typeof nickname !== 'string') {
        res.status(400).json({ error: 'Campo "nickname" deve ser uma string.' });
        return;
    }
    if (nickname !== undefined && (nickname.length < 1 || nickname.length > 32)) {
        res.status(400).json({ error: 'nickname deve ter entre 1 e 32 caracteres.' });
        return;
    }
    if (locale !== undefined && typeof locale !== 'string') {
        res.status(400).json({ error: 'Campo "locale" deve ser uma string.' });
        return;
    }
    if (avatar_nft_asset_id !== undefined && avatar_nft_asset_id !== null && typeof avatar_nft_asset_id !== 'string') {
        res.status(400).json({ error: 'Campo "avatar_nft_asset_id" deve ser string ou null.' });
        return;
    }

    // Campos sensíveis exigem WAX signature
    if (hasSensitive) {
        if (!signature || typeof ts !== 'number') {
            res.status(400).json({ error: 'nickname/avatar requerem "signature" (WAX) e "ts" (timestamp).' });
            return;
        }
        const sensitiveBody = JSON.stringify({
            ...(nickname !== undefined           ? { nickname }              : {}),
            ...(avatar_nft_asset_id !== undefined ? { avatar_nft_asset_id } : {}),
        });
        const valid = await verifyProfileSignature(wallet_address, ts, sensitiveBody, signature, transactionPayload);
        if (!valid) {
            res.status(401).json({ error: 'Assinatura WAX inválida ou expirada.' });
            return;
        }
    }

    const updateFields: Record<string, unknown> = {};
    if (nickname !== undefined)             updateFields['nickname']              = nickname;
    if (locale   !== undefined)             updateFields['preferences.locale']   = locale;
    if (avatar_nft_asset_id !== undefined)  updateFields['avatar_nft_asset_id']  = avatar_nft_asset_id;

    if (Object.keys(updateFields).length === 0) {
        res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
        return;
    }

    try {
        const updatedProfile = await UserProfile.findOneAndUpdate(
            { wallet_address },
            { $set: updateFields },
            { returnDocument: 'after', runValidators: true },
        );

        if (!updatedProfile) {
            res.status(404).json({ error: 'Perfil não encontrado.' });
            return;
        }

        res.status(200).json(updatedProfile);
    } catch (error) {
        console.error(`[Profile] Erro ao atualizar perfil de ${wallet_address}:`, error);
        res.status(500).json({ error: 'Erro interno ao atualizar preferências.' });
    }
};

/**
 * GET /api/v1/admin/users
 *
 * Lista todos os usuários da plataforma (acesso restrito a admin).
 * Suporta paginação via query params: ?page=1&limit=50
 */
// ── Achievement Definitions (espelhado do worker achievementEngine.ts) ─────
const ACHIEVEMENT_DEFS = [
    { id: 'first_win',    label: 'Primeira Vitória',        desc: 'Ganhe sua primeira partida',               icon: '🏆' },
    { id: 'win_5',        label: 'Colecionador (5)',         desc: 'Ganhe 5 partidas',                        icon: '🏅' },
    { id: 'win_25',       label: 'Colecionador (25)',        desc: 'Ganhe 25 partidas',                       icon: '🥇' },
    { id: 'win_100',      label: 'Colecionador (100)',       desc: 'Ganhe 100 partidas',                      icon: '👑' },
    { id: 'combo_1',      label: 'Combinador',               desc: 'Complete sua primeira combinação',         icon: '🔗' },
    { id: 'combo_10',     label: 'Mestre das Combos (10)',   desc: 'Complete 10 combinações',                  icon: '🔗' },
    { id: 'combo_50',     label: 'Mestre das Combos (50)',   desc: 'Complete 50 combinações',                  icon: '🔗' },
    { id: 'buy_10',       label: 'Apostador (10)',            desc: 'Compre 10 cartelas',                      icon: '🎫' },
    { id: 'buy_50',       label: 'Apostador (50)',            desc: 'Compre 50 cartelas',                      icon: '🎫' },
    { id: 'buy_250',      label: 'Apostador (250)',           desc: 'Compre 250 cartelas',                     icon: '🎫' },
    { id: 'buy_1000',     label: 'Apostador (1000)',          desc: 'Compre 1000 cartelas',                    icon: '🎫' },
    { id: 'games_10',     label: 'Veterano (10 jogos)',       desc: 'Participe de 10 partidas',                icon: '🎲' },
    { id: 'games_50',     label: 'Veterano (50 jogos)',       desc: 'Participe de 50 partidas',                icon: '🎲' },
    { id: 'games_200',    label: 'Veterano (200 jogos)',      desc: 'Participe de 200 partidas',               icon: '🎲' },
    { id: 'streak_7',     label: 'Sequência (7 dias)',        desc: 'Mantenha sequência de 7 dias',            icon: '🔥' },
    { id: 'streak_14',    label: 'Sequência (14 dias)',       desc: 'Mantenha sequência de 14 dias',           icon: '🔥' },
    { id: 'streak_30',    label: 'Sequência (30 dias)',       desc: 'Mantenha sequência de 30 dias',           icon: '🔥' },
    { id: 'burn_1',       label: 'Queimador',                 desc: 'Queime seu primeiro NFT',                 icon: '🔥' },
    { id: 'burn_10',      label: 'Incinerador (10)',          desc: 'Queime 10 NFTs',                          icon: '🔥' },
    { id: 'burn_50',      label: 'Incinerador (50)',          desc: 'Queime 50 NFTs',                          icon: '🔥' },
    { id: 'golden_win',   label: 'Bola de Ouro',              desc: 'Ganhe com a Golden Ball ativa',            icon: '🌟' },
    { id: 'stage_win',    label: 'Multi-Estágio',             desc: 'Vença um estágio em modo MultiMatch',      icon: '🎯' },
    { id: 'tier_bronze',  label: 'Patamar Bronze',            desc: 'Alcance o tier Bronze',                   icon: '🥉' },
    { id: 'tier_prata',   label: 'Patamar Prata',             desc: 'Alcance o tier Prata',                    icon: '🥈' },
    { id: 'tier_ouro',    label: 'Patamar Ouro',              desc: 'Alcance o tier Ouro',                     icon: '🪙' },
    { id: 'tier_platina', label: 'Patamar Platina',           desc: 'Alcance o tier Platina',                  icon: '💿' },
    { id: 'tier_esmeralda', label: 'Patamar Esmeralda',       desc: 'Alcance o tier Esmeralda',                icon: '💚' },
    { id: 'tier_safira',  label: 'Patamar Safira',            desc: 'Alcance o tier Safira',                   icon: '💎' },
    { id: 'tier_rubi',    label: 'Patamar Rubi',              desc: 'Alcance o tier Rubi',                     icon: '❤️' },
    { id: 'tier_diamante', label: 'Patamar Diamante',         desc: 'Alcance o tier Diamante',                 icon: '💎' },
];

/**
 * GET /api/v1/profile/achievements
 *
 * Retorna todas as conquistas disponíveis com estado de desbloqueio do jogador.
 */
export const getAchievements = async (req: Request, res: Response): Promise<void> => {
    const wallet_address = req.user!.wallet;

    try {
        const profile = await UserProfile.findOne({ wallet_address }, {
            'achievements': 1, _id: 0,
        }).lean();

        const unlockedIds = new Set((profile?.achievements ?? []).map((a: { id: string }) => a.id));

        const achievements = ACHIEVEMENT_DEFS.map(def => ({
            ...def,
            unlocked: unlockedIds.has(def.id),
        }));

        res.status(200).json({ achievements });
    } catch (error) {
        console.error(`[Achievements] Erro ao buscar conquistas de ${wallet_address}:`, error);
        res.status(500).json({ error: 'Erro interno ao buscar conquistas.' });
    }
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const page  = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const skip  = (page - 1) * limit;

        const [users, total] = await Promise.all([
            UserProfile.find({}, {
                wallet_address: 1, nickname: 1, role: 1,
                'progression.games_played': 1, createdAt: 1,
            }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            UserProfile.countDocuments(),
        ]);

        res.status(200).json({
            users: users.map(u => ({
                wallet_address: u.wallet_address,
                username:       u.nickname,
                role:           u.role,
                total_games:    (u.progression as any)?.games_played ?? 0,
                total_wagered:  null,
            })),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[Profile] Erro ao listar usuários:', error);
        res.status(500).json({ error: 'Erro interno ao listar usuários.' });
    }
};
