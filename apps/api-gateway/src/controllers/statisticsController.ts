// apps/api-gateway/src/controllers/statisticsController.ts
// Endpoints de auditoria e compliance — Lei 14.790/2023.
// Ref: COMPLIANCE.md §2.2, openapi.yaml /statistics/rtp

import { Request, Response } from 'express';
import { getRtpReport, getRecentGames, upsertGameHistory, getGameStatsBatch, getPlatformSummary } from '../database/ledger';
import { UInt64 } from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';
import type { BlockchainGameState } from '@cryptobingo/shared-types';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';

// ==========================================
// GET /api/v1/statistics/rtp
// ==========================================

/**
 * Relatório de RTP/GGR — público.
 * Agrega dados do ledger PostgreSQL para os últimos N dias.
 * Ref: COMPLIANCE.md §2.2, Lei 14.790/2023
 */
export async function getRtpStatistics(req: Request, res: Response): Promise<void> {
    try {
        const days     = Math.min(Number(req.query.days     ?? 30),  365);
        const currency = String(req.query.currency ?? 'WAX').toUpperCase();

        const report = await getRtpReport(days, currency);
        res.status(200).json(report);
    } catch (err) {
        console.error('[Statistics] Erro ao gerar relatório RTP:', err);
        res.status(500).json({ error: 'Erro ao gerar relatório de compliance.' });
    }
}

// ==========================================
// GET /api/v1/statistics/games
// ==========================================

/**
 * Lista os jogos recentes com seus RTPs individuais — para auditores.
 */
export async function getGamesHistory(req: Request, res: Response): Promise<void> {
    try {
        const limit = Math.min(Number(req.query.limit ?? 20), 100);
        const games = await getRecentGames(limit);
        res.status(200).json({ games, count: games.length });
    } catch (err) {
        console.error('[Statistics] Erro ao listar histórico de jogos:', err);
        res.status(500).json({ error: 'Erro ao buscar histórico de jogos.' });
    }
}

// ==========================================
// GET /api/v1/statistics/games/batch?gameIds=id1,id2,...
// ==========================================

/**
 * Retorna estatísticas de compliance para um conjunto de game_ids.
 * Público — dados de auditoria (Lei 14.790/2023).
 * Best-effort: jogos não sincronizados no ledger são omitidos da resposta.
 */
export async function getGameStatsBatchHandler(req: Request, res: Response): Promise<void> {
    try {
        const raw = String(req.query.gameIds ?? '');
        const gameIds = raw
            .split(',')
            .map(s => s.trim())
            .filter(s => /^\d+$/.test(s))
            .slice(0, 200); // limite defensivo

        if (gameIds.length === 0) {
            res.status(200).json({ stats: {} });
            return;
        }

        const rows = await getGameStatsBatch(gameIds);
        const stats: Record<string, { totalTickets: number; totalWagered: number; totalPaidOut: number; rtpPct: number }> = {};
        for (const r of rows) {
            stats[r.game_id] = {
                totalTickets:  r.total_tickets,
                totalWagered:  r.total_wagered,
                totalPaidOut:  r.total_paid_out,
                rtpPct:        r.rtp_pct,
            };
        }
        res.status(200).json({ stats });
    } catch (err) {
        console.error('[Statistics] Erro ao buscar batch de stats:', err);
        res.status(500).json({ error: 'Erro ao buscar estatísticas de jogos.' });
    }
}

// ==========================================
// GET /api/v1/statistics/summary
// ==========================================

/**
 * Resumo agregado da plataforma — público.
 * Retorna total_games, total_prizes, total_players, avg_rtp_pct.
 * Usado pela landing page (StatsBar) e dashboards públicos.
 */
export async function getPlatformSummaryHandler(req: Request, res: Response): Promise<void> {
    try {
        const summary = await getPlatformSummary();
        res.status(200).json(summary);
    } catch (err) {
        console.error('[Statistics] Erro ao gerar resumo da plataforma:', err);
        res.status(500).json({ error: 'Erro ao gerar resumo da plataforma.' });
    }
}

// ==========================================
// POST /api/v1/admin/ledger/sync
// Sincroniza manualmente um jogo on-chain com o ledger PostgreSQL.
// Útil para reprocessar jogos ou popular o ledger retroativamente.
// ==========================================

export async function syncGameToLedger(req: Request, res: Response): Promise<void> {
    const { gameId } = req.body;

    if (!gameId || typeof gameId !== 'string') {
        res.status(400).json({ error: 'Campo "gameId" obrigatório.' });
        return;
    }

    try {
        // Busca dados on-chain
        const gameRes = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'games',
            lower_bound: UInt64.from(gameId),
            upper_bound: UInt64.from(gameId),
            limit:       1,
            json:        true,
        });

        if (!gameRes.rows.length) {
            res.status(404).json({ error: `Jogo ${gameId} não encontrado on-chain.` });
            return;
        }

        const game = gameRes.rows[0] as BlockchainGameState;

        // Conta tickets on-chain
        const ticketsRes = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: gameId,
            table: 'tickets',
            limit: 1000,
            json:  true,
        });
        const totalTickets = ticketsRes.rows.length;

        // Extrai valores
        const [priceAmount, priceSymbol] = game.ticket_price.quantity.split(' ');
        const [wageredAmount]            = game.total_wagered.quantity.split(' ');
        const ticketPrice     = parseFloat(priceAmount);
        const totalWagered    = parseFloat(wageredAmount);
        const totalPaidOut    = parseFloat(String(game.total_paid ?? 0));

        await upsertGameHistory({
            game_id:       game.game_id,
            status:        game.status,
            gametype_id:   (game as any).gametype_id ?? '0',
            campaign_id:   game.campaign_id ?? '0',
            ticket_price:  ticketPrice,
            ticket_symbol: priceSymbol,
            total_wagered: totalWagered,
            total_tickets: totalTickets,
            total_paid_out: totalPaidOut,
            resolved_at:   game.end_time ? new Date(game.end_time * 1000) : undefined,
        });

        console.log(`✅ [Ledger] Jogo ${gameId} sincronizado.`);
        res.status(200).json({ message: `Jogo ${gameId} sincronizado com sucesso.`, game_id: gameId });

    } catch (err) {
        console.error('[Ledger] Erro ao sincronizar jogo:', err);
        res.status(500).json({ error: 'Erro ao sincronizar jogo com o ledger.' });
    }
}
