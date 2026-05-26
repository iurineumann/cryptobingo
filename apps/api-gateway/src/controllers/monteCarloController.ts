// apps/api-gateway/src/controllers/monteCarloController.ts
// Motor de Simulação Monte Carlo para validação econômica de gametypes.
//
// Objetivo: estimar o RTP real de um gametype antes de ativá-lo on-chain,
// garantindo sustentabilidade da tesouraria (ADR-005 §3).
//
// Modelo matemático:
//   Uma "rodada" simula:
//     1. Um sorteio de 75 bolas via Fisher-Yates (distribuição uniforme)
//     2. N cartelas geradas aleatoriamente (distribuição BINGO por coluna)
//     3. Avaliação de cada cartela contra os padrões do gametype
//     4. Cálculo do payout: ticket_price * base_multiplier * max_weight
//
//   RTP de uma rodada = total_payout / total_wagered
//   RTP simulado = média aritmética sobre todas as rodadas
//
// Execução: worker_threads do Node.js para não bloquear o event loop.
// Limite: MAX_SIMULATIONS = 100.000 por request.
//
// O endpoint aceita os parâmetros do gametype diretamente no body,
// permitindo testar configurações antes de registrá-las on-chain.
//
// Ref: ADR-005 §3 (Motor Monte Carlo), openapi.yaml v1.3.0

import { Request, Response } from 'express';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as crypto from 'crypto';

// ==========================================
// CONFIGURAÇÃO
// ==========================================

const MAX_SIMULATIONS    = 100_000;
const DEFAULT_SIMULATIONS = 10_000;
const DEFAULT_TICKETS     = 100;   // Tickets por rodada
const DEFAULT_TICKET_PRICE = 10;   // Unidades monetárias (abstract — sem símbolo)

// Alertas de RTP (ADR-005 §3 — sustentabilidade entre 85% e 97%)
const RTP_MIN_THRESHOLD  = 0.75;  // Abaixo: risco de insolvência da tesouraria
const RTP_MAX_THRESHOLD  = 0.98;  // Acima: casa sem margem operacional

// ==========================================
// TIPOS
// ==========================================

export interface PatternRuleInput {
    pattern_id: number | string;
    name:       string;   // Nome descritivo (para o relatório)
    mask:       number;   // uint32 bitmask (25 bits)
    weight:     number;   // Multiplicador de prêmio (uint8, 1-255)
}

export interface SimulationInput {
    gametype_name:    string;
    base_multiplier:  number;    // uint8 (1-255)
    patterns:         PatternRuleInput[];
    simulations?:     number;    // Número de rodadas (1-100.000, padrão 10.000)
    tickets_per_game?: number;   // Tickets por rodada (1-500, padrão 100)
    ticket_price?:    number;    // Preço do ticket em unidades (padrão 10)
}

export interface PatternStats {
    name:             string;
    mask:             number;
    weight:           number;
    hit_count:        number;    // Número de cartelas que atingiram este padrão (como max_weight)
    hit_rate:         number;    // hit_count / total_tickets_simulated
    avg_balls_needed: number;    // Média de bolas necessárias para atingir o padrão
}

export interface SimulationResult {
    gametype_name:         string;
    simulations:           number;
    tickets_per_game:      number;
    ticket_price:          number;
    base_multiplier:       number;

    // Métricas financeiras
    rtp:                   number;   // Return to Player (0.0 – 1.0)
    rtp_pct:               string;   // "85.00%"
    ggr:                   number;   // Gross Gaming Revenue (1 - rtp)
    ggr_pct:               string;   // "15.00%"
    total_wagered:         number;   // Total apostado (simulado)
    total_paid_out:        number;   // Total pago em prêmios
    avg_payout_per_game:   number;   // Payout médio por rodada
    avg_winners_per_game:  number;   // Vencedores médios por rodada

    // Análise de padrões
    pattern_stats:         PatternStats[];

    // Alertas
    alerts:                string[];
    is_viable:             boolean;  // true se RTP está entre os thresholds

    // Metadados
    duration_ms:           number;
    computed_at:           string;
}

// ==========================================
// FUNÇÕES PURAS DO MOTOR (executadas no worker thread)
// ==========================================

/**
 * Fisher-Yates Shuffle determinístico usando crypto.randomInt.
 * Retorna um array embaralhado sem modificar o original.
 */
function fisherYatesShuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Gera uma cartela BINGO aleatória como array de 24 números.
 * Cada coluna (B,I,N,G,O) usa Fisher-Yates dentro do seu range.
 * Retorna 24 posições em ordem coluna-maior (sem FREE SPACE na pos 12).
 * Ref: SPEC.md §3.1
 */
function generateRandomMatrix(): number[] {
    const COLUMNS: [number, number][] = [
        [1,  15],  // B
        [16, 30],  // I
        [31, 45],  // N
        [46, 60],  // G
        [61, 75],  // O
    ];

    const matrix: number[] = [];

    for (let col = 0; col < 5; col++) {
        const [min, max] = COLUMNS[col];
        const pool       = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        const shuffled   = fisherYatesShuffle(pool);
        const selected   = shuffled.slice(0, 5);

        if (col !== 2) {
            matrix.push(...selected);          // B, I, G, O: 5 números
        } else {
            // Coluna N: FREE SPACE no row 2 — emite rows 0,1,3,4
            matrix.push(selected[0], selected[1], selected[3], selected[4]);
        }
    }

    return matrix; // 24 posições
}

/**
 * Aplica as bolas sorteadas a uma cartela e retorna o bitmask final.
 * Bit 12 = FREE SPACE (sempre setado: 0x00001000).
 * Ref: evaluator.ts (mesmo algoritmo)
 */
function applyBalls(matrix: number[], drawnBalls: number[]): number {
    const drawnSet = new Set(drawnBalls);
    let state = 0x00001000; // bit 12 = FREE SPACE

    for (let bitIndex = 0; bitIndex < 25; bitIndex++) {
        if (bitIndex === 12) continue;
        const matrixIdx = bitIndex < 12 ? bitIndex : bitIndex - 1;
        if (drawnSet.has(matrix[matrixIdx])) {
            state |= (1 << bitIndex);
        }
    }
    return state;
}

/**
 * Verifica todos os padrões vencedores de uma cartela.
 * Retorna o de maior weight (max_weight rule — ADR-005 §2).
 * null se nenhum padrão foi atingido.
 */
function findMaxWeightWinner(
    state:    number,
    patterns: PatternRuleInput[],
): PatternRuleInput | null {
    const stateBig = BigInt(state);
    let best: PatternRuleInput | null = null;

    for (const pattern of patterns) {
        const mask = BigInt(pattern.mask);
        if ((stateBig & mask) === mask) {
            if (!best || pattern.weight > best.weight) {
                best = pattern;
            }
        }
    }

    return best;
}

/**
 * Simula uma única rodada de bingo.
 * Retorna: payout total, vencedores e padrões atingidos.
 */
function simulateOneGame(
    patterns:       PatternRuleInput[],
    baseMultiplier: number,
    ticketPrice:    number,
    numTickets:     number,
): {
    payout:        number;
    winners:       number;
    ballsDrawn:    number;
    patternHits:   Record<string, { count: number; totalBalls: number }>;
} {
    // 1. Sorteio completo das 75 bolas
    const allBalls    = Array.from({ length: 75 }, (_, i) => i + 1);
    const drawnBalls  = fisherYatesShuffle(allBalls); // Sempre todas as 75

    let totalPayout = 0;
    let winners     = 0;
    const patternHits: Record<string, { count: number; totalBalls: number }> = {};

    // 2. Avalia cada cartela
    for (let t = 0; t < numTickets; t++) {
        const matrix = generateRandomMatrix();

        // Encontra o número mínimo de bolas para atingir algum padrão
        let winnerPattern: PatternRuleInput | null = null;
        let ballsNeeded = 0;

        for (let b = 1; b <= drawnBalls.length; b++) {
            const partialBalls = drawnBalls.slice(0, b);
            const state        = applyBalls(matrix, partialBalls);
            const winner       = findMaxWeightWinner(state, patterns);

            if (winner) {
                winnerPattern = winner;
                ballsNeeded   = b;
                break;
            }
        }

        if (winnerPattern) {
            const payout = ticketPrice * baseMultiplier * winnerPattern.weight;
            totalPayout += payout;
            winners++;

            if (!patternHits[winnerPattern.name]) {
                patternHits[winnerPattern.name] = { count: 0, totalBalls: 0 };
            }
            patternHits[winnerPattern.name].count++;
            patternHits[winnerPattern.name].totalBalls += ballsNeeded;
        }
    }

    return {
        payout:      totalPayout,
        winners,
        ballsDrawn:  drawnBalls.length,
        patternHits,
    };
}

/**
 * Núcleo da simulação Monte Carlo.
 * Executa `simulations` rodadas e agrega os resultados.
 */
function runMonteCarlo(input: SimulationInput): Omit<SimulationResult, 'duration_ms' | 'computed_at'> {
    const {
        gametype_name,
        base_multiplier,
        patterns,
        simulations    = DEFAULT_SIMULATIONS,
        tickets_per_game = DEFAULT_TICKETS,
        ticket_price   = DEFAULT_TICKET_PRICE,
    } = input;

    let totalWagered   = 0;
    let totalPaidOut   = 0;
    let totalWinners   = 0;

    // Acumuladores por padrão
    const patternAccum: Record<string, { hits: number; totalBalls: number }> = {};
    for (const p of patterns) {
        patternAccum[p.name] = { hits: 0, totalBalls: 0 };
    }

    for (let s = 0; s < simulations; s++) {
        const wageredThisGame = tickets_per_game * ticket_price;
        const game = simulateOneGame(patterns, base_multiplier, ticket_price, tickets_per_game);

        totalWagered += wageredThisGame;
        totalPaidOut += game.payout;
        totalWinners += game.winners;

        for (const [name, stats] of Object.entries(game.patternHits)) {
            if (patternAccum[name]) {
                patternAccum[name].hits       += stats.count;
                patternAccum[name].totalBalls += stats.totalBalls;
            }
        }
    }

    const totalTickets = simulations * tickets_per_game;
    const rtp          = totalWagered > 0 ? totalPaidOut / totalWagered : 0;
    const ggr          = 1 - rtp;

    // Monta estatísticas por padrão
    const patternStats: PatternStats[] = patterns.map(p => {
        const acc  = patternAccum[p.name] ?? { hits: 0, totalBalls: 0 };
        const rate = totalTickets > 0 ? acc.hits / totalTickets : 0;
        return {
            name:             p.name,
            mask:             p.mask,
            weight:           p.weight,
            hit_count:        acc.hits,
            hit_rate:         Math.round(rate * 1_000_000) / 1_000_000,
            avg_balls_needed: acc.hits > 0 ? Math.round((acc.totalBalls / acc.hits) * 10) / 10 : 0,
        };
    });

    // Alertas
    const alerts: string[] = [];
    if (rtp < RTP_MIN_THRESHOLD) {
        alerts.push(
            `⚠️  RTP ${(rtp * 100).toFixed(2)}% abaixo do mínimo recomendado ` +
            `(${(RTP_MIN_THRESHOLD * 100).toFixed(0)}%). Risco de rejeição pelos jogadores.`
        );
    }
    if (rtp > RTP_MAX_THRESHOLD) {
        alerts.push(
            `⚠️  RTP ${(rtp * 100).toFixed(2)}% acima do máximo seguro ` +
            `(${(RTP_MAX_THRESHOLD * 100).toFixed(0)}%). Tesouraria pode ficar insolvente.`
        );
    }
    if (totalWinners === 0) {
        alerts.push('🔴 Nenhuma cartela vencedora em toda a simulação. Verifique os padrões e weights.');
    }
    const noHitPatterns = patternStats.filter(p => p.hit_count === 0);
    if (noHitPatterns.length > 0) {
        alerts.push(
            `ℹ️  Padrões sem hits: ${noHitPatterns.map(p => p.name).join(', ')}. ` +
            `Podem ser muito difíceis ou mascarados por padrões de maior weight.`
        );
    }

    return {
        gametype_name,
        simulations,
        tickets_per_game,
        ticket_price,
        base_multiplier,
        rtp:                   Math.round(rtp * 1_000_000) / 1_000_000,
        rtp_pct:               `${(rtp * 100).toFixed(4)}%`,
        ggr:                   Math.round(ggr * 1_000_000) / 1_000_000,
        ggr_pct:               `${(ggr * 100).toFixed(4)}%`,
        total_wagered:         Math.round(totalWagered),
        total_paid_out:        Math.round(totalPaidOut),
        avg_payout_per_game:   Math.round((totalPaidOut / simulations) * 100) / 100,
        avg_winners_per_game:  Math.round((totalWinners / simulations) * 100) / 100,
        pattern_stats:         patternStats.sort((a, b) => b.hit_count - a.hit_count),
        alerts,
        is_viable:             rtp >= RTP_MIN_THRESHOLD && rtp <= RTP_MAX_THRESHOLD,
    };
}

// ==========================================
// WORKER THREAD — executa a simulação em thread separada
// para não bloquear o event loop do Express
// ==========================================

// Quando este módulo é executado como worker, roda a simulação e posta o resultado
if (!isMainThread) {
    const result = runMonteCarlo(workerData as SimulationInput);
    parentPort?.postMessage(result);
}

/**
 * Executa a simulação em um worker thread isolado.
 * Resolve com o resultado ou rejeita com o erro do worker.
 */
function runInWorker(input: SimulationInput): Promise<Omit<SimulationResult, 'duration_ms' | 'computed_at'>> {
    return new Promise((resolve, reject) => {
        // O worker é o próprio arquivo compilado — carrega o mesmo módulo
        const workerPath = __filename;

        const worker = new Worker(workerPath, {
            workerData: input,
            // Permite importar módulos do workspace no worker
            execArgv:   ['-r', 'ts-node/register'],
        });

        worker.once('message', resolve);
        worker.once('error',   reject);
        worker.once('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker encerrou com código ${code}`));
            }
        });
    });
}

// ==========================================
// CONTROLLER
// ==========================================

/**
 * POST /api/v1/admin/simulate-weights
 *
 * Executa simulação Monte Carlo para um gametype e retorna métricas de RTP,
 * distribuição de padrões e alertas de sustentabilidade.
 *
 * Body: {
 *   gametype_name:    string,
 *   base_multiplier:  number,        // 1-255
 *   patterns: [{
 *     pattern_id:  number,
 *     name:        string,
 *     mask:        number,           // uint32 bitmask 25 bits
 *     weight:      number,           // 1-255
 *   }],
 *   simulations?:      number,       // 1-100.000 (padrão 10.000)
 *   tickets_per_game?: number,       // 1-500 (padrão 100)
 *   ticket_price?:     number,       // unidades abstratas (padrão 10)
 * }
 *
 * Retorna: SimulationResult completo com RTP, GGR, estatísticas por padrão e alertas.
 * Ref: ADR-005 §3
 */
export async function simulateWeights(req: Request, res: Response): Promise<void> {
    const {
        gametype_name,
        base_multiplier,
        patterns,
        simulations,
        tickets_per_game,
        ticket_price,
    } = req.body as SimulationInput;

    // ── Validações ────────────────────────────────────────────────────────────

    if (!gametype_name || typeof gametype_name !== 'string') {
        res.status(400).json({ error: 'Campo "gametype_name" é obrigatório.' });
        return;
    }

    if (!base_multiplier || typeof base_multiplier !== 'number' || base_multiplier < 1 || base_multiplier > 255) {
        res.status(400).json({ error: '"base_multiplier" deve ser um inteiro entre 1 e 255.' });
        return;
    }

    if (!Array.isArray(patterns) || patterns.length === 0 || patterns.length > 12) {
        res.status(400).json({ error: '"patterns" deve ser um array de 1 a 12 elementos.' });
        return;
    }

    for (const p of patterns) {
        if (!p.name || typeof p.mask !== 'number' || p.mask <= 0 || p.mask >= (1 << 25)) {
            res.status(400).json({ error: 'Cada pattern deve ter name, mask (uint32 ≤ 25 bits) e weight.' });
            return;
        }
        if (typeof p.weight !== 'number' || p.weight < 1 || p.weight > 255) {
            res.status(400).json({ error: '"weight" de cada pattern deve ser um inteiro entre 1 e 255.' });
            return;
        }
    }

    const numSims = Math.min(Number(simulations ?? DEFAULT_SIMULATIONS), MAX_SIMULATIONS);
    if (numSims < 1) {
        res.status(400).json({ error: '"simulations" deve ser pelo menos 1.' });
        return;
    }

    const numTickets = Math.min(Number(tickets_per_game ?? DEFAULT_TICKETS), 500);
    if (numTickets < 1) {
        res.status(400).json({ error: '"tickets_per_game" deve ser pelo menos 1.' });
        return;
    }

    // ── Estimativa de tempo de execução ──────────────────────────────────────
    // ~10ms por 1000 rodadas com 100 tickets é uma estimativa conservadora.
    // Avisa se a simulação pode ser lenta.
    const estimatedMs = (numSims * numTickets) / 1000;
    if (estimatedMs > 30_000) {
        res.status(400).json({
            error: `Simulação estimada em ~${Math.round(estimatedMs / 1000)}s excede o limite de 30s. ` +
                   `Reduza "simulations" (${numSims}) ou "tickets_per_game" (${numTickets}).`,
            estimated_ms: Math.round(estimatedMs),
        });
        return;
    }

    // ── Execução ──────────────────────────────────────────────────────────────

    const input: SimulationInput = {
        gametype_name,
        base_multiplier,
        patterns,
        simulations:     numSims,
        tickets_per_game: numTickets,
        ticket_price:    Number(ticket_price ?? DEFAULT_TICKET_PRICE),
    };

    console.log(
        `🎲 [MonteCarlo] Iniciando "${gametype_name}": ` +
        `${numSims} rodadas × ${numTickets} tickets...`
    );

    const startMs = Date.now();

    try {
        // Simulações pequenas (<= 5.000 rodadas): roda inline para evitar overhead de Worker
        // Simulações grandes: worker thread para não bloquear o event loop
        let result: Omit<SimulationResult, 'duration_ms' | 'computed_at'>;

        if (numSims <= 5_000) {
            result = runMonteCarlo(input);
        } else {
            result = await runInWorker(input);
        }

        const duration_ms = Date.now() - startMs;

        const finalResult: SimulationResult = {
            ...result,
            duration_ms,
            computed_at: new Date().toISOString(),
        };

        console.log(
            `✅ [MonteCarlo] "${gametype_name}" concluído em ${duration_ms}ms — ` +
            `RTP: ${finalResult.rtp_pct}, GGR: ${finalResult.ggr_pct}, ` +
            `Viável: ${finalResult.is_viable}`
        );

        res.status(200).json(finalResult);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[MonteCarlo] Erro durante simulação:', err);
        res.status(500).json({ error: `Erro durante a simulação: ${msg}` });
    }
}
