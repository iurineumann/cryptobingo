import { Request, Response } from 'express';
import UserProfile from '../models/UserProfile';

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
 * PUT /api/v1/profile
 *
 * Atualiza preferências do usuário autenticado.
 *
 * O wallet é lido de `req.user.wallet` — o body NÃO pode sobrescrever
 * o wallet_address (prevenção de privilege escalation).
 *
 * Body aceito: { nickname?: string, locale?: string }
 */
export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const wallet_address = req.user!.wallet;
    const { nickname, locale } = req.body;

    // Validação mínima — expansível com zod/joi em iteração futura
    if (nickname !== undefined && typeof nickname !== 'string') {
        res.status(400).json({ error: 'Campo "nickname" deve ser uma string.' });
        return;
    }
    if (locale !== undefined && typeof locale !== 'string') {
        res.status(400).json({ error: 'Campo "locale" deve ser uma string.' });
        return;
    }

    // Constrói o update dinamicamente — só atualiza os campos enviados
    const updateFields: Record<string, unknown> = {};
    if (nickname !== undefined) updateFields['nickname'] = nickname;
    if (locale   !== undefined) updateFields['preferences.locale'] = locale;

    if (Object.keys(updateFields).length === 0) {
        res.status(400).json({ error: 'Nenhum campo válido para atualizar (nickname, locale).' });
        return;
    }

    try {
        const updatedProfile = await UserProfile.findOneAndUpdate(
            { wallet_address },
            { $set: updateFields },
            { new: true, runValidators: true } // runValidators: aplica enum do schema
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
