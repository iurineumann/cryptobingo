// apps/api-gateway/src/controllers/leaderboardController.ts
// Rankings públicos de vencedores — ledger PostgreSQL + cache Redis. Ref: ADR-024.

import { Request, Response } from 'express';
import { pgPool } from '../database';
import { redisClient } from '../database/redis';
import { UserProfile } from '../models/UserProfile';
import type { LeaderboardEntry, LeaderboardXpEntry } from '@cryptobingo/shared-types';

const TTL_SECONDS = 300; // 5 min

// ==========================================
// GET /api/v1/leaderboard
// ==========================================

export async function getLeaderboardGlobal(req: Request, res: Response): Promise<void> {
    const limit    = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const currency = req.query.currency ? String(req.query.currency).toUpperCase() : null;
    const cacheKey = `leaderboard:global:${currency ?? 'all'}:${limit}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const rows = await queryLeaderboard({ roomId: null, currency, limit });
        const entries = await enrichWithNicknames(rows);
        const payload = { entries, cached_at: new Date().toISOString(), currency_filter: currency };

        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => { /* best-effort */ });
        res.status(200).json(payload);
    } catch (err) {
        console.error('[Leaderboard] Erro ao buscar ranking global:', err);
        res.status(500).json({ error: 'Erro ao buscar leaderboard.' });
    }
}

// ==========================================
// GET /api/v1/leaderboard/rooms/:roomId
// ==========================================

export async function getLeaderboardByRoom(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    if (!roomId || !/^\d+$/.test(roomId)) {
        res.status(400).json({ error: 'roomId inválido.' });
        return;
    }

    const limit    = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 20);
    const cacheKey = `leaderboard:room:${roomId}:${limit}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const rows = await queryLeaderboard({ roomId, currency: null, limit });
        if (rows.length === 0) {
            // Sala sem histórico não é 404 — pode ter jogos futuros
            const payload = { room_id: roomId, entries: [], cached_at: new Date().toISOString() };
            res.status(200).json(payload);
            return;
        }

        const entries = await enrichWithNicknames(rows, roomId);
        const payload = { room_id: roomId, entries, cached_at: new Date().toISOString() };

        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => { /* best-effort */ });
        res.status(200).json(payload);
    } catch (err) {
        console.error('[Leaderboard] Erro ao buscar ranking da sala:', err);
        res.status(500).json({ error: 'Erro ao buscar leaderboard da sala.' });
    }
}

// ==========================================
// GET /api/v1/leaderboard/xp
// ==========================================

/**
 * Ranking por XP (progressão). Fonte: MongoDB userprofiles.progression.xp.
 * Público, cache Redis 300s.
 */
export async function getLeaderboardXp(req: Request, res: Response): Promise<void> {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const cacheKey = `leaderboard:xp:${limit}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const profiles = await UserProfile.find(
            { 'progression.xp': { $exists: true, $gt: 0 } },
            { wallet_address: 1, nickname: 1, progression: 1 },
        ).sort({ 'progression.xp': -1 }).limit(limit).lean();

        const entries: LeaderboardXpEntry[] = profiles.map((p, idx) => ({
            rank:          idx + 1,
            wallet:        p.wallet_address,
            nickname:      p.nickname ?? null,
            xp:            p.progression?.xp ?? 0,
            tier:          p.progression?.tier ?? 'Cobre',
            level:         p.progression?.level ?? 1,
            games_played:  p.progression?.games_played ?? 0,
        }));

        const payload = { entries, cached_at: new Date().toISOString() };
        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => {});
        res.status(200).json(payload);
    } catch (err) {
        console.error('[Leaderboard] Erro ao buscar ranking XP:', err);
        res.status(500).json({ error: 'Erro ao buscar ranking XP.' });
    }
}

// ==========================================
// Helpers
// ==========================================

interface LedgerRow {
    wallet_address: string;
    total_won:      string;
    currency:       string;
    games_won:      string;
}

async function queryLeaderboard(opts: {
    roomId:   string | null;
    currency: string | null;
    limit:    number;
}): Promise<LedgerRow[]> {
    const params: (string | number)[] = [opts.limit];
    let roomFilter     = '';
    let currencyFilter = '';

    if (opts.roomId) {
        params.push(opts.roomId);
        // game_id do ledger precisa coincidir com jogos da sala.
        // O memo da claim_win é preenchido pelo worker como "room:{room_id}:game:{game_id}".
        roomFilter = `AND tl.memo LIKE $${params.length}`;
        params[params.length - 1] = `room:${opts.roomId}:%`;
    }

    if (opts.currency) {
        params.push(opts.currency);
        currencyFilter = `AND tl.currency = $${params.length}`;
    }

    const sql = `
        SELECT
            tl.wallet_address,
            SUM(tl.amount)::float  AS total_won,
            tl.currency,
            COUNT(*)::int          AS games_won
        FROM transactions_ledger tl
        WHERE tl.action_type = 'claim_win'
          ${roomFilter}
          ${currencyFilter}
        GROUP BY tl.wallet_address, tl.currency
        ORDER BY total_won DESC
        LIMIT $1
    `;

    const result = await pgPool.query<LedgerRow>(sql, params);
    return result.rows;
}

async function enrichWithNicknames(
    rows: LedgerRow[],
    roomId?: string,
): Promise<LeaderboardEntry[]> {
    if (rows.length === 0) return [];

    const wallets = rows.map(r => r.wallet_address);
    const profiles = await UserProfile.find(
        { wallet_address: { $in: wallets } },
        { wallet_address: 1, nickname: 1 },
    ).lean();

    const nicknameMap = new Map(profiles.map(p => [p.wallet_address, p.nickname ?? null]));

    return rows.map((row, idx) => ({
        rank:      idx + 1,
        wallet:    row.wallet_address,
        nickname:  nicknameMap.get(row.wallet_address) ?? null,
        total_won: Number(row.total_won),
        currency:  row.currency,
        games_won: Number(row.games_won),
        ...(roomId ? { room_id: roomId } : {}),
    }));
}
