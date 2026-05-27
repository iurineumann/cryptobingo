import { Request, Response } from 'express';
import UserProfile from '../models/UserProfile';

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

        res.status(200).json(profile);
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
