import { rpcClient } from '@cryptobingo/blockchain-core';
import {
    BlockchainDropAllocation,
    BlockchainDropDeposit,
    BlockchainDropState,
} from '@cryptobingo/shared-types';
import { UInt64 } from '@wharfkit/antelope';
import crypto from 'crypto';
import { Pool } from 'pg';
import { microserviceSession } from './blockchain';
import { io as wsIo } from './broadcaster';
import { redisClient } from './redis';

const chatNs = () => wsIo.of('/chat');

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const DROP_PROCESS_TTL_SEC = parseInt(process.env.DROP_PROCESS_TTL_SEC || '300', 10);
const LOCK_PREFIX = 'drop:lock:';

let pgPool: Pool | null = null;
function getPgPool(): Pool {
    if (!pgPool) {
        pgPool = new Pool({ connectionString: process.env.POSTGRES_URL });
    }
    return pgPool;
}

async function acquireDropLock(gameId: string): Promise<boolean> {
    if (!redisClient.isOpen) return true;
    const key = `${LOCK_PREFIX}${gameId}`;
    try {
        const result = await redisClient.set(key, '1', { NX: true, EX: DROP_PROCESS_TTL_SEC });
        return result === 'OK';
    } catch {
        return true;
    }
}

type DropAllocationRow = BlockchainDropAllocation;
type DropDepositRow    = BlockchainDropDeposit;
type DropStateRow      = Pick<BlockchainDropState, 'player_base_chance_bps'>;

interface RoomRow {
    room_id: string;
    room_drop_chance_bps: number;
}

export function randomInt(max: number): number {
    return crypto.randomInt(0, max);
}

export function fisherYatesShuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

async function fetchActiveAllocations(roomId: string): Promise<DropAllocationRow[]> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'dropallocs',
        limit: 100,
        json: true,
    });
    const all = response.rows as DropAllocationRow[];
    return all.filter(a => a.room_id === roomId && a.status === 'active');
}

async function fetchGameWinners(gameId: string): Promise<Array<{ wallet: string; winningTicketsCount: number }>> {
    const pool = getPgPool();
    const result = await pool.query(
        `SELECT wallet_address, COUNT(*)::int AS winning_tickets_count
         FROM transactions_ledger
         WHERE game_id = $1 AND action_type = 'claim_win'
         GROUP BY wallet_address`,
        [gameId]
    );
    return result.rows.map(r => ({
        wallet: r.wallet_address,
        winningTicketsCount: r.winning_tickets_count,
    }));
}

async function fetchPlayerBaseChance(): Promise<number> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'dropstate',
            limit: 1,
            json: true,
        });
        if (res.rows.length) {
            return (res.rows[0] as DropStateRow).player_base_chance_bps ?? 5000;
        }
    } catch { /* default */ }
    return 5000;
}

async function fetchRoomDropChance(roomId: string): Promise<number> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'rooms',
            lower_bound: UInt64.from(roomId),
            upper_bound: UInt64.from(roomId),
            limit: 1,
            json: true,
        });
        if (res.rows.length) {
            return (res.rows[0] as RoomRow).room_drop_chance_bps ?? 10000;
        }
    } catch { /* default */ }
    return 10000;
}

async function fetchDeposit(depositId: string): Promise<DropDepositRow | null> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'dropdeposits',
            lower_bound: UInt64.from(depositId),
            upper_bound: UInt64.from(depositId),
            limit: 1,
            json: true,
        });
        return res.rows[0] as DropDepositRow ?? null;
    } catch {
        return null;
    }
}

export function hasSufficientBalance(dep: DropDepositRow, alloc: DropAllocationRow): boolean {
    const remaining = parseFloat(dep.quantity_remaining.quantity.split(' ')[0]) || 0;
    const needed = parseFloat(alloc.quantity_per_drop.quantity.split(' ')[0]) || 0;
    return remaining >= needed;
}

async function fase2SelecionarJogador(
    gameId: string,
    playerBaseChanceBps: number,
): Promise<string | null> {
    const winners = await fetchGameWinners(gameId);
    if (winners.length === 0) return null;

    const pool: string[] = [];
    for (const w of winners) {
        for (let i = 0; i < w.winningTicketsCount; i++) {
            pool.push(w.wallet);
        }
    }

    const shuffled = fisherYatesShuffle(pool);

    for (const wallet of shuffled) {
        if (randomInt(10000) < playerBaseChanceBps) {
            return wallet;
        }
    }
    return null;
}

async function executeDrop(
    alloc: DropAllocationRow,
    gameId: string,
    roomId: string,
    winner: string,
): Promise<void> {
    console.log(`[DropWorker] Executando drop — alloc #${alloc.alloc_id}, vencedor: ${winner}`);

    const quantity = alloc.asset_type === 'token'
        ? { quantity: alloc.quantity_per_drop.quantity, contract: alloc.token_contract }
        : { quantity: '0 NFT', contract: 'atomicassets' };

    try {
        const result = await microserviceSession.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'execdrop',
                authorization: [microserviceSession.permissionLevel],
                data: { alloc_id: alloc.alloc_id, winner, quantity },
            }],
        }, { broadcast: true });

        console.log(`✅ Drop executado — alloc #${alloc.alloc_id} → ${winner}. TX: ${result.response?.transaction_id}`);

        const eventPayload: Record<string, unknown> = {
            type:       alloc.asset_type,
            winner:     winner.slice(0, 8) + '...' + winner.slice(-4),
            room_id:    roomId,
            game_id:    gameId,
            alloc_id:   parseInt(alloc.alloc_id, 10),
        };

        if (alloc.asset_type === 'token') {
            eventPayload.quantity   = alloc.quantity_per_drop.quantity;
            eventPayload.asset_name = alloc.token_symbol;
        } else {
            eventPayload.asset_name = `NFT #${alloc.nft_asset_id}`;
        }

        chatNs().to(roomId).emit('chat:sponsor_drop', eventPayload);

    } catch (err) {
        console.error(`[DropWorker] Erro ao executar drop alloc #${alloc.alloc_id}:`, err);
    }
}

export async function processRoomDrops(gameId: string, roomId: string): Promise<void> {
    console.log(`\n🎁 [DropWorker] Processando drops — sala ${roomId}, jogo ${gameId}`);

    const acquired = await acquireDropLock(gameId);
    if (!acquired) {
        console.log(`[DropWorker] Jogo ${gameId} já está sendo processado (lock Redis). Pulando.`);
        return;
    }

    const roomDropChanceBps = await fetchRoomDropChance(roomId);
    if (randomInt(10000) >= roomDropChanceBps) {
        console.log(`[DropWorker] Fase 0: sala ${roomId} falhou no pré-check (${roomDropChanceBps} bps).`);
        return;
    }
    console.log(`[DropWorker] Fase 0: sala ${roomId} passou no pré-check (${roomDropChanceBps} bps).`);

    const allocations = await fetchActiveAllocations(roomId);
    if (allocations.length === 0) {
        console.log(`[DropWorker] Sala ${roomId}: sem alocações ativas.`);
        return;
    }

    const nftAllocs   = allocations.filter(a => a.asset_type === 'nft');
    const tokenAllocs = allocations.filter(a => a.asset_type === 'token');

    console.log(`[DropWorker] Alocações: ${nftAllocs.length} NFT(s), ${tokenAllocs.length} token(s).`);

    let electedNft: DropAllocationRow | null = null;

    if (nftAllocs.length > 0) {
        const sorted = [...nftAllocs].sort((a, b) => b.drop_chance_bps - a.drop_chance_bps);

        for (const alloc of sorted) {
            if (randomInt(10000) < alloc.drop_chance_bps) {
                electedNft = alloc;
                console.log(`[DropWorker] Fase 1A: NFT eleita — alloc #${alloc.alloc_id} (${alloc.drop_chance_bps} bps)`);
                break;
            }
        }

        if (!electedNft) {
            console.log(`[DropWorker] Fase 1A: nenhuma NFT eleita (${nftAllocs.length} testada(s)).`);
        }
    }

    const electedTokens: DropAllocationRow[] = [];

    if (tokenAllocs.length > 0) {
        const bySymbol = new Map<string, DropAllocationRow[]>();
        for (const alloc of tokenAllocs) {
            const sym = alloc.token_symbol;
            if (!bySymbol.has(sym)) bySymbol.set(sym, []);
            bySymbol.get(sym)!.push(alloc);
        }

        for (const [symbol, allocs] of bySymbol) {
            allocs.sort((a, b) => a.allocated_at - b.allocated_at);

            for (const alloc of allocs) {
                const dep = await fetchDeposit(alloc.deposit_id);
                if (!dep || !hasSufficientBalance(dep, alloc)) {
                    console.log(`[DropWorker] Fase 1B: token ${symbol} alloc #${alloc.alloc_id} — saldo insuficiente.`);
                    continue;
                }

                if (randomInt(10000) < alloc.drop_chance_bps) {
                    electedTokens.push(alloc);
                    console.log(`[DropWorker] Fase 1B: token eleito — alloc #${alloc.alloc_id} (${symbol}, ${alloc.drop_chance_bps} bps)`);
                    break;
                }
            }
        }

        console.log(`[DropWorker] Fase 1B: ${electedTokens.length} token(s) eleito(s) de ${bySymbol.size} símbolo(s).`);
    }

    if (!electedNft && electedTokens.length === 0) {
        console.log(`[DropWorker] Nenhum ativo eleito para drops no jogo ${gameId}.`);
        return;
    }

    const playerBaseChanceBps = await fetchPlayerBaseChance();

    if (electedNft) {
        const winner = await fase2SelecionarJogador(gameId, playerBaseChanceBps);
        if (winner) {
            await executeDrop(electedNft, gameId, roomId, winner);
        } else {
            console.log(`[DropWorker] Fase 2: nenhum jogador selecionado para NFT alloc #${electedNft.alloc_id}.`);
        }
    }

    for (const alloc of electedTokens) {
        const winner = await fase2SelecionarJogador(gameId, playerBaseChanceBps);
        if (winner) {
            await executeDrop(alloc, gameId, roomId, winner);
        } else {
            console.log(`[DropWorker] Fase 2: nenhum jogador selecionado para token alloc #${alloc.alloc_id}.`);
        }
    }

    console.log(`✅ [DropWorker] Drops processados para sala ${roomId}, jogo ${gameId}.`);
}
