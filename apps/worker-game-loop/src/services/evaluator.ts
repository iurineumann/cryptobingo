// apps/worker-game-loop/src/services/evaluator.ts
// Motor de avaliação de cartelas vencedoras.
//
// ADR-004 Fase 2: Quando o jogo tem gametype_id > 0, os padrões e pesos
// são buscados on-chain da tabela `patterns`/`gametypes`. Caso contrário,
// usa as 12 máscaras estáticas compiladas (modo legado).
//
// ADR-005 Fase 2: checkWinPatterns (plural) retorna TODOS os padrões
// vencedores de uma cartela. O worker seleciona o de maior weight (max_weight)
// antes de enviar claimwin — conforme ADR-005.

import { fetchGame, fetchPlayerTickets, rpcClient } from '@cryptobingo/blockchain-core';
import type { BlockchainTicketRecord, BlockchainGametype, BlockchainPattern } from '@cryptobingo/shared-types';
import { executeClaimWin }                                                    from './blockchain';
import { buildInvertedIndex, getTicketsForBall, indexExists, deleteIndex }    from './invertedIndex';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingo.game';

// ==========================================
// PADRÕES ESTÁTICOS — MODO LEGADO (gametype_id = 0)
//
// Layout de bit da cartela 5x5 (coluna-maior):
//   Col:  B    I    N    G    O
//  Row0: [0]  [5]  [10] [15] [20]
//  Row1: [1]  [6]  [11] [16] [21]
//  Row2: [2]  [7] [12*] [17] [22]   (* FREE SPACE — sempre setado)
//  Row3: [3]  [8]  [13] [18] [23]
//  Row4: [4]  [9]  [14] [19] [24]
// ==========================================

export const WIN_PATTERNS: Record<string, bigint> = {
    ROW_0:      BigInt((1<<0)|(1<<5)|(1<<10)|(1<<15)|(1<<20)),
    ROW_1:      BigInt((1<<1)|(1<<6)|(1<<11)|(1<<16)|(1<<21)),
    ROW_2:      BigInt((1<<2)|(1<<7)|(1<<12)|(1<<17)|(1<<22)),
    ROW_3:      BigInt((1<<3)|(1<<8)|(1<<13)|(1<<18)|(1<<23)),
    ROW_4:      BigInt((1<<4)|(1<<9)|(1<<14)|(1<<19)|(1<<24)),
    COL_B:      BigInt((1<<0)|(1<<1)|(1<<2)|(1<<3)|(1<<4)),
    COL_I:      BigInt((1<<5)|(1<<6)|(1<<7)|(1<<8)|(1<<9)),
    COL_N:      BigInt((1<<10)|(1<<11)|(1<<12)|(1<<13)|(1<<14)),
    COL_G:      BigInt((1<<15)|(1<<16)|(1<<17)|(1<<18)|(1<<19)),
    COL_O:      BigInt((1<<20)|(1<<21)|(1<<22)|(1<<23)|(1<<24)),
    DIAG_TL_BR: BigInt((1<<0)|(1<<6)|(1<<12)|(1<<18)|(1<<24)),
    DIAG_TR_BL: BigInt((1<<4)|(1<<8)|(1<<12)|(1<<16)|(1<<20)),
};

// ==========================================
// TIPOS
// ==========================================

export interface WinResult {
    ticket:      BlockchainTicketRecord;
    patternName: string;
    patternMask: bigint;
    weight:      number; // 0 = modo legado (sem gametype)
}

/** Par de padrão + weight para avaliação dinâmica. */
interface PatternEntry {
    name:   string;
    mask:   bigint;
    weight: number;
}

// ==========================================
// FUNÇÕES PURAS — TESTÁVEIS ISOLADAMENTE
// ==========================================

/**
 * Aplica as bolas sorteadas a uma cartela e retorna o novo estado bitmask.
 * Mapeamento: bit_index < 12 → matrix[bit_index]; bit_index > 12 → matrix[bit_index - 1].
 * O bit 12 (FREE SPACE) é sempre setado — pulado no loop.
 */
export function applyDrawnBalls(ticket: BlockchainTicketRecord, drawnBalls: number[]): number {
    const drawnSet = new Set(drawnBalls);
    let state = ticket.state; // Inicia em 0x00001000 (bit 12 setado)

    for (let bitIndex = 0; bitIndex < 25; bitIndex++) {
        if (bitIndex === 12) continue; // FREE SPACE
        const matrixIndex = bitIndex < 12 ? bitIndex : bitIndex - 1;
        const ballNumber  = ticket.matrix[matrixIndex];
        if (ballNumber !== undefined && drawnSet.has(ballNumber)) {
            state |= (1 << bitIndex);
        }
    }
    return state;
}

/**
 * Verifica se um bitmask satisfaz algum padrão em uma lista de entries.
 * Retorna TODOS os padrões vencedores (não apenas o primeiro).
 * Ref: ADR-005 Fase 2 — max_weight payout.
 */
export function checkWinPatterns(state: number, patterns: PatternEntry[]): PatternEntry[] {
    const stateBig = BigInt(state);
    return patterns.filter(p => (stateBig & p.mask) === p.mask);
}

/**
 * Versão legada — retorna o primeiro padrão vencedor encontrado (compatibilidade).
 * Usado pelos testes unitários e pelo evaluator em modo legado.
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

// ==========================================
// BUSCA DE PADRÕES ON-CHAIN (ADR-004 Fase 2)
// ==========================================

/**
 * Busca os padrões de vitória do gametype on-chain.
 * Retorna null se gametype_id = 0 (modo legado).
 */
async function fetchGametypePatterns(gametypeId: string): Promise<PatternEntry[] | null> {
    if (gametypeId === '0') return null;

    // 1. Busca o gametype
    const gtRes = await rpcClient.v1.chain.get_table_rows({
        code:        CONTRACT_ACCOUNT,
        scope:       CONTRACT_ACCOUNT,
        table:       'gametypes',
        lower_bound: gametypeId as any,
        upper_bound: gametypeId as any,
        limit:       1,
        json:        true,
    });

    if (!gtRes.rows.length) {
        console.warn(`[Evaluator] gametype_id ${gametypeId} não encontrado on-chain. Usando modo legado.`);
        return null;
    }

    const gametype = gtRes.rows[0] as BlockchainGametype;

    // 2. Busca todos os patterns referenciados nas regras do gametype
    const entries: PatternEntry[] = [];

    for (const rule of gametype.rules) {
        const patRes = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'patterns',
            lower_bound: rule.pattern_id as any,
            upper_bound: rule.pattern_id as any,
            limit:       1,
            json:        true,
        });

        if (patRes.rows.length) {
            const pattern = patRes.rows[0] as BlockchainPattern;
            entries.push({
                name:   pattern.name,
                mask:   BigInt(pattern.mask),
                weight: rule.weight,
            });
        }
    }

    return entries.length > 0 ? entries : null;
}

// ==========================================
// VARREDURA DE VENCEDORES
// ==========================================

/**
 * Varre TODOS os tickets de um jogo e retorna os vencedores.
 *
 * ADR-004 Fase 2: Se o jogo tem gametype_id > 0, usa os padrões on-chain.
 * ADR-005 Fase 2: Seleciona o padrão de maior weight por cartela (max_weight rule).
 *
 * @param gameId       - ID do jogo
 * @param drawnBalls   - Bolas sorteadas (drawn_balls do jogo)
 * @param gametypeId   - '0' para modo legado; outro valor para modo dinâmico
 */
export async function findAllWinners(
    gameId:     string,
    drawnBalls: number[],
    gametypeId: string = '0',
): Promise<WinResult[]> {
    // Tenta buscar padrões on-chain; cai para modo legado se não existirem
    const dynamicPatterns = await fetchGametypePatterns(gametypeId);

    const winners:    WinResult[] = [];
    let lowerBound:   string | undefined = undefined;
    let hasMore:      boolean = true;
    const PAGE_SIZE = 100;

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:         CONTRACT_ACCOUNT,
            scope:        gameId,
            table:        'tickets',
            limit:        PAGE_SIZE,
            lower_bound:  lowerBound as any,
            json:         true,
        });

        const tickets = response.rows as BlockchainTicketRecord[];

        for (const ticket of tickets) {
            const finalState = applyDrawnBalls(ticket, drawnBalls);

            if (dynamicPatterns) {
                // ── MODO DINÂMICO: todos os padrões do gametype ───────────────
                const winningPatterns = checkWinPatterns(finalState, dynamicPatterns);

                if (winningPatterns.length > 0) {
                    // ADR-005: seleciona o padrão de MAIOR weight (max_weight rule)
                    const best = winningPatterns.reduce(
                        (prev, curr) => curr.weight > prev.weight ? curr : prev
                    );
                    winners.push({
                        ticket,
                        patternName: best.name,
                        patternMask: best.mask,
                        weight:      best.weight,
                    });
                }
            } else {
                // ── MODO LEGADO: 12 padrões estáticos compilados ──────────────
                const winResult = checkWinPattern(finalState);
                if (winResult) {
                    winners.push({
                        ticket,
                        patternName: winResult.patternName,
                        patternMask: winResult.patternMask,
                        weight:      0, // Legado: sem weight
                    });
                }
            }
        }

        hasMore = response.more === true && tickets.length === PAGE_SIZE;
        if (hasMore && tickets.length > 0) {
            const lastId = tickets[tickets.length - 1].ticket_id;
            lowerBound   = (BigInt(lastId) + 1n).toString();
        }
    }

    return winners;
}

/**
 * Avaliação O(1) usando o Índice Invertido Redis (SPEC.md §3.2).
 *
 * Em vez de varrer todos os tickets via RPC, usa o índice para obter
 * diretamente quais tickets têm cada bola sorteada, aplicando OR/AND bit a bit.
 *
 * Complexidade: O(drawn_balls × tickets_que_têm_a_bola) vs O(total_tickets × 24)
 */
async function findAllWinnersWithIndex(
    gameId:     string,
    drawnBalls: number[],
    gametypeId: string = '0',
): Promise<WinResult[]> {
    const dynamicPatterns = await fetchGametypePatterns(gametypeId);

    // Mapa: ticket_id → estado bitmask acumulado
    const stateMap = new Map<string, number>();

    // Para cada bola sorteada, atualiza o estado dos tickets afetados via índice
    for (const ball of drawnBalls) {
        const entries = await getTicketsForBall(gameId, ball);
        for (const { ticket_id, bit_index } of entries) {
            const current = stateMap.get(ticket_id) ?? 0x00001000; // bit 12 = FREE SPACE
            stateMap.set(ticket_id, current | (1 << bit_index));
        }
    }

    // Avalia cada ticket com estado completo
    const winners: WinResult[] = [];

    for (const [ticketId, finalState] of stateMap) {
        if (dynamicPatterns) {
            const winningPatterns = checkWinPatterns(finalState, dynamicPatterns);
            if (winningPatterns.length > 0) {
                const best = winningPatterns.reduce((a, b) => b.weight > a.weight ? b : a);
                // Busca os dados completos do ticket (owner) para o payload
                const ticketData = await fetchTicketById(gameId, ticketId);
                if (ticketData) {
                    winners.push({
                        ticket:      ticketData,
                        patternName: best.name,
                        patternMask: best.mask,
                        weight:      best.weight,
                    });
                }
            }
        } else {
            const winResult = checkWinPattern(finalState);
            if (winResult) {
                const ticketData = await fetchTicketById(gameId, ticketId);
                if (ticketData) {
                    winners.push({ ticket: ticketData, ...winResult, weight: 0 });
                }
            }
        }
    }

    return winners;
}

/**
 * Busca os dados completos de um ticket por ID (para montar o WinResult).
 * Chamado apenas para tickets vencedores — não para todos.
 */
async function fetchTicketById(
    gameId:   string,
    ticketId: string,
): Promise<BlockchainTicketRecord | null> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       gameId,
            table:       'tickets',
            lower_bound: ticketId as any,
            upper_bound: ticketId as any,
            limit:       1,
            json:        true,
        });
        return res.rows[0] as BlockchainTicketRecord ?? null;
    } catch {
        return null;
    }
}

/**
 * Motor de resolução completo: lê o jogo, varre todos os tickets,
 * e submete claimwin para cada vencedor.
 *
 * Estratégia:
 *   1. Se o índice invertido Redis existe → usa O(1) por bola (SPEC.md §3.2)
 *   2. Se não existe (ex: lockgame sem Redis) → fallback para varredura RPC
 *
 * ADR-005 Fase 2: passa o win_pattern_mask do padrão de maior weight.
 */
export async function processAllGameWinners(gameId: string): Promise<void> {
    console.log(`\n🧠 [Avaliador] Iniciando resolução do jogo ${gameId}...`);

    const game = await fetchGame(gameId);
    if (!game) throw new Error(`[Avaliador] Jogo ${gameId} não encontrado.`);
    if (game.status !== 'drawn') {
        throw new Error(`[Avaliador] Jogo ${gameId} não está em estado 'drawn'. Status: ${game.status}`);
    }

    const gametypeId = (game as any).gametype_id?.toString() ?? '0';
    const hasIndex   = await indexExists(gameId);

    console.log(
        `🔍 [Avaliador] Estratégia: ${hasIndex ? 'Índice Invertido O(1)' : 'Varredura RPC O(n)'} ` +
        `(gametype: ${gametypeId === '0' ? 'legado' : gametypeId})`
    );

    let winners: WinResult[];

    if (hasIndex) {
        winners = await findAllWinnersWithIndex(gameId, game.drawn_balls, gametypeId);
    } else {
        winners = await findAllWinners(gameId, game.drawn_balls, gametypeId);
    }

    if (winners.length === 0) {
        console.log(`😔 [Avaliador] Nenhum vencedor no jogo ${gameId}.`);
        return;
    }

    console.log(`🎉 [Avaliador] ${winners.length} vencedor(es) no jogo ${gameId}!`);

    for (const { ticket, patternName, patternMask, weight } of winners) {
        console.log(
            `🏆 [Avaliador] Liquidando #${ticket.ticket_id} ` +
            `(${ticket.owner}, padrão: ${patternName}, weight: ${weight})...`
        );
        await executeClaimWin(gameId, ticket.ticket_id, game.drawn_balls.length, patternMask);
    }

    // Limpa o índice após a resolução (o TTL garante a expiração, mas limpamos explicitamente)
    if (hasIndex) {
        await deleteIndex(gameId);
    }

    console.log(`✅ [Avaliador] Resolução do jogo ${gameId} concluída.`);
}

/**
 * Varredura por jogador — para consultas do api-gateway.
 */
export async function processGameWinners(gameId: string, playerWallet: string): Promise<void> {
    console.log(`\n🧠 [Avaliador] Auditoria do jogo ${gameId} para ${playerWallet}...`);

    const game = await fetchGame(gameId);
    if (!game) throw new Error(`Jogo ${gameId} não encontrado.`);
    if (game.status !== 'drawn') {
        console.log(`⚠️ [Avaliador] Jogo ${gameId} não sorteado. Status: ${game.status}`);
        return;
    }

    const gametypeId  = (game as any).gametype_id?.toString() ?? '0';
    const tickets     = await fetchPlayerTickets(gameId, playerWallet);
    if (!tickets.length) {
        console.log(`ℹ️ [Avaliador] ${playerWallet} não tem cartelas neste jogo.`);
        return;
    }

    const dynamicPatterns = await fetchGametypePatterns(gametypeId);
    const winningTickets: WinResult[] = [];

    for (const ticket of tickets) {
        const finalState = applyDrawnBalls(ticket, game.drawn_balls);

        if (dynamicPatterns) {
            const patterns = checkWinPatterns(finalState, dynamicPatterns);
            if (patterns.length > 0) {
                const best = patterns.reduce((a, b) => b.weight > a.weight ? b : a);
                winningTickets.push({ ticket, patternName: best.name, patternMask: best.mask, weight: best.weight });
            }
        } else {
            const winResult = checkWinPattern(finalState);
            if (winResult) {
                winningTickets.push({ ticket, ...winResult, weight: 0 });
            }
        }
    }

    if (!winningTickets.length) {
        console.log(`😔 [Avaliador] Nenhuma cartela premiada para ${playerWallet}.`);
        return;
    }

    console.log(`🎉 [Avaliador] ${playerWallet} tem ${winningTickets.length} cartela(s) premiada(s)!`);

    for (const { ticket, patternName, patternMask } of winningTickets) {
        console.log(`🏆 [Avaliador] Cartela #${ticket.ticket_id} — padrão: ${patternName}`);
        await executeClaimWin(gameId, ticket.ticket_id, game.drawn_balls.length, patternMask);
    }
}
