import { rpcClient } from '@cryptobingo/blockchain-core';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainRoom } from '@cryptobingo/shared-types';
import { contractSession, microserviceSession } from './blockchain';
import { connectRedis } from './redis';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingo.game';
const REDIS_ROOM_PREFIX = 'room:';

interface RoomConfig {
    roomId: string;
    autoStartDelaySec: number;
}

// ==========================================
// Busca sala on-chain por game_id
// ==========================================

export async function findRoomByGameId(gameId: string): Promise<BlockchainRoom | null> {
    try {
        const roomsResponse = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'rooms',
            limit: 100,
            json:  true,
        });

        const rooms = roomsResponse.rows as BlockchainRoom[];
        return rooms.find(r => String(r.current_game_id) === String(gameId)) ?? null;
    } catch (err) {
        console.error('[RoomManager] Erro ao buscar sala por game_id:', err);
        return null;
    }
}

// ==========================================
// Busca metadados da sala no MongoDB via API Gateway
// ==========================================

async function fetchRoomMetadata(roomId: string): Promise<RoomConfig | null> {
    try {
        const apiUrl = process.env.API_GATEWAY_URL || 'http://api-gateway:8080';
        const res = await fetch(`${apiUrl}/api/v1/rooms/${roomId}`);
        if (!res.ok) return null;
        const data = await res.json() as { metadata?: { auto_start_delay_sec?: number } };
        return {
            roomId,
            autoStartDelaySec: data.metadata?.auto_start_delay_sec ?? 30,
        };
    } catch {
        return { roomId, autoStartDelaySec: 30 };
    }
}

// ==========================================
// Gera um novo game_id (timestamp-based)
// ==========================================

function generateGameId(): string {
    return String(Date.now());
}

// ==========================================
// Cria e funde a próxima partida da sala
// ==========================================

export async function createNextGameForRoom(room: BlockchainRoom): Promise<string | null> {
    try {
        const config = await fetchRoomMetadata(room.room_id);
        const delayMs = (config?.autoStartDelaySec ?? 30) * 1000;

        console.log(`[RoomManager] Sala ${room.room_id}: aguardando ${delayMs}ms para criar próxima partida...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Verifica se a sala ainda está ativa
        const freshRoom = await fetchRoomOnChain(room.room_id);
        if (!freshRoom || freshRoom.status !== 'active') {
            console.log(`[RoomManager] Sala ${room.room_id} não está mais ativa (status: ${freshRoom?.status}). Pulando.`);
            return null;
        }

        const newGameId = generateGameId();

        // Cria o jogo (requer bingo.game@active)
        console.log(`[RoomManager] Sala ${room.room_id}: criando game ${newGameId}...`);
        const createResult = await contractSession.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'creategame',
                authorization: [contractSession.permissionLevel],
                data: {
                    game_id:      newGameId,
                    ticket_price: {
                        quantity: room.ticket_price_default.quantity,
                        contract: room.ticket_price_default.contract,
                    },
                    gametype_id: room.gametype_id,
                    room_id:     room.room_id,
                },
            }],
        }, { broadcast: true });
        console.log(`✅ Game ${newGameId} criado. TX: ${createResult.response?.transaction_id}`);

        // Funde o jogo (CREATED → FUNDING) — requer microservice@active
        const fundResult = await microserviceSession.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'fundgame',
                authorization: [microserviceSession.permissionLevel],
                data:          { game_id: newGameId },
            }],
        }, { broadcast: true });
        console.log(`✅ Game ${newGameId} aberto para vendas. TX: ${fundResult.response?.transaction_id}`);

        return newGameId;
    } catch (err) {
        console.error(`[RoomManager] Erro ao criar próximo jogo para sala ${room.room_id}:`, err);
        return null;
    }
}

// ==========================================
// Busca sala on-chain por room_id
// ==========================================

async function fetchRoomOnChain(roomId: string): Promise<BlockchainRoom | null> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'rooms',
            lower_bound: UInt64.from(roomId),
            upper_bound: UInt64.from(roomId),
            limit:       1,
            json:        true,
        });
        return (res.rows[0] as BlockchainRoom) ?? null;
    } catch {
        return null;
    }
}

// ==========================================
// Handler principal — chamado após game resolvido (ARCHIVED ou ABORTED)
// ==========================================

// ==========================================
// Polling: cria primeiro jogo para salas ativas sem jogo atual
// ==========================================

export async function ensureFirstGameForActiveRooms(): Promise<void> {
    try {
        const roomsResponse = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'rooms',
            limit: 100,
            json:  true,
        });
        const rooms = roomsResponse.rows as BlockchainRoom[];
        for (const room of rooms) {
            if (room.status === 'active' && String(room.current_game_id) === '0') {
                console.log(`[RoomManager] Sala ${room.room_id} ativa sem jogo atual. Criando primeiro jogo...`);
                await createNextGameForRoom(room);
            }
        }
    } catch (err) {
        console.error('[RoomManager] Erro no polling de primeira partida:', err);
    }
}

export async function onGameResolved(gameId: string): Promise<void> {
    console.log(`[RoomManager] Game ${gameId} resolvido. Verificando se pertence a uma sala...`);

    const room = await findRoomByGameId(gameId);
    if (!room) {
        console.log(`[RoomManager] Game ${gameId} não pertence a nenhuma sala. Nenhuma ação.`);
        return;
    }

    console.log(`[RoomManager] Game ${gameId} pertence à sala ${room.room_id} (status: ${room.status})`);

    if (room.status !== 'active') {
        console.log(`[RoomManager] Sala ${room.room_id} não está ativa. Não criará nova partida.`);
        return;
    }

    await createNextGameForRoom(room);
}
