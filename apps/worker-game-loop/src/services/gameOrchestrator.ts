// apps/worker-game-loop/src/services/gameOrchestrator.ts
// ADR-014: Orquestração de Partida — Slow Reveal como gate do avaliador.
//
// O orquestrador coordena o timing entre broadcaster (slow reveal) e evaluator
// (pagamento on-chain) de acordo com o draw_mode do gametype.
// O reveal sempre precede o pagamento: o jogador vê o resultado antes de
// qualquer transação on-chain ser submetida.
//
// Fluxo geral:
//   1. Busca gametype e drawn_balls on-chain
//   2. Para MULTI_MATCH: pré-computa cutoffs (scan único antes do reveal)
//   3. Delega para o handler do draw_mode
//   4. Cada handler: reveal → avalia → paga → anuncia → (repete por estágio)
//   5. Após o último lote: notifyGameEnded → onGameResolved

import { fetchGame, rpcClient }                                     from '@cryptobingo/blockchain-core';
import { UInt64 }                                                    from '@wharfkit/antelope';
import type { DrawMode }                                             from '@cryptobingo/shared-types';
import {
    processAllGameWinners,
    findAllWinners,
    findFirstFullCutoff,
    preComputeMultiMatchCutoffs,
    payMultiMatchStage,
    deriveGoldenMultiplierExported as deriveGoldenMultiplier,
    DEFAULT_DRAW_BALLS,
}                                                                    from './evaluator';
import {
    startSlowReveal,
    endRevealSession,
    notifyWinners,
    notifyGoldenBall,
    notifyStageCleared,
    notifyGameEnded,
    type WinnerPayload,
}                                                                    from './broadcaster';
import { executeCloseGame }                                          from './blockchain';
import { deleteIndex }                                               from './invertedIndex';
import { onGameResolved }                                            from './roomManager';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingo.game';

// Pausa visual entre o reveal da golden ball e o anúncio de vencedores
const GOLDEN_BALL_PAUSE_MS = parseInt(process.env.GOLDEN_BALL_PAUSE_MS ?? '3000', 10);
// Pausa entre estágios no MULTI_MATCH (jogador lê resultado antes de continuar)
const STAGE_PAUSE_MS = parseInt(process.env.STAGE_PAUSE_MS ?? '4000', 10);

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// CONVERSÃO DE RESULTADOS PARA WinnerPayload
// ==========================================

async function buildWinnerPayloads(gameId: string, winResults: Awaited<ReturnType<typeof findAllWinners>>): Promise<WinnerPayload[]> {
    const game = await fetchGame(gameId);
    return winResults.map(w => ({
        account:     w.ticket.owner,
        ticket_id:   w.ticket.ticket_id,
        win_pattern: w.patternName,
        payouts:     game ? [game.ticket_price.quantity] : [],
    }));
}

// ==========================================
// HANDLERS POR MODO
// ==========================================

async function orchestrateStandard(gameId: string, drawnBalls: number[], maxBalls: number, gametypeId: string): Promise<number> {
    const balls = drawnBalls.slice(0, maxBalls);
    await startSlowReveal(gameId, balls);
    endRevealSession(gameId);

    const winResults = await findAllWinners(gameId, balls, gametypeId);
    await processAllGameWinners(gameId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults);
        notifyWinners(gameId, payloads);
    }
    return winResults.length;
}

async function orchestrateFirstFull(gameId: string, drawnBalls: number[], gametypeId: string): Promise<number> {
    const cutoff = await findFirstFullCutoff(gameId, drawnBalls);
    const balls  = drawnBalls.slice(0, cutoff);

    await startSlowReveal(gameId, balls);
    endRevealSession(gameId);

    await processAllGameWinners(gameId);
    const winResults = await findAllWinners(gameId, balls, gametypeId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults);
        notifyWinners(gameId, payloads);
    }
    return winResults.length;
}

async function orchestrateGoldenBall(
    gameId:         string,
    drawnBalls:     number[],
    maxBalls:       number,
    goldenBallAfter: number,
    gametypeId:     string,
): Promise<number> {
    const ga         = goldenBallAfter > 0 ? goldenBallAfter : maxBalls;
    const normalBalls = drawnBalls.slice(0, ga);
    const goldenNum   = drawnBalls[ga] ?? 0;
    const multiplier  = deriveGoldenMultiplier(drawnBalls, ga);

    // 1. Fase normal
    await startSlowReveal(gameId, normalBalls);

    // 2. Anuncia golden ball antes de revelá-la
    notifyGoldenBall(gameId, goldenNum, multiplier);
    await sleep(GOLDEN_BALL_PAUSE_MS);

    // 3. Revela a golden ball
    await startSlowReveal(gameId, [goldenNum]);
    endRevealSession(gameId);

    // 4. Avalia e paga
    await processAllGameWinners(gameId);
    const effectiveBalls = drawnBalls.slice(0, ga + 1);
    const winResults     = await findAllWinners(gameId, effectiveBalls, gametypeId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults);
        notifyWinners(gameId, payloads);
    }
    return winResults.length;
}

async function orchestrateMultiMatch(
    gameId:     string,
    drawnBalls: number[],
    gametypeId: string,
): Promise<number> {
    // Pré-computa cutoffs ANTES do reveal (scan único)
    const cutoffs = await preComputeMultiMatchCutoffs(gameId, drawnBalls, gametypeId);

    let prevCutoff    = 0;
    let totalWinners  = 0;

    for (const result of cutoffs) {
        const { stage, cutoffBall, winners } = result;

        // Revela as bolas desde o cutoff anterior até este cutoff
        if (cutoffBall <= drawnBalls.length) {
            await startSlowReveal(gameId, drawnBalls.slice(prevCutoff, cutoffBall));
        }

        if (winners.length > 0) {
            // Paga on-chain
            await payMultiMatchStage(gameId, result);

            // Anuncia vencedores deste estágio
            const payloads: WinnerPayload[] = winners.map(w => ({
                account:     w.ticket.owner,
                ticket_id:   w.ticket.ticket_id,
                win_pattern: `stage_${stage}`,
                payouts:     [],
            }));
            notifyStageCleared(gameId, stage, payloads);
            totalWinners += winners.length;

            await sleep(STAGE_PAUSE_MS);
            prevCutoff = cutoffBall;
        }
    }

    endRevealSession(gameId);
    await executeCloseGame(gameId);
    return totalWinners;
}

// ==========================================
// PONTO DE ENTRADA PRINCIPAL
// ==========================================

/**
 * Orquestra todo o fluxo de resolução de uma partida após o oracle responder.
 * ADR-014: o reveal precede e gata o avaliador; onGameResolved só é chamado
 * após o reveal completo e todos os pagamentos.
 */
export async function orchestrateGame(gameId: string): Promise<void> {
    console.log(`\n🎬 [Orquestrador] Iniciando orquestração do jogo ${gameId}...`);

    const game = await fetchGame(gameId);
    if (!game) throw new Error(`[Orquestrador] Jogo ${gameId} não encontrado.`);
    if (game.status !== 'drawn') {
        throw new Error(`[Orquestrador] Jogo ${gameId} não está em DRAWN. Status: ${game.status}`);
    }

    const gametypeId = (game as any).gametype_id?.toString() ?? '0';
    let drawMode: DrawMode = 'standard';
    let maxBalls  = DEFAULT_DRAW_BALLS;
    let goldenBallAfter = 0;

    if (gametypeId !== '0') {
        const gtRes = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'gametypes',
            lower_bound: UInt64.from(gametypeId), upper_bound: UInt64.from(gametypeId),
            limit: 1, json: true,
        });
        if (gtRes.rows.length) {
            const gt    = gtRes.rows[0] as any;
            drawMode    = (gt.draw_mode ?? 'standard') as DrawMode;
            maxBalls    = gt.max_balls > 0 ? gt.max_balls : DEFAULT_DRAW_BALLS;
            goldenBallAfter = gt.golden_ball_after ?? 0;
        }
    }

    console.log(`🔍 [Orquestrador] Modo: ${drawMode} | Bolas: ${maxBalls} | Gametype: ${gametypeId}`);

    const drawnBalls = game.drawn_balls;
    let totalWinners = 0;

    try {
        switch (drawMode) {
            case 'fixed':
            case 'standard':
                totalWinners = await orchestrateStandard(gameId, drawnBalls, maxBalls, gametypeId);
                break;

            case 'firstfull':
                totalWinners = await orchestrateFirstFull(gameId, drawnBalls, gametypeId);
                break;

            case 'goldenball':
                totalWinners = await orchestrateGoldenBall(gameId, drawnBalls, maxBalls, goldenBallAfter, gametypeId);
                break;

            case 'multimatch':
                totalWinners = await orchestrateMultiMatch(gameId, drawnBalls.slice(0, maxBalls), gametypeId);
                break;

            default:
                console.warn(`[Orquestrador] draw_mode desconhecido: ${drawMode}. Usando standard.`);
                totalWinners = await orchestrateStandard(gameId, drawnBalls, maxBalls, gametypeId);
        }
    } finally {
        // Garante limpeza do índice e do reveal mesmo em caso de erro parcial
        endRevealSession(gameId);
        await deleteIndex(gameId).catch(() => {});
    }

    // Sinaliza fim do jogo para a UI (antes de criar a próxima partida)
    notifyGameEnded(gameId, drawMode, totalWinners);

    // Cria próxima partida da sala (ADR-010) — APÓS o reveal completo
    await onGameResolved(gameId).catch(err =>
        console.error(`[Orquestrador] onGameResolved error (jogo ${gameId}):`, err)
    );

    console.log(`✅ [Orquestrador] Jogo ${gameId} totalmente resolvido (modo: ${drawMode}, ${totalWinners} vencedor(es)).`);
}
