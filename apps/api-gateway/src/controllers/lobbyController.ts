// apps/api-gateway/src/controllers/lobbyController.ts
// Agrega dados do lobby com cache Redis. Ref: Issue #268.

import { Request, Response } from 'express';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 } from '@wharfkit/antelope';
import type {
    BlockchainGameState,
    BlockchainRoom,
    BlockchainGametype,
    BlockchainBalance,
} from '@cryptobingo/shared-types';
import RoomMetadataModel from '../models/RoomMetadata';
import { redisClient } from '../database/redis';
import { logger } from '../middleware/logger';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const LOBBY_CACHE_TTL   = 2;
const LOBBY_ME_CACHE_TTL = 2;

function makeLobbyCacheKey(): string {
    return 'lobby:shared';
}

function makeLobbyMeCacheKey(wallet: string): string {
    return `lobby:me:${wallet.toLowerCase()}`;
}

// ==========================================
// GET /api/v1/lobby — dados compartilhados
// ==========================================

export async function getLobby(_req: Request, res: Response): Promise<void> {
    const cacheKey = makeLobbyCacheKey();

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open — segue sem cache */ }

    try {
        const [gamesRes, roomsRes, gametypesRes] = await Promise.all([
            rpcClient.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT,
                scope: CONTRACT_ACCOUNT,
                table: 'games',
                limit: 50,
                reverse: true,
                json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT,
                scope: CONTRACT_ACCOUNT,
                table: 'rooms',
                limit: 100,
                json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT,
                scope: CONTRACT_ACCOUNT,
                table: 'gametypes',
                limit: 50,
                json: true,
            }),
        ]);

        const games = gamesRes.rows as BlockchainGameState[];
        const rooms = roomsRes.rows as BlockchainRoom[];
        const gametypes = gametypesRes.rows as BlockchainGametype[];

        const roomIds = rooms.map(r => String(r.room_id));
        const metadatas = roomIds.length > 0
            ? await RoomMetadataModel.find({ room_id: { $in: roomIds } }).lean()
            : [];
        const metaMap = new Map(metadatas.map(m => [m.room_id, m]));

        const enrichedRooms = rooms.map(room => ({
            ...room,
            metadata: metaMap.get(String(room.room_id)) ?? null,
        }));

        const payload = { games, rooms: enrichedRooms, gametypes };

        redisClient.setEx(cacheKey, LOBBY_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
        res.status(200).json(payload);
    } catch (err) {
        logger.error({ err, tag: 'LobbyCtrl' }, 'Erro ao carregar lobby compartilhado');
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// GET /api/v1/lobby/me — dados por jogador
// Auth: JWT (requireAuth)
// ==========================================

export async function getLobbyMe(req: Request, res: Response): Promise<void> {
    const wallet = req.user?.wallet;
    if (!wallet) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
    }

    const cacheKey = makeLobbyMeCacheKey(wallet);

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const walletName = Name.from(wallet);
        const walletU64 = walletName.value;
        const scopeStr = wallet;

        // Balances on-chain
        const balRes = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: scopeStr,
            table: 'balances',
            limit: 20,
            json: true,
        });
        const balances = balRes.rows as BlockchainBalance[];

        // Jogos para identificar funding e archived/drawn
        const gamesRes = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'games',
            limit: 50,
            reverse: true,
            json: true,
        });
        const games = gamesRes.rows as BlockchainGameState[];

        // Tickets em jogos funding — agrupa por room_id
        const fundingGames = games.filter(g =>
            g.status === 'funding' && g.room_id && g.room_id !== '0'
        );
        const myTickets: Record<string, number> = {};

        if (fundingGames.length > 0) {
            const ticketResults = await Promise.allSettled(
                fundingGames.map(g =>
                    rpcClient.v1.chain.get_table_rows({
                        code: CONTRACT_ACCOUNT,
                        scope: Name.from(UInt64.from(g.game_id)),
                        table: 'tickets',
                        limit: 200,
                        lower_bound: walletU64,
                        upper_bound: walletU64,
                        index_position: 'secondary',
                        key_type: 'i64',
                        json: true,
                    })
                )
            );
            ticketResults.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    const roomId = String(fundingGames[i].room_id);
                    myTickets[roomId] = (myTickets[roomId] || 0) + r.value.rows.length;
                }
            });
        }

        // Salas onde o jogador já participou (histórico)
        const replayCandidates = games.filter(g =>
            ['archived', 'drawn'].includes(g.status) &&
            g.room_id && g.room_id !== '0'
        );
        const playerRoomIds: string[] = [];

        if (replayCandidates.length > 0) {
            const participationResults = await Promise.allSettled(
                replayCandidates.map(g =>
                    rpcClient.v1.chain.get_table_rows({
                        code: CONTRACT_ACCOUNT,
                        scope: Name.from(UInt64.from(g.game_id)),
                        table: 'tickets',
                        limit: 1,
                        lower_bound: walletU64,
                        upper_bound: walletU64,
                        index_position: 'secondary',
                        key_type: 'i64',
                        json: true,
                    })
                )
            );
            participationResults.forEach((r, i) => {
                if (r.status === 'fulfilled' && r.value.rows.length > 0) {
                    const roomId = String(replayCandidates[i].room_id);
                    if (!playerRoomIds.includes(roomId)) {
                        playerRoomIds.push(roomId);
                    }
                }
            });
        }

        const payload = { balances, myTickets, playerRoomIds };

        redisClient.setEx(cacheKey, LOBBY_ME_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
        res.status(200).json(payload);
    } catch (err) {
        logger.error({ err, tag: 'LobbyCtrl' }, 'Erro ao carregar dados do jogador');
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}
