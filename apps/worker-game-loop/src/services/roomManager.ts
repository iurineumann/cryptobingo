import { rpcClient, fetchGame } from '@cryptobingo/blockchain-core';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainRoom } from '@cryptobingo/shared-types';
import { adminSession, microserviceSession } from './blockchain';
import { processRoomDrops } from './dropWorker';
import { logger } from './logger';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
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
        logger.error({ err, tag: 'RoomManager' }, 'Erro ao buscar sala por game_id:')
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

        logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: aguardando ${delayMs}ms para criar próxima partida...`)
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Verifica se a sala ainda está ativa e sem jogo (previne duplicatas)
        const freshRoom = await fetchRoomOnChain(room.room_id);
        if (freshRoom?.status !== 'active') {
            logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id} não está mais ativa (status: ${freshRoom?.status}). Pulando.`)
            return null;
        }
        if (String(freshRoom.current_game_id) !== '0') {
            // Verifica se o jogo existente está ativo ou já terminal
            const existingGame = await fetchGame(String(freshRoom.current_game_id)).catch(() => null);
            if (!existingGame || !['archived', 'aborted'].includes(existingGame.status)) {
                logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: jogo ${freshRoom.current_game_id} já criado durante o delay. Pulando.`)
                return null;
            }
            // Jogo terminal — slot não foi zerado (legado). Não criamos duplicata.
            logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: current_game_id aponta para jogo terminal — slot já deve ter sido liberado.`)
        }

        const newGameId = generateGameId();

        // Cria o jogo (requer bingogamectr@active)
        logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: criando game ${newGameId}...`)
        const createResult = await adminSession.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'creategame',
                authorization: [adminSession.permissionLevel],
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
        logger.info(`Game ${newGameId} criado. TX: ${createResult.response?.transaction_id}`);

        // Funde o jogo (CREATED → FUNDING) — requer bingogamesvc@active
        const fundResult = await microserviceSession.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'fundgame',
                authorization: [microserviceSession.permissionLevel],
                data:          { game_id: newGameId },
            }],
        }, { broadcast: true });
        logger.info(`Game ${newGameId} aberto para vendas. TX: ${fundResult.response?.transaction_id}`);

        return newGameId;
    } catch (err) {
        logger.error({ err, tag: 'RoomManager' }, `Erro ao criar próximo jogo para sala ${room.room_id}:`)
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
            if (room.status !== 'active') continue;

            const gameId = String(room.current_game_id);

            if (gameId === '0') {
                // Sem jogo — cria o próximo
                logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id} ativa sem jogo. Criando...`)
                await createNextGameForRoom(room);
                continue;
            }

            // Tem game_id mas pode ser um jogo terminal — current_game_id não foi zerado.
            // closegame só aceita PAYING/DRAWN/ARCHIVED; aborted é zerado pelo próprio
            // abortgame (estado legado se transição ocorreu antes do fix). Para aborted,
            // skip — o autoLock irá resolver via abortgame que zera current_game_id.
            const existingGame = await fetchGame(gameId).catch(() => null);
            if (existingGame?.status === 'archived') {
                logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: recovery — jogo ${gameId} é archived mas current_game_id não foi zerado. Liberando slot via closegame...`)
                try {
                    await microserviceSession.transact({
                        actions: [{
                            account:       CONTRACT_ACCOUNT,
                            name:          'closegame',
                            authorization: [microserviceSession.permissionLevel],
                            data:          { game_id: gameId },
                        }],
                    }, { broadcast: true });
                    logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: current_game_id zerado via closegame.`)
                } catch (err) {
                    logger.warn({ tag: 'RoomManager' }, `Sala ${room.room_id}: closegame recovery falhou:`)
                    return; // sem closegame bem-sucedido não criamos novo jogo
                }
                await createNextGameForRoom(room);
            } else if (existingGame?.status === 'aborted') {
                // abortgame já deveria ter zerado current_game_id; estado transitório.
                // Aguarda o próximo ciclo de polling — não chama closegame (ação inválida).
                logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: jogo ${gameId} aborted — aguardando zeramento via abortgame no próximo ciclo.`)
            }
        }
    } catch (err) {
        logger.error({ err, tag: 'RoomManager' }, 'Erro no polling de primeira partida:')
    }
}

export async function onGameResolved(gameId: string): Promise<void> {
    logger.info({ tag: 'RoomManager' }, `Game ${gameId} resolvido. Verificando sala...`)

    // Lê room_id diretamente do jogo arquivado — current_game_id da sala já foi zerado pelo closegame
    const game = await fetchGame(gameId).catch(() => null);
    const roomId = game ? String((game as any).room_id ?? '0') : '0';

    if (!roomId || roomId === '0') {
        logger.info({ tag: 'RoomManager' }, `Game ${gameId} não pertence a nenhuma sala. Nenhuma ação.`)
        return;
    }

    logger.info({ tag: 'RoomManager' }, `Game ${gameId} pertence à sala ${roomId}.`)

    const room = await fetchRoomOnChain(roomId);
    if (!room) {
        logger.info({ tag: 'RoomManager' }, `Sala ${roomId} não encontrada on-chain.`)
        return;
    }
    if (room.status !== 'active') {
        logger.info({ tag: 'RoomManager' }, `Sala ${roomId} não está ativa (status: ${room.status}). Não criará nova partida.`)
        return;
    }

    await createNextGameForRoom(room);

    processRoomDrops(gameId, roomId).catch(err =>
        logger.error({ err, tag: 'RoomManager' }, `Erro no dropWorker para jogo ${gameId}:`)
    );
}
