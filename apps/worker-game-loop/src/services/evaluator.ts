import { fetchGame, fetchPlayerTickets, rpcClient } from '@cryptobingo/blockchain-core';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';
import { executeClaimWin } from './blockchain';

// ==========================================
// CONSTANTES DE PADRÕES DE VITÓRIA (Bitmasking)
//
// Cada máscara representa os índices de bit (0-24) que formam
// um padrão de vitória na cartela 5x5.
//
// Layout da cartela (bit index):
//   Col:  B    I    N    G    O
//  Row0: [0]  [5]  [10] [15] [20]
//  Row1: [1]  [6]  [11] [16] [21]
//  Row2: [2]  [7] [12*] [17] [22]   (* FREE SPACE, sempre setado)
//  Row3: [3]  [8]  [13] [18] [23]
//  Row4: [4]  [9]  [14] [19] [24]
//
// Fórmula: M = SUM(2^p) para cada posição p no padrão.
// Os valores são bigint para compatibilidade com uint64 do contrato Antelope.
// ==========================================

export const WIN_PATTERNS: Record<string, bigint> = {
    // Linhas horizontais
    ROW_0: BigInt((1<<0)|(1<<5)|(1<<10)|(1<<15)|(1<<20)),
    ROW_1: BigInt((1<<1)|(1<<6)|(1<<11)|(1<<16)|(1<<21)),
    ROW_2: BigInt((1<<2)|(1<<7)|(1<<12)|(1<<17)|(1<<22)), // Inclui FREE SPACE
    ROW_3: BigInt((1<<3)|(1<<8)|(1<<13)|(1<<18)|(1<<23)),
    ROW_4: BigInt((1<<4)|(1<<9)|(1<<14)|(1<<19)|(1<<24)),

    // Colunas verticais
    COL_B: BigInt((1<<0)|(1<<1)|(1<<2)|(1<<3)|(1<<4)),
    COL_I: BigInt((1<<5)|(1<<6)|(1<<7)|(1<<8)|(1<<9)),
    COL_N: BigInt((1<<10)|(1<<11)|(1<<12)|(1<<13)|(1<<14)), // Inclui FREE SPACE
    COL_G: BigInt((1<<15)|(1<<16)|(1<<17)|(1<<18)|(1<<19)),
    COL_O: BigInt((1<<20)|(1<<21)|(1<<22)|(1<<23)|(1<<24)),

    // Diagonais
    DIAG_TL_BR: BigInt((1<<0)|(1<<6)|(1<<12)|(1<<18)|(1<<24)),  // Inclui FREE SPACE
    DIAG_TR_BL: BigInt((1<<4)|(1<<8)|(1<<12)|(1<<16)|(1<<20)),  // Inclui FREE SPACE
};

// ==========================================
// INTERFACE DE RESULTADO DE VITÓRIA
// ==========================================

export interface WinResult {
    ticket: BlockchainTicketRecord;
    patternName: string;
    patternMask: bigint;
}

// ==========================================
// FUNÇÕES PURAS — TESTÁVEIS ISOLADAMENTE
// ==========================================

/**
 * Verifica se um bitmask de estado de cartela satisfaz algum padrão de vitória.
 *
 * @param state - O uint32 bitmask atual da cartela (lido diretamente do contrato).
 * @returns O resultado da vitória com nome e máscara, ou null se não houver vitória.
 */
export function checkWinPattern(state: number): { patternName: string; patternMask: bigint } | null {
    const stateBig = BigInt(state);
    for (const [patternName, mask] of Object.entries(WIN_PATTERNS)) {
        if ((stateBig & mask) === mask) {
            return { patternName, patternMask: mask };
        }
    }
    return null;
}

/**
 * Aplica as bolas sorteadas a uma cartela e retorna o novo estado bitmask.
 *
 * @param ticket     - A cartela com seu estado atual e matriz de números.
 * @param drawnBalls - Array de números sorteados (valores de 1 a 75).
 * @returns O novo state uint32 após aplicar as bolas sorteadas.
 *
 * ATENÇÃO: A `matrix` da cartela tem 24 posições (pula o índice 12 = FREE SPACE).
 * O mapeamento correto entre índice de bit e posição da matrix é:
 *   bit_index [0-11]  -> matrix[bit_index]
 *   bit_index [12]    -> FREE SPACE (sempre setado, não presente na matrix)
 *   bit_index [13-24] -> matrix[bit_index - 1]
 */
export function applyDrawnBalls(ticket: BlockchainTicketRecord, drawnBalls: number[]): number {
    const drawnSet = new Set(drawnBalls);
    let state = ticket.state; // Estado persistido no contrato (inicia em 0x00001000)

    for (let bitIndex = 0; bitIndex < 25; bitIndex++) {
        if (bitIndex === 12) continue; // FREE SPACE: já setado, pula

        const matrixIndex = bitIndex < 12 ? bitIndex : bitIndex - 1;
        const ballNumber = ticket.matrix[matrixIndex];

        if (ballNumber !== undefined && drawnSet.has(ballNumber)) {
            state |= (1 << bitIndex);
        }
    }

    return state;
}

// ==========================================
// FUNÇÕES DE VARREDURA — CONSUMIDAS PELO RABBITMQ
// ==========================================

/**
 * Varre TODOS os tickets de um jogo e retorna os vencedores.
 *
 * Usa paginação via `get_table_rows` para suportar jogos com muitas cartelas
 * sem explodir o heap do processo Node.js.
 *
 * @param gameId     - ID do jogo a ser varrido.
 * @param drawnBalls - Array de bolas sorteadas (do campo `drawn_balls` do jogo).
 * @returns Lista de WinResult para todos os tickets vencedores encontrados.
 */
export async function findAllWinners(
    gameId: string,
    drawnBalls: number[]
): Promise<WinResult[]> {
    const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingo.game';
    const winners: WinResult[] = [];
    let lowerBound: string | undefined = undefined;
    let hasMore = true;
    const PAGE_SIZE = 100;

    // Paginação: itera todos os tickets do jogo em lotes de 100
    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT,
            scope: gameId,
            table: 'tickets',
            limit: PAGE_SIZE,
            lower_bound: lowerBound,
            json: true,
        });

        const tickets = response.rows as BlockchainTicketRecord[];

        for (const ticket of tickets) {
            const finalState = applyDrawnBalls(ticket, drawnBalls);
            const winResult = checkWinPattern(finalState);

            if (winResult) {
                winners.push({ ticket, ...winResult });
            }
        }

        hasMore = response.more === true && tickets.length === PAGE_SIZE;
        if (hasMore && tickets.length > 0) {
            // Avança o cursor para o próximo ticket após o último lido
            const lastTicketId = tickets[tickets.length - 1].ticket_id;
            lowerBound = (BigInt(lastTicketId) + 1n).toString();
        }
    }

    return winners;
}

/**
 * Motor de resolução completo: lê o jogo, varre todos os tickets,
 * e submete claimwin para cada vencedor encontrado.
 *
 * Invocado pelo consumidor RabbitMQ ao receber a action 'claimwin'.
 *
 * @param gameId - O ID do jogo a ser resolvido.
 */
export async function processAllGameWinners(gameId: string): Promise<void> {
    console.log(`\n🧠 [Avaliador] Iniciando resolução do jogo ${gameId}...`);

    const game = await fetchGame(gameId);

    if (!game) {
        throw new Error(`[Avaliador] Jogo ${gameId} não encontrado no contrato.`);
    }

    if (game.status !== 'drawn') {
        // Estado inválido: não deveria chegar aqui, mas protegemos contra race condition
        throw new Error(
            `[Avaliador] Jogo ${gameId} não está em estado 'drawn'. Status atual: ${game.status}`
        );
    }

    console.log(`🔍 [Avaliador] Varrendo todos os tickets do jogo ${gameId}...`);
    const winners = await findAllWinners(gameId, game.drawn_balls);

    if (winners.length === 0) {
        console.log(`😔 [Avaliador] Nenhum vencedor encontrado no jogo ${gameId}.`);
        return;
    }

    console.log(`🎉 [Avaliador] ${winners.length} vencedor(es) encontrado(s) no jogo ${gameId}!`);

    // Liquida cada vencedor sequencialmente para evitar conflitos de estado no contrato
    // (o contrato muda o status para 'archived' no primeiro claimwin bem-sucedido)
    for (const { ticket, patternName, patternMask } of winners) {
        console.log(
            `🏆 [Avaliador] Liquidando cartela #${ticket.ticket_id} ` +
            `(owner: ${ticket.owner}, padrão: ${patternName})...`
        );
        await executeClaimWin(
            gameId,
            ticket.ticket_id,
            game.drawn_balls.length,
            patternMask
        );
    }

    console.log(`✅ [Avaliador] Resolução do jogo ${gameId} concluída.`);
}

/**
 * Motor de varredura por jogador: mantido para uso pelo api-gateway
 * (ex: endpoint de consulta de histórico de um jogador específico).
 *
 * NÃO é chamado pelo worker de resolução automática.
 *
 * @param gameId       - O ID do jogo a ser avaliado.
 * @param playerWallet - A conta Antelope do jogador (ex: "jogador1").
 */
export async function processGameWinners(gameId: string, playerWallet: string): Promise<void> {
    console.log(`\n🧠 [Avaliador] Auditoria do jogo ${gameId} para ${playerWallet}...`);

    const game = await fetchGame(gameId);

    if (!game) {
        throw new Error(`Jogo ${gameId} não encontrado no contrato.`);
    }

    if (game.status !== 'drawn') {
        console.log(`⚠️ [Avaliador] Jogo ${gameId} não foi sorteado. Status: ${game.status}`);
        return;
    }

    const tickets = await fetchPlayerTickets(gameId, playerWallet);

    if (tickets.length === 0) {
        console.log(`ℹ️ [Avaliador] ${playerWallet} não tem cartelas neste jogo.`);
        return;
    }

    const winningTickets: WinResult[] = [];

    for (const ticket of tickets) {
        const finalState = applyDrawnBalls(ticket, game.drawn_balls);
        const winResult = checkWinPattern(finalState);
        if (winResult) {
            winningTickets.push({ ticket, ...winResult });
        }
    }

    if (winningTickets.length === 0) {
        console.log(`😔 [Avaliador] Nenhuma cartela premiada para ${playerWallet}.`);
        return;
    }

    console.log(`🎉 [Avaliador] BINGO! ${playerWallet} tem ${winningTickets.length} cartela(s) premiada(s)!`);

    for (const { ticket, patternName, patternMask } of winningTickets) {
        console.log(`🏆 [Avaliador] Cartela #${ticket.ticket_id} venceu com padrão: ${patternName}`);
        await executeClaimWin(
            gameId,
            ticket.ticket_id,
            game.drawn_balls.length,
            patternMask
        );
        console.log(`💸 [Avaliador] Pagamento liquidado para cartela #${ticket.ticket_id}`);
    }
}
