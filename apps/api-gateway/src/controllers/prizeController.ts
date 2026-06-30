import { Request, Response } from 'express';
import { PrizeTx } from '../models/PrizeTx';

export async function listGamePrizes(req: Request, res: Response): Promise<void> {
    const { gameId } = req.params as Record<string, string>;

    if (!gameId || gameId.trim().length === 0) {
        res.status(400).json({ error: 'gameId é obrigatório.' });
        return;
    }

    try {
        const items = await PrizeTx
            .find({ gameId })
            .sort({ claimedAt: -1 })
            .lean();

        res.status(200).json({ items, total: items.length, gameId });
    } catch (err) {
        console.error('[Prize] Erro ao listar prêmios:', err);
        res.status(500).json({ error: 'Erro ao listar prêmios.' });
    }
}
