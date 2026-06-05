import { Request, Response } from 'express';
import { pgPool } from '../database';

export async function getPlayerWinnings(req: Request, res: Response): Promise<void> {
    const { gameId } = req.params;
    const wallet = req.user?.wallet;
    if (!wallet) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!gameId) {
        res.status(400).json({ error: 'gameId required' });
        return;
    }

    try {
        const result = await pgPool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM transactions_ledger
             WHERE wallet_address = $1 AND game_id = $2 AND action_type = 'claim_win'`,
            [wallet, gameId]
        );
        res.json({
            gameId,
            wallet,
            totalWon: parseFloat(result.rows[0].total) || 0,
        });
    } catch (err) {
        console.error('[Winnings] Query error:', err);
        res.status(500).json({ error: 'Failed to query winnings' });
    }
}

export async function getPlayerWinningsBatch(req: Request, res: Response): Promise<void> {
    const wallet = req.user?.wallet;
    if (!wallet) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { gameIds } = req.body as { gameIds?: string[] };
    if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
        res.status(400).json({ error: 'gameIds array required' });
        return;
    }

    try {
        const placeholders = gameIds.map((_, i) => `$${i + 2}`).join(',');
        const result = await pgPool.query(
            `SELECT game_id, COALESCE(SUM(amount), 0) AS total
             FROM transactions_ledger
             WHERE wallet_address = $1 AND game_id IN (${placeholders}) AND action_type = 'claim_win'
             GROUP BY game_id`,
            [wallet, ...gameIds]
        );

        const winningsMap: Record<string, number> = {};
        for (const row of result.rows) {
            winningsMap[row.game_id] = parseFloat(row.total) || 0;
        }
        res.json({ winnings: winningsMap });
    } catch (err) {
        console.error('[Winnings] Batch query error:', err);
        res.status(500).json({ error: 'Failed to query winnings' });
    }
}
