// apps/worker-game-loop/src/services/invertedIndex.ts
// Construção e consulta do Índice Invertido Redis (SPEC.md §3.2).
//
// Estrutura:
//   Chave:   game:{game_id}:ball:{numero}
//   Valor:   JSON array de { ticket_id, bit_index }
//   TTL:     86400s (24h) — alinhado ao ciclo de vida do jogo
//
// Benefício: substitui o O(n) de get_table_rows paginado por
// O(1) por bola sorteada — crítico para rodadas com muitas cartelas.
//
// Fluxo:
//   1. lockgame → buildInvertedIndex(gameId) — constrói o índice em batch
//   2. startdraw → para cada bola em drawn_balls:
//      a. getTicketsForBall(gameId, ball) → lista de { ticket_id, bit_index }
//      b. Avalia cada ticket via bitmask
//   3. cleargame → deleteIndex(gameId) — remove o índice do Redis
//
// Ref: SPEC.md §3.2

import { redisClient }      from './redis';
import { rpcClient, parseHexBytes }        from '@cryptobingo/blockchain-core';
import { Name, UInt64 }                     from '@wharfkit/antelope';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

function normalizeTickets(rows: Record<string, any>[]): BlockchainTicketRecord[] {
    for (const row of rows) {
        if (typeof row.matrix === 'string') {
            row.matrix = parseHexBytes(row.matrix);
        }
    }
    return rows as unknown as BlockchainTicketRecord[];
}

const CONTRACT_ACCOUNT  = process.env.CONTRACT_ACCOUNT  || 'bingo.game';
const INDEX_TTL_SECONDS = 86_400; // 24h

// ==========================================
// TIPOS
// ==========================================

export interface BallEntry {
    ticket_id: string;  // uint64 como string
    bit_index: number;  // 0-24 (posição no bitmask da cartela)
}

// ==========================================
// HELPERS
// ==========================================

/** Chave Redis para uma bola de um jogo. */
function ballKey(gameId: string, ball: number): string {
    return `game:${gameId}:ball:${ball}`;
}

/** Chave Redis para o set de ticket_ids de um jogo (usado na varredura). */
function ticketSetKey(gameId: string): string {
    return `game:${gameId}:ticket_ids`;
}

/**
 * Mapeia cada número da matrix de uma cartela para seu bit_index no bitmask.
 *
 * Layout (coluna-maior):
 *   matrix[0-4]   = col B (bits 0-4)
 *   matrix[5-9]   = col I (bits 5-9)
 *   matrix[10-11] = col N rows 0-1 (bits 10-11)
 *   matrix[12-13] = col N rows 3-4 (bits 13-14)  ← pula bit 12 = FREE SPACE
 *   matrix[14-18] = col G (bits 15-19)
 *   matrix[19-23] = col O (bits 20-24)
 *
 * Ref: SPEC.md §1.3, evaluator.ts (mesmo mapeamento)
 */
function matrixToBitMap(matrix: number[]): Map<number, number> {
    const map = new Map<number, number>();
    for (let bitIndex = 0; bitIndex < 25; bitIndex++) {
        if (bitIndex === 12) continue; // FREE SPACE — sem número correspondente
        const matrixIdx = bitIndex < 12 ? bitIndex : bitIndex - 1;
        const ball = matrix[matrixIdx];
        if (ball !== undefined) {
            map.set(ball, bitIndex);
        }
    }
    return map;
}

// ==========================================
// API PÚBLICA
// ==========================================

/**
 * Constrói o índice invertido no Redis para um jogo.
 * Deve ser chamado após lockgame(), quando os tickets estão finalizados.
 *
 * Varre a tabela tickets on-chain em páginas de 100 e para cada cartela
 * mapeia cada número → bit_index no Redis.
 *
 * Complexidade: O(tickets × 24) no build, O(1) por bola na avaliação.
 */
export async function buildInvertedIndex(gameId: string): Promise<void> {
    console.log(`📇 [InvertedIndex] Construindo índice para jogo ${gameId}...`);

    let lowerBound: string | undefined;
    let hasMore     = true;
    let totalTickets = 0;
    const pipeline = redisClient.multi(); // Batch de comandos Redis

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       Name.from(UInt64.from(gameId)),
            table:       'tickets',
            limit:       100,
            lower_bound: lowerBound as any,
            json:        true,
        });

        const tickets = normalizeTickets(response.rows);

        for (const ticket of tickets) {
            const bitMap = matrixToBitMap(ticket.matrix);

            // Adiciona ticket_id ao set geral do jogo
            pipeline.sAdd(ticketSetKey(gameId), ticket.ticket_id);

            // Para cada (bola → bit_index), adiciona ao índice invertido
            for (const [ball, bitIndex] of bitMap) {
                const entry: BallEntry = { ticket_id: ticket.ticket_id, bit_index: bitIndex };
                pipeline.rPush(ballKey(gameId, ball), JSON.stringify(entry));
            }

            totalTickets++;
        }

        hasMore = response.more === true && tickets.length === 100;
        if (hasMore) {
            lowerBound = (BigInt(tickets[tickets.length - 1].ticket_id) + 1n).toString();
        }

        // Executa em batch a cada 100 tickets para não sobrecarregar a memória
        if (totalTickets % 100 === 0) {
            await pipeline.exec();
        }
    }

    // Executa o restante do pipeline
    await pipeline.exec();

    // Define TTL em todas as chaves criadas (SPEC.md §3.2 — 24h de vida)
    // Usa EXPIRE em batch
    const expirePipeline = redisClient.multi();
    expirePipeline.expire(ticketSetKey(gameId), INDEX_TTL_SECONDS);

    for (let ball = 1; ball <= 75; ball++) {
        expirePipeline.expire(ballKey(gameId, ball), INDEX_TTL_SECONDS);
    }
    await expirePipeline.exec();

    console.log(
        `✅ [InvertedIndex] Índice construído: ${totalTickets} cartelas, ` +
        `${totalTickets * 24} entradas no Redis (jogo ${gameId})`
    );
}

/**
 * Retorna todas as entradas { ticket_id, bit_index } para uma bola sorteada.
 * O(1) — leitura direta do índice Redis.
 */
export async function getTicketsForBall(gameId: string, ball: number): Promise<BallEntry[]> {
    try {
        const raw = await redisClient.lRange(ballKey(gameId, ball), 0, -1);
        return raw.map((s: string) => JSON.parse(s) as BallEntry);
    } catch (err) {
        console.warn(`[InvertedIndex] Fallback RPC para bola ${ball} (jogo ${gameId}):`, err);
        return []; // Caller deve fazer fallback para varredura RPC
    }
}

/**
 * Verifica se o índice existe para um jogo (útil para decidir o caminho de avaliação).
 */
export async function indexExists(gameId: string): Promise<boolean> {
    try {
        const count = await redisClient.sCard(ticketSetKey(gameId));
        return count > 0;
    } catch {
        return false;
    }
}

/**
 * Remove o índice do Redis após o cleargame().
 * Não é crítico — o TTL garante a expiração automática.
 * Chamada explícita para liberar memória mais rápido.
 */
export async function deleteIndex(gameId: string): Promise<void> {
    try {
        const pipeline = redisClient.multi();
        pipeline.del(ticketSetKey(gameId));
        for (let ball = 1; ball <= 75; ball++) {
            pipeline.del(ballKey(gameId, ball));
        }
        await pipeline.exec();
        console.log(`🗑️  [InvertedIndex] Índice removido para jogo ${gameId}`);
    } catch (err) {
        console.warn(`[InvertedIndex] Erro ao remover índice do jogo ${gameId}:`, err);
    }
}
