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
    computePayoutAmount,
}                                                                    from './evaluator';
import {
    startSlowReveal,
    endRevealSession,
    notifyWinners,
    notifyGoldenBall,
    notifyGoldenMultiplierProgress,
    notifyStageCleared,
    notifyGameEnded,
    type WinnerPayload,
} from './broadcaster';
import { executeCloseGame }                                          from './blockchain';
import { deleteIndex }                                               from './invertedIndex';
import { onGameResolved }                                            from './roomManager';
import { sendGameSummaryMessage }                                    from './chatSystemHelper';
import {
    gameResolutionTotal,
    gameResolutionDuration,
    gameWinnersTotal,
}                                                                    from './metrics';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';

// Pausa visual entre o reveal da golden ball e o anúncio de vencedores
const GOLDEN_BALL_PAUSE_MS = Number.parseInt(process.env.GOLDEN_BALL_PAUSE_MS ?? '3000', 10);
// Pausa entre estágios no MULTI_MATCH (jogador lê resultado antes de continuar)
const STAGE_PAUSE_MS = Number.parseInt(process.env.STAGE_PAUSE_MS ?? '4000', 10);
// Pausa entre tiers da animação do multiplicador golden ball
const MULTIPLIER_TIER_PAUSE_MS = Number.parseInt(process.env.MULTIPLIER_TIER_PAUSE_MS ?? '400', 10);
const MULTIPLIER_FINAL_PAUSE_MS = Number.parseInt(process.env.MULTIPLIER_FINAL_PAUSE_MS ?? '600', 10);

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// CONVERSÃO DE RESULTADOS PARA WinnerPayload
// ==========================================

async function buildWinnerPayloads(
    gameId:        string,
    winResults:    Awaited<ReturnType<typeof findAllWinners>>,
    baseMultiplier = 1,
    goldenMultiplier = 0,
): Promise<WinnerPayload[]> {
    const game = await fetchGame(gameId);
    return winResults.map(w => {
        const ticketPrice = w.ticket.price?.quantity ?? game?.ticket_price.quantity ?? '';
        if (!game || !ticketPrice) return {
            account: w.ticket.owner, ticket_id: w.ticket.ticket_id,
            win_pattern: w.patternName, payouts: [],
        };
        const payout = computePayoutAmount(ticketPrice, baseMultiplier, w.weight || 100, goldenMultiplier);
        return {
            account:     w.ticket.owner,
            ticket_id:   w.ticket.ticket_id,
            win_pattern: w.patternName,
            payouts:     payout.amount > 0 ? [`${payout.amount.toFixed(4)} ${payout.currency}`] : [],
        };
    });
}

// ==========================================
// HANDLERS POR MODO
// ==========================================

async function orchestrateStandard(gameId: string, drawnBalls: number[], maxBalls: number, gametypeId: string, baseMultiplier = 1): Promise<number> {
    const balls = drawnBalls.slice(0, maxBalls);
    await startSlowReveal(gameId, balls, maxBalls);
    endRevealSession(gameId);

    const winResults = await findAllWinners(gameId, balls, gametypeId);
    await processAllGameWinners(gameId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults, baseMultiplier);
        notifyWinners(gameId, payloads);
    }
    return winResults.length;
}

async function orchestrateFirstFull(gameId: string, drawnBalls: number[], gametypeId: string, baseMultiplier = 1): Promise<number> {
    const cutoff = await findFirstFullCutoff(gameId, drawnBalls);
    const balls  = drawnBalls.slice(0, cutoff);

    await startSlowReveal(gameId, balls, balls.length);
    endRevealSession(gameId);

    const winResults = await findAllWinners(gameId, balls, gametypeId);
    await processAllGameWinners(gameId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults, baseMultiplier);
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
    baseMultiplier  = 1,
): Promise<number> {
    const ga          = goldenBallAfter > 0 ? goldenBallAfter : maxBalls;
    const totalReveal = ga + 1;
    const normalBalls = drawnBalls.slice(0, ga);
    const goldenNum   = drawnBalls[ga] ?? 0;
    const multiplier  = deriveGoldenMultiplier(drawnBalls, ga);

    // 1. Fase normal (progresso: ga/totalReveal)
    await startSlowReveal(gameId, normalBalls, totalReveal);

    // 2. Anuncia golden ball antes de revelá-la
    notifyGoldenBall(gameId, goldenNum, multiplier);
    await sleep(GOLDEN_BALL_PAUSE_MS);

    // 3. Animação sequencial do multiplicador
    const tiers = [2, 5, 10, 50, 100, 200];
    for (const tier of tiers) {
        if (tier >= multiplier) break;
        notifyGoldenMultiplierProgress(gameId, tier, false);
        await sleep(MULTIPLIER_TIER_PAUSE_MS);
    }
    notifyGoldenMultiplierProgress(gameId, multiplier, true);
    await sleep(MULTIPLIER_FINAL_PAUSE_MS);

    // 4. Revela a golden ball (progresso final: totalReveal/totalReveal)
    await startSlowReveal(gameId, [goldenNum], totalReveal);
    endRevealSession(gameId);

    // 5. Avalia e paga
    const effectiveBalls = drawnBalls.slice(0, ga + 1);
    const winResults     = await findAllWinners(gameId, effectiveBalls, gametypeId);
    await processAllGameWinners(gameId);

    if (winResults.length > 0) {
        const payloads = await buildWinnerPayloads(gameId, winResults, baseMultiplier, multiplier);
        notifyWinners(gameId, payloads);
    }
    return winResults.length;
}

async function orchestrateMultiMatch(
    gameId:     string,
    drawnBalls: number[],
    gametypeId: string,
): Promise<number> {
    // Valida estado on-chain (gametype, status drawn, índice) antes do reveal
    await processAllGameWinners(gameId);

    // Pré-computa cutoffs ANTES do reveal (scan único)
    const cutoffs = await preComputeMultiMatchCutoffs(gameId, drawnBalls, gametypeId);
    const lastCutoff = cutoffs.reduce((max, r) => Math.max(max, r.cutoffBall > drawnBalls.length ? 0 : r.cutoffBall), 0);
    const totalBalls = lastCutoff > 0 ? lastCutoff : drawnBalls.length;

    let prevCutoff    = 0;
    let totalWinners  = 0;

    for (const result of cutoffs) {
        const { stage, cutoffBall, winners } = result;

        // Revela as bolas desde o cutoff anterior até este cutoff
        if (cutoffBall <= drawnBalls.length) {
            await startSlowReveal(gameId, drawnBalls.slice(prevCutoff, cutoffBall), totalBalls);
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

    // Caso especial: nenhum estágio teve vencedores (cutoffs todos fora do range).
    // Revela todas as bolas para evitar que o frontend caia no fallbackBalls e exiba tudo
    // de uma vez ao detectar status archived com drawnBalls WS vazio.
    if (prevCutoff === 0 && drawnBalls.length > 0) {
        await startSlowReveal(gameId, drawnBalls, totalBalls);
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
    let maxBalls        = DEFAULT_DRAW_BALLS;
    let goldenBallAfter = 0;
    let baseMultiplier  = 1;

    if (gametypeId !== '0') {
        const gtRes = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'gametypes',
            lower_bound: UInt64.from(gametypeId), upper_bound: UInt64.from(gametypeId),
            limit: 1, json: true,
        });
        if (gtRes.rows.length) {
            const gt    = gtRes.rows[0] as any;
            drawMode        = (gt.draw_mode ?? 'standard') as DrawMode;
            maxBalls        = gt.max_balls > 0 ? gt.max_balls : DEFAULT_DRAW_BALLS;
            goldenBallAfter = gt.golden_ball_after ?? 0;
            baseMultiplier  = gt.base_multiplier ?? 1;
        }
    }

    console.log(`🔍 [Orquestrador] Modo: ${drawMode} | Bolas: ${maxBalls} | Gametype: ${gametypeId}`);

    const drawnBalls = game.drawn_balls;
    let totalWinners = 0;
    const resolutionTimer = gameResolutionDuration.startTimer({ draw_mode: drawMode });

    try {
        switch (drawMode) {
            case 'fixed':
            case 'standard':
                totalWinners = await orchestrateStandard(gameId, drawnBalls, maxBalls, gametypeId, baseMultiplier);
                break;

            case 'firstfull':
                totalWinners = await orchestrateFirstFull(gameId, drawnBalls, gametypeId, baseMultiplier);
                break;

            case 'goldenball':
                totalWinners = await orchestrateGoldenBall(gameId, drawnBalls, maxBalls, goldenBallAfter, gametypeId, baseMultiplier);
                break;

            case 'multimatch':
                // Sem limite de bolas pré-estipulado: sorteio continua até todos os estágios
                // serem completados, como firstfull. max_balls não se aplica ao multimatch.
                totalWinners = await orchestrateMultiMatch(gameId, drawnBalls, gametypeId);
                break;

            default:
                console.warn(`[Orquestrador] draw_mode desconhecido: ${drawMode}. Usando standard.`);
                totalWinners = await orchestrateStandard(gameId, drawnBalls, maxBalls, gametypeId, baseMultiplier);
        }

        resolutionTimer();
        gameResolutionTotal.inc({ draw_mode: drawMode, result: 'success' });
        gameWinnersTotal.inc({ draw_mode: drawMode }, totalWinners);

    } catch (err) {
        resolutionTimer();
        gameResolutionTotal.inc({ draw_mode: drawMode, result: 'failure' });
        throw err;
    } finally {
        // Garante limpeza do índice e do reveal mesmo em caso de erro parcial
        endRevealSession(gameId);
        await deleteIndex(gameId).catch(() => {});
    }

    // Sinaliza fim do jogo para a UI (antes de criar a próxima partida)
    notifyGameEnded(gameId, drawMode, totalWinners);

    // Envia resumo da partida ao chat da sala
    const roomId = game.room_id;
    if (roomId && roomId !== '0') {
        sendGameSummaryMessage(roomId, totalWinners).catch(() => {});
    }

    // Cria próxima partida da sala (ADR-010) — APÓS o reveal completo
    await onGameResolved(gameId).catch(err =>
        console.error(`[Orquestrador] onGameResolved error (jogo ${gameId}):`, err)
    );

    console.log(`✅ [Orquestrador] Jogo ${gameId} totalmente resolvido (modo: ${drawMode}, ${totalWinners} vencedor(es)).`);
}
