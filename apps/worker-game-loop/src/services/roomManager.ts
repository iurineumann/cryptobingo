import { rpcClient, fetchGame } from '@cryptobingo/blockchain-core';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainRoom } from '@cryptobingo/shared-types';
import { adminSession, microserviceSession } from './blockchain';
import { processRoomDrops } from './dropWorker';
import { logger } from './logger';
import { publishGameEvent } from './rabbitPublisher';
import { isResourceExhausted, resRetryMap, handleResourceBackoff } from './retryBackoff';
import { recoverCloseFailTotal } from './metrics';

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

        // Aguarda confirmacao on-chain antes de fundgame (previne race "Game not found")
        for (let attempt = 0; attempt < 10; attempt++) {
            const created = await fetchGame(newGameId).catch(() => null);
            if (created) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        // Funde o jogo (CREATED → FUNDING) via fila — publishGameEvent em vez de transact direto.
        // O consumer `fundgame` na fila `game_loop_events` executa o fundgame async.
        // Caller tolera CREATED→FUNDING assíncrono.
        await publishGameEvent('game_loop_events', 'fundgame', { gameId: newGameId });
        logger.info(`Game ${newGameId} aberto para vendas via fila.`);

        return newGameId;
    } catch (err: any) {
        const roomKey = `room:${room.room_id}`;
        if (isResourceExhausted(err)) {
            handleResourceBackoff(roomKey, 'RoomManager', `sala ${room.room_id}`);
        } else {
            logger.error({ err, tag: 'RoomManager', errMsg: err?.message, errCode: err?.code },
                `Sala ${room.room_id}: erro ao criar/próximo jogo (creategame ou fundgame falhou).`)
        }
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

const FUND_RETRY_MAX = 6;
const FUND_RETRY_BACKOFF_BASE_MS = 60_000;
const FUND_RETRY_BACKOFF_MAX_MS = 1_800_000;
const fundRetryMap = new Map<string, { count: number; lastAttempt: number }>();

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
                let closed = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await microserviceSession.transact({
                            actions: [{
                                account:       CONTRACT_ACCOUNT,
                                name:          'closegame',
                                authorization: [microserviceSession.permissionLevel],
                                data:          { game_id: gameId },
                            }],
                        }, { broadcast: true });
                        logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: current_game_id zerado via closegame (tentativa ${attempt}).`);
                        closed = true;
                        break;
                    } catch (err) {
                        logger.error({ err, tag: 'RoomManager', attempt },
                            `Sala ${room.room_id}: closegame recovery falhou (tentativa ${attempt}/3) p/ game ${gameId}.`);
                        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
                    }
                }
                if (!closed) {
                    recoverCloseFailTotal.inc({ room_id: String(room.room_id) });
                    logger.error({ tag: 'RoomManager' }, `Sala ${room.room_id}: closegame recovery ESGOtou 3 tentativas p/ game ${gameId}. Ação manual necessária.`);
                    return; // sem closegame bem-sucedido não criamos novo jogo
                }
                await createNextGameForRoom(room);
            } else if (existingGame?.status === 'aborted') {
                // abortgame já deveria ter zerado current_game_id; estado transitório.
                // Aguarda o próximo ciclo de polling — não chama closegame (ação inválida).
                logger.info({ tag: 'RoomManager' }, `Sala ${room.room_id}: jogo ${gameId} aborted — aguardando zeramento via abortgame no próximo ciclo.`)
            } else if (existingGame?.status === 'created') {
                await recoverCreatedGame(room, gameId);
            }
        }
    } catch (err) {
        logger.error({ err, tag: 'RoomManager' }, 'Erro no polling de primeira partida:')
    }
}

async function recoverCreatedGame(room: BlockchainRoom, gameId: string): Promise<void> {
    const current = await fetchGame(gameId).catch(() => null);
    if (current?.status && current.status !== 'created') {
        logger.info({ tag: 'RoomManager' },
            `recoverCreatedGame ${gameId}: jogo em "${current.status}", nao republica fundgame.`);
        fundRetryMap.delete(gameId);
        return;
    }
    const retry = fundRetryMap.get(gameId) || { count: 0, lastAttempt: 0 };

    if (retry.count >= FUND_RETRY_MAX) {
        logger.warn({ tag: 'RoomManager' },
            `Sala ${room.room_id}: max retries (${FUND_RETRY_MAX}) alcancado p/ game ${gameId}. Abortando...`);
        try {
            await microserviceSession.transact({
                actions: [{
                    account:       CONTRACT_ACCOUNT,
                    name:          'abortgame',
                    authorization: [microserviceSession.permissionLevel],
                    data:          { game_id: gameId, reason: 'fund retry exhausted' },
                }],
            }, { broadcast: true });
            logger.info({ tag: 'RoomManager' }, `Game ${gameId} abortado apos ${FUND_RETRY_MAX} tentativas de fundgame.`)
        } catch (abortErr: any) {
            logger.error({ err: abortErr, tag: 'RoomManager' },
                `Sala ${room.room_id}: abortgame falhou p/ game ${gameId} (contrato pode nao aceitar created ainda).`);
        }
        fundRetryMap.delete(gameId);
        return;
    }

    const backoff = Math.min(
        FUND_RETRY_BACKOFF_BASE_MS * Math.pow(2, retry.count),
        FUND_RETRY_BACKOFF_MAX_MS,
    );
    const elapsed = Date.now() - retry.lastAttempt;
    if (elapsed < backoff) {
        logger.debug({ tag: 'RoomManager' },
            `Sala ${room.room_id}: aguardando backoff ${Math.round((backoff - elapsed) / 1000)}s p/ fundgame ${gameId} (tentativa ${retry.count + 1}/${FUND_RETRY_MAX}).`);
        return;
    }

    try {
        logger.info({ tag: 'RoomManager' },
            `Sala ${room.room_id}: tentando fundgame p/ game ${gameId} (tentativa ${retry.count + 1}/${FUND_RETRY_MAX})...`);
        // FIX #384: publica na fila em vez de transactar direto. A fila é a ÚNICA
        // via de execução de fundgame (createNextGameForRoom também publica lá),
        // e o consumer é idempotente (rabbitmq.ts:271). Isso elimina a dupla fonte
        // que gerava "Game is not in CREATED status" / "duplicate transaction".
        await publishGameEvent('game_loop_events', 'fundgame', { gameId });
        logger.info({ tag: 'RoomManager' }, `Game ${gameId} fundado via fila (aguardando consumer).`);
        fundRetryMap.delete(gameId);
    } catch (fundErr: any) {
        retry.count++;
        retry.lastAttempt = Date.now();
        fundRetryMap.set(gameId, retry);
        logger.error({ err: fundErr, tag: 'RoomManager', retry: retry.count, maxRetries: FUND_RETRY_MAX },
            `Sala ${room.room_id}: publish fundgame falhou (${retry.count}/${FUND_RETRY_MAX}) p/ game ${gameId}. ${fundErr?.message || ''}`);
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
