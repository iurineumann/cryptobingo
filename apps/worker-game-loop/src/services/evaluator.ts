// apps/worker-game-loop/src/services/evaluator.ts
// Motor de avaliação de cartelas vencedoras.
//
// ADR-004 Fase 2: Padrões e pesos são buscados on-chain da tabela
// `patterns`/`gametypes`. Todo jogo tem gametype_id > 0.
//
// ADR-005 Fase 2: checkWinPatterns (plural) retorna TODOS os padrões
// vencedores de uma cartela. O worker seleciona o de maior weight (max_weight)
// antes de enviar claimwin — conforme ADR-005.

import { fetchGame, fetchPlayerTickets, parseHexBytes, rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainTicketRecord, DrawMode } from '@cryptobingo/shared-types';
import { executeClaimWin, executeClaimStage, executeCloseGame }               from './blockchain';
import { buildInvertedIndex, getTicketsForBall, indexExists, deleteIndex }    from './invertedIndex';
import { fetchPatternsWithCache } from './patternCache';
import { Pool } from 'pg';

let pgPool: Pool | null = null;
function getPgPool(): Pool {
    if (!pgPool) {
        pgPool = new Pool({ connectionString: process.env.POSTGRES_URL });
    }
    return pgPool;
}

async function recordClaimWin(
    txHash: string,
    walletAddress: string,
    gameId: string,
    ticketId: string,
    amount: number,
    currency: string,
): Promise<void> {
    try {
        const pool = getPgPool();
        await pool.query(
            `INSERT INTO transactions_ledger
                (tx_hash, wallet_address, game_id, action_type, amount, currency, memo, block_time)
             VALUES ($1, $2, $3, 'claim_win', $4, $5, $6, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [txHash, walletAddress, gameId, amount, currency, `Ticket #${ticketId}`]
        );
    } catch (err) {
        console.error('[Evaluator] Failed to record claim win:', err);
    }
}

export function computePayoutAmount(
    ticketQuantity: string,
    baseMultiplier: number,
    weight: number,
    goldenMultiplier: number,
): { amount: number; currency: string } {
    const priceParts = ticketQuantity.split(' ');
    const priceNum = parseFloat(priceParts[0]);
    const currency = priceParts.slice(1).join(' ') || 'WAX';

    let payout = priceNum * baseMultiplier * weight / 100;
    if (goldenMultiplier > 1) {
        payout *= goldenMultiplier;
    }
    return { amount: Math.round(payout * 10000) / 10000, currency };
}

function normalizeTickets(rows: Record<string, any>[]): BlockchainTicketRecord[] {
    for (const row of rows) {
        if (typeof row.matrix === 'string') {
            row.matrix = parseHexBytes(row.matrix);
        }
    }
    return rows as unknown as BlockchainTicketRecord[];
}

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingo.game';

// ==========================================
// TIPOS
// ==========================================

export interface WinResult {
    ticket:      BlockchainTicketRecord;
    patternName: string;
    patternMask: bigint;
    weight:      number; // weight do padrão vencedor no gametype
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

// ==========================================
// BUSCA DE PADRÕES ON-CHAIN
// ==========================================

/**
 * Busca os padrões de vitória do gametype, com cache Redis.
 * Cache key: pattern:gametype:{gametypeId}, TTL 1h.
 * Fallback para blockchain se Redis indisponível.
 * Todo jogo tem gametype_id > 0; lança erro se não encontrado.
 */
async function fetchGametypePatterns(gametypeId: string): Promise<PatternEntry[]> {
    return fetchPatternsWithCache(gametypeId);
}

// ==========================================
// VARREDURA DE VENCEDORES
// ==========================================

/**
 * Varre TODOS os tickets de um jogo e retorna os vencedores.
 * Usa os padrões on-chain do gametype para avaliação.
 * ADR-005 Fase 2: Seleciona o padrão de maior weight por cartela (max_weight rule).
 */
export async function findAllWinners(
    gameId:     string,
    drawnBalls: number[],
    gametypeId: string,
): Promise<WinResult[]> {
    const patterns = await fetchGametypePatterns(gametypeId);

    const winners:    WinResult[] = [];
    let lowerBound:   string | undefined = undefined;
    let hasMore:      boolean = true;
    const PAGE_SIZE = 100;

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:         CONTRACT_ACCOUNT,
            scope:        Name.from(UInt64.from(gameId)),
            table:        'tickets',
            key_type:     'i64',
            limit:        PAGE_SIZE,
            lower_bound:  lowerBound as any,
            json:         true,
        });

        const tickets = normalizeTickets(response.rows);

        for (const ticket of tickets) {
            const finalState = applyDrawnBalls(ticket, drawnBalls);
            const winningPatterns = checkWinPatterns(finalState, patterns);

            if (winningPatterns.length > 0) {
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
    gametypeId: string,
): Promise<WinResult[]> {
    const patterns = await fetchGametypePatterns(gametypeId);

    const stateMap = new Map<string, number>();

    for (const ball of drawnBalls) {
        const entries = await getTicketsForBall(gameId, ball);
        for (const { ticket_id, bit_index } of entries) {
            const current = stateMap.get(ticket_id) ?? 0x00001000;
            stateMap.set(ticket_id, current | (1 << bit_index));
        }
    }

    const winners: WinResult[] = [];

    for (const [ticketId, finalState] of stateMap) {
        const winningPatterns = checkWinPatterns(finalState, patterns);
        if (winningPatterns.length > 0) {
            const best = winningPatterns.reduce((a, b) => b.weight > a.weight ? b : a);
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
            scope:       Name.from(UInt64.from(gameId)),
            table:       'tickets',
            key_type:    'i64',
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

// ==========================================
// ADR-012 — HELPERS DOS NOVOS MODOS DE SORTEIO
// ==========================================

/**
 * Número padrão de bolas efetivamente sorteadas por rodada.
 * O oracle (orng.wax) sempre entrega 75 bytes (baralho completo embaralhado),
 * mas o jogo usa apenas os primeiros DEFAULT_DRAW_BALLS para avaliação.
 * Os bytes restantes ficam disponíveis como entropia extra (ex: GOLDEN_BALL).
 */
export const DEFAULT_DRAW_BALLS = 35;

/** Máscara do padrão MASTER: todos os 25 bits setados (FREE SPACE incluso). */
const MASTER_MASK = BigInt(0x1FFFFFF);

/**
 * Deriving do multiplicador GOLDEN_BALL a partir de 2 bytes de entropia.
 * Usa os bytes subsequentes ao índice da golden ball.
 * Distribuição: 2×(60%) · 3×(25%) · 5×(10%) · 10×(3%) · 20×(1.5%) · 50×(0.4%) · 100×(0.1%)
 */
/** Exportado para uso pelo gameOrchestrator. */
export function deriveGoldenMultiplierExported(drawnBalls: number[], goldenBallAfter: number): number {
    return deriveGoldenMultiplier(drawnBalls, goldenBallAfter);
}

function deriveGoldenMultiplier(drawnBalls: number[], goldenBallAfter: number): number {
    const b1   = drawnBalls[goldenBallAfter + 1] ?? 1;
    const b2   = drawnBalls[goldenBallAfter + 2] ?? 1;
    const roll = ((b1 << 8) | b2) % 10_000;
    if (roll < 6_000) return 2;
    if (roll < 8_500) return 3;
    if (roll < 9_500) return 5;
    if (roll < 9_800) return 10;
    if (roll < 9_950) return 20;
    if (roll < 9_990) return 50;
    return 100;
}

/**
 * Verifica se um número de bola (1-75) está coberto pelo padrão vencedor
 * de uma cartela específica.
 */
function isBallInPattern(ticket: BlockchainTicketRecord, ballNumber: number, patternMask: bigint): boolean {
    for (let bitIndex = 0; bitIndex < 25; bitIndex++) {
        if (bitIndex === 12) continue;
        const matrixIndex = bitIndex < 12 ? bitIndex : bitIndex - 1;
        if (ticket.matrix[matrixIndex] === ballNumber) {
            return (patternMask & BigInt(1 << bitIndex)) !== 0n;
        }
    }
    return false;
}

/**
 * FIRST_FULL: encontra o número mínimo de bolas para que qualquer ticket complete o MASTER.
 * Varre todos os tickets RPC para determinar o cutoff ball.
 */
export async function findFirstFullCutoff(gameId: string, drawnBalls: number[]): Promise<number> {
    let minBalls = drawnBalls.length;
    let lowerBound: string | undefined;
    let hasMore = true;

    while (hasMore) {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       Name.from(UInt64.from(gameId)),
            table:       'tickets',
            key_type:    'i64',
            limit:       100,
            lower_bound: lowerBound as any,
            json:        true,
        });

        for (const ticket of normalizeTickets(response.rows)) {
            const matrixSet = new Set(ticket.matrix);
            let count = 0;
            for (let i = 0; i < drawnBalls.length; i++) {
                if (matrixSet.has(drawnBalls[i])) {
                    matrixSet.delete(drawnBalls[i]);
                    if (matrixSet.size === 0) { count = i + 1; break; }
                }
            }
            if (count > 0 && count < minBalls) minBalls = count;
        }

        hasMore = response.more === true && response.rows.length === 100;
        if (hasMore) {
            const last = normalizeTickets(response.rows)[response.rows.length - 1];
            lowerBound = (BigInt(last.ticket_id) + 1n).toString();
        }
    }

    return minBalls;
}

// ==========================================
// ADR-013 — MULTI_MATCH: resolução por estágios
// ==========================================

export interface StageWinner {
    ticket:      BlockchainTicketRecord;
    patternMask: bigint;
    ballCount:   number;
}

export interface StageCutoffResult {
    stage:             number;
    patterns_required: number;
    cutoffBall:        number;   // índice 1-based; igual a drawnBalls.length = não houve vencedor
    winners:           StageWinner[];
}

/**
 * ADR-014: pré-computa cutoffs e vencedores de TODOS os estágios antes do reveal.
 * Escaneia todos os tickets UMA vez; chamado pelo gameOrchestrator antes de startSlowReveal.
 * Exportado para uso pelo orquestrador.
 */
export async function preComputeMultiMatchCutoffs(
    gameId:      string,
    drawnBalls:  number[],
    gametypeId:  string,
): Promise<StageCutoffResult[]> {
    const gtRes = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'gametypes',
        lower_bound: UInt64.from(gametypeId), upper_bound: UInt64.from(gametypeId),
        limit: 1, json: true,
    });
    if (!gtRes.rows.length) throw new Error(`[MULTI_MATCH] Gametype ${gametypeId} não encontrado.`);
    const stages: Array<{ stage: number; patterns_required: number; weight: number }> =
        (gtRes.rows[0] as any).stages ?? [];
    if (!stages.length) throw new Error(`[MULTI_MATCH] Gametype ${gametypeId} não tem stages.`);

    const dynamicPatterns = await fetchGametypePatterns(gametypeId);

    // Carrega todos os tickets uma vez
    const allTickets: BlockchainTicketRecord[] = [];
    let lowerBound: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: Name.from(UInt64.from(gameId)), table: 'tickets',
            limit: 100, lower_bound: lowerBound as any, json: true,
        });
        allTickets.push(...normalizeTickets(res.rows));
        hasMore = res.more === true && res.rows.length === 100;
        if (hasMore) {
            const last = normalizeTickets(res.rows)[res.rows.length - 1];
            lowerBound = (BigInt(last.ticket_id) + 1n).toString();
        }
    }

    console.log(`🎯 [MULTI_MATCH] Pré-computando cutoffs: ${allTickets.length} tickets, ${stages.length} estágios.`);

    const results: StageCutoffResult[] = [];

    for (const stageDef of stages.sort((a, b) => a.patterns_required - b.patterns_required)) {
        let cutoffBall = drawnBalls.length + 1; // sentinela: sem vencedor

        for (let i = 1; i <= drawnBalls.length; i++) {
            const partialBalls = drawnBalls.slice(0, i);
            const hit = allTickets.some(t =>
                checkWinPatterns(applyDrawnBalls(t, partialBalls), dynamicPatterns).length >= stageDef.patterns_required
            );
            if (hit) { cutoffBall = i; break; }
        }

        const winners: StageWinner[] = [];
        if (cutoffBall <= drawnBalls.length) {
            const effective = drawnBalls.slice(0, cutoffBall);
            for (const ticket of allTickets) {
                const wins = checkWinPatterns(applyDrawnBalls(ticket, effective), dynamicPatterns);
                if (wins.length >= stageDef.patterns_required) {
                    const best = wins.reduce((a, b) => b.weight > a.weight ? b : a);
                    winners.push({ ticket, patternMask: best.mask, ballCount: cutoffBall });
                }
            }
        }

        results.push({ stage: stageDef.stage, patterns_required: stageDef.patterns_required, cutoffBall, winners });
        console.log(
            cutoffBall <= drawnBalls.length
                ? `   Stage ${stageDef.stage}: cutoff bola ${cutoffBall}, ${winners.length} vencedor(es)`
                : `   Stage ${stageDef.stage}: sem vencedores`
        );
    }

    return results;
}

/**
 * Paga os vencedores de um estágio já computado (sem re-escanear tickets).
 * Chamado pelo gameOrchestrator após o reveal do cutoff de cada estágio.
 */
export async function payMultiMatchStage(
    gameId:  string,
    result:  StageCutoffResult,
): Promise<void> {
    for (const { ticket, patternMask, ballCount } of result.winners) {
        await executeClaimStage(gameId, ticket.ticket_id, result.stage, ballCount, patternMask);
    }
}

/**
 * Wrapper de fallback: processa todos os estágios de uma vez (sem orquestração de reveal).
 * Usado pelo dispatcher quando o orquestrador não está disponível.
 */
async function processMultiMatchWinners(
    gameId:      string,
    drawnBalls:  number[],
    gametypeId:  string,
): Promise<void> {
    const cutoffs = await preComputeMultiMatchCutoffs(gameId, drawnBalls, gametypeId);
    for (const result of cutoffs) {
        if (result.winners.length > 0) {
            console.log(`🏆 [MULTI_MATCH] Pagando estágio ${result.stage} (${result.winners.length} vencedor(es), bola ${result.cutoffBall}).`);
            await payMultiMatchStage(gameId, result);
        } else {
            console.log(`⏭️  [MULTI_MATCH] Estágio ${result.stage}: sem vencedores.`);
        }
    }
    await executeCloseGame(gameId);
    console.log(`✅ [MULTI_MATCH] Jogo ${gameId} resolvido.`);
}

/**
 * Motor de resolução completo: lê o jogo, aplica lógica do draw_mode,
 * submete claimwin para cada vencedor e fecha o jogo com closegame().
 *
 * ADR-012: suporta modos standard | fixed | firstfull | goldenball
 * ADR-005 Fase 2: passa o win_pattern_mask do padrão de maior weight.
 */
export async function processAllGameWinners(gameId: string): Promise<void> {
    console.log(`\n🧠 [Avaliador] Iniciando resolução do jogo ${gameId}...`);

    const game = await fetchGame(gameId);
    if (!game) throw new Error(`[Avaliador] Jogo ${gameId} não encontrado.`);
    if (game.status !== 'drawn') {
        throw new Error(`[Avaliador] Jogo ${gameId} não está em estado 'drawn'. Status: ${game.status}`);
    }

    const gametypeId  = (game as any).gametype_id?.toString();
    if (!gametypeId || gametypeId === '0') {
        throw new Error(`[Avaliador] Jogo ${gameId} sem gametype_id válido (todos os jogos devem ter gametype_id > 0).`);
    }
    const hasIndex    = await indexExists(gameId);

    const gtRes = await rpcClient.v1.chain.get_table_rows({
        code:        CONTRACT_ACCOUNT,
        scope:       CONTRACT_ACCOUNT,
        table:       'gametypes',
        lower_bound: UInt64.from(gametypeId),
        upper_bound: UInt64.from(gametypeId),
        limit:       1,
        json:        true,
    });

    if (!gtRes.rows.length) {
        throw new Error(`[Avaliador] gametype_id ${gametypeId} não encontrado on-chain.`);
    }
    const gt = gtRes.rows[0] as any;
    const drawMode: DrawMode = (gt.draw_mode ?? 'standard') as DrawMode;
    const maxBalls: number   = gt.max_balls > 0 ? gt.max_balls : DEFAULT_DRAW_BALLS;
    const goldenBallAfter: number = gt.golden_ball_after ?? 0;
    const baseMultiplier: number = gt.base_multiplier ?? 1;

    let goldenBallNum: number    = 0;
    let goldenMultiplierGlobal   = 0;

    console.log(
        `🔍 [Avaliador] Modo: ${drawMode} | Bolas: ${maxBalls} | ` +
        `Estratégia: ${hasIndex ? 'Índice O(1)' : 'RPC O(n)'} | ` +
        `Gametype: ${gametypeId}`
    );

    // ── MULTI_MATCH: delega para handler especializado ───────────────────────
    if (drawMode === 'multimatch') {
        await processMultiMatchWinners(gameId, game.drawn_balls.slice(0, maxBalls), gametypeId);
        if (hasIndex) await deleteIndex(gameId);
        return;
    }

    // ── Aplica limite de bolas (vale para todos os modos — oracle entrega 75 sempre) ──
    // O oracle (orng.wax) entrega 75 bytes (baralho completo). Usamos apenas maxBalls.
    // Os bytes restantes permanecem disponíveis como entropia extra (GOLDEN_BALL).
    let effectiveBalls = game.drawn_balls.slice(0, maxBalls);

    if (drawMode === 'fixed') {
        console.log(`📌 [FIXED] Usando ${effectiveBalls.length} bolas explícitas (de ${game.drawn_balls.length}).`);

    } else if (drawMode === 'firstfull') {
        // FIRST_FULL: varre com o baralho completo do oracle para encontrar o cutoff
        // (MASTER pode exigir mais de max_balls bolas — usamos as 75 disponíveis)
        const cutoff = await findFirstFullCutoff(gameId, game.drawn_balls);
        effectiveBalls = game.drawn_balls.slice(0, cutoff);
        console.log(`🃏 [FIRST_FULL] Cutoff na bola ${cutoff} (de ${game.drawn_balls.length} disponíveis). Avaliando MASTER apenas.`);

    } else if (drawMode === 'goldenball') {
        // GOLDEN_BALL: a fase normal usa as primeiras maxBalls bolas (já aplicadas acima).
        // A bola dourada é a próxima após o sorteio normal.
        const ga = goldenBallAfter > 0 ? goldenBallAfter : maxBalls;
        goldenBallNum          = game.drawn_balls[ga] ?? 0;
        goldenMultiplierGlobal = deriveGoldenMultiplier(game.drawn_balls, ga);
        // effectiveBalls inclui a fase normal + a golden ball
        effectiveBalls         = game.drawn_balls.slice(0, ga + 1);
        console.log(
            `🌟 [GOLDEN_BALL] Fase normal: ${maxBalls} bolas. ` +
            `Bola dourada: ${goldenBallNum} (pos ${ga}). ` +
            `Multiplicador: ×${goldenMultiplierGlobal}`
        );
    }

    // ── Avalia vencedores ────────────────────────────────────────────────────
    let winners: WinResult[];

    if (hasIndex && drawMode === 'standard') {
        winners = await findAllWinnersWithIndex(gameId, effectiveBalls, gametypeId);
    } else {
        winners = await findAllWinners(gameId, effectiveBalls, gametypeId);
    }

    // FIRST_FULL: filtra apenas tickets que completaram MASTER
    if (drawMode === 'firstfull') {
        winners = winners.filter(w => (BigInt(w.patternMask) & MASTER_MASK) === MASTER_MASK);
    }

    // ── Submete pagamentos ───────────────────────────────────────────────────
    if (winners.length === 0) {
        console.log(`😔 [Avaliador] Nenhum vencedor no jogo ${gameId}.`);
    } else {
        console.log(`🎉 [Avaliador] ${winners.length} vencedor(es) no jogo ${gameId}!`);

        for (const { ticket, patternName, patternMask, weight } of winners) {
            // GOLDEN_BALL: verifica se a bola dourada está coberta pelo padrão vencedor
            let appliedMultiplier = 0;
            if (drawMode === 'goldenball' && goldenBallNum > 0) {
                const inPattern = isBallInPattern(ticket, goldenBallNum, patternMask);
                if (inPattern) appliedMultiplier = goldenMultiplierGlobal;
            }

            console.log(
                `🏆 [Avaliador] Liquidando #${ticket.ticket_id} ` +
                `(${ticket.owner}, padrão: ${patternName}, weight: ${weight}` +
                (appliedMultiplier > 1 ? `, 🌟×${appliedMultiplier}` : '') + ')...'
            );
            const txHash = await executeClaimWin(
                gameId,
                ticket.ticket_id,
                effectiveBalls.length,
                patternMask,
                appliedMultiplier,
            );

            if (txHash) {
                const actualPrice = ticket.price?.quantity ?? game.ticket_price.quantity;
                const payout = computePayoutAmount(
                    actualPrice,
                    baseMultiplier,
                    weight,
                    appliedMultiplier,
                );
                recordClaimWin(
                    txHash,
                    ticket.owner,
                    gameId,
                    ticket.ticket_id,
                    payout.amount,
                    payout.currency,
                ).catch(() => {});
            }
        }
    }

    // ── Limpa índice e fecha jogo ────────────────────────────────────────────
    if (hasIndex) await deleteIndex(gameId);

    await executeCloseGame(gameId);
    console.log(`✅ [Avaliador] Resolução do jogo ${gameId} concluída (modo: ${drawMode}).`);
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

    const gametypeId  = (game as any).gametype_id?.toString();
    if (!gametypeId || gametypeId === '0') {
        console.warn(`⚠️ [Avaliador] Jogo ${gameId} sem gametype_id válido. Pulando auditoria.`);
        return;
    }
    const tickets     = await fetchPlayerTickets(gameId, playerWallet);
    if (!tickets.length) {
        console.log(`ℹ️ [Avaliador] ${playerWallet} não tem cartelas neste jogo.`);
        return;
    }

    const patterns = await fetchGametypePatterns(gametypeId);
    const winningTickets: WinResult[] = [];

    for (const ticket of tickets) {
        const finalState = applyDrawnBalls(ticket, game.drawn_balls);
        const wp = checkWinPatterns(finalState, patterns);
        if (wp.length > 0) {
            const best = wp.reduce((a, b) => b.weight > a.weight ? b : a);
            winningTickets.push({ ticket, patternName: best.name, patternMask: best.mask, weight: best.weight });
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
