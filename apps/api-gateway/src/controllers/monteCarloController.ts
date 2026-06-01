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
//     4. Cálculo do payout: ticket_price * base_multiplier * max_weight / 100
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

const MAX_SIMULATIONS     = 100_000;
const DEFAULT_SIMULATIONS  = 10_000;
const DEFAULT_TICKETS      = 100;
const DEFAULT_TICKET_PRICE = 10;

const RTP_MIN_THRESHOLD  = 0.75;
const RTP_MAX_THRESHOLD  = 0.98;

// ── Calibração algébrica (separação descoberta × ajuste) ─────────────────────
const DISCOVERY_SIMS     = 100_000;   // Fase 1: lote único de descoberta de P_i
const CALIB_ALPHA        = 0.1;       // Fase 3: taxa de aprendizado inicial
const CALIB_ALPHA_DECAY  = 0.99;      // Fase 3: decaimento de alpha por iteração
const CALIB_MAX_ITER     = 300;       // Fase 3: máx de iterações
const CALIB_TOLERANCE    = 0.005;     // Fase 3: convergência ±0.5%
const VALIDATION_SIMS    = 10_000;    // Fase 4: prova dos nove
// Sem teto de vidro: pesos livres para acomodar P_i microscópico (ex: MASTER com 35 bolas)
const CALIB_WEIGHT_MIN   = 1;         // mínimo absoluto
const CALIB_WEIGHT_MAX   = 100_000_000; // 100 milhões — garante convergência matemática

// ── Fase 3b — Refinamento Estocástico Interno ──────────────────────────
// Mini-sims corrigem o gap entre RTP algébrico (soma independente) e RTP real (max_weight)
const REFINE_SIMS          = 2_000;   // mini-sims por iteração do refinamento
const REFINE_MAX_ITER      = 10;      // máx iterações do refinamento
const REFINE_TOLERANCE     = 0.01;    // ±1% de tolerância no RTP medido
const MAX_RETRIES          = 3;       // retentativas automáticas c/ amostras maiores
const RETRY_SIM_MULTIPLIER = 2;       // multiplicador de amostras por retry

// ==========================================
// TIPOS
// ==========================================

export interface PatternRuleInput {
    pattern_id:   number | string;
    name:         string;   // Nome descritivo (para o relatório)
    mask:         number;   // uint32 bitmask (25 bits)
    weight:       number;   // hundredths (1.00=100, 1.50=150, max 255.00=25500)
    pattern_type?: string;  // 'simple' | 'special' | 'master' — usado por combos n_of_type
}

export interface CombinationClauseInput {
    type:          'all_of' | 'any_of' | 'n_of_type';
    pattern_ids?:  string[];
    pattern_type?: string;
    count?:        number;
}

export interface CombinationRuleInput {
    name:    string;
    weight:  number;
    clauses: CombinationClauseInput[];
}

export interface SimulationInput {
    gametype_name:    string;
    base_multiplier:  number;    // uint8 (1-255)
    patterns:         PatternRuleInput[];
    combinations?:    CombinationRuleInput[];
    simulations?:     number;    // Número de rodadas (1-100.000, padrão 10.000)
    tickets_per_game?: number;   // Tickets por rodada (1-500, padrão 100)
    ticket_price?:    number;    // Preço do ticket em unidades (padrão 10)
    max_balls?:       number;    // Limite de bolas por rodada (1-75, padrão 75 = todas)
                                 // Valores menores modelam jogos que encerram cedo (1ª vitória)
                                 // e produzem hit_rates realistas (< 100%) para calibração de RTP.
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

// ── Tipos do endpoint de calibração ──────────────────────────────────────────

export interface CalibrateWeightsInput {
    gametype_name:     string;
    base_multiplier:   number;
    patterns:          PatternRuleInput[];
    combinations?:     CombinationRuleInput[];
    tickets_per_game?: number;
    ticket_price?:     number;
    max_balls?:        number;
    target_rtp?:       number;      // padrão 0.85
    discovery_sims?:   number;      // Fase 1 — padrão 20_000
    alpha?:            number;      // taxa de aprendizado — padrão 0.1
    tolerance?:        number;      // convergência — padrão 0.005
    max_iter?:         number;      // iterações máx — padrão 300
    validation_sims?:  number;      // Fase 4 — padrão 10_000
}

export interface ItemCalibration {
    name:        string;
    probability: number;   // P_i pós Laplace
    weight:      number;   // peso calibrado em hundredths
}

export interface CalibrateWeightsResult {
    gametype_name:        string;
    target_rtp:           number;
    algebraic_rtp:        number;   // RTP teórico do modelo algébrico (Fase 3)
    algebraic_rtp_pct:    string;
    iterations:           number;
    converged:            boolean;
    pattern_weights:      Record<string, number>;  // name → hundredths
    combo_weights:        Record<string, number>;
    calibrations:         ItemCalibration[];
    validation:           SimulationResult;
    refinement_iters:     number;   // iterações do refinamento estocástico (Fase 3b)
    refinement_converged: boolean;  // se o refinamento convergiu
    retries:              number;   // quantas retentativas foram necessárias
    duration_ms:          number;
    computed_at:          string;
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
 * Encontra todos os padrões individuais que uma cartela atingiu.
 * Usa aritmética 32-bit direta — máscaras são uint25 (cabem em int32 com sinal).
 */
function findMatchingPatterns(
    state:    number,
    patterns: PatternRuleInput[],
): PatternRuleInput[] {
    const matched: PatternRuleInput[] = [];
    for (const p of patterns) {
        if ((state & p.mask) === p.mask) matched.push(p);
    }
    return matched;
}

/**
 * Avalia combinações contra os padrões individuais já atingidos.
 * Retorna a de maior weight (ou null se nenhuma combinação foi satisfeita).
 * Pré-computa Set de IDs e contagem por tipo para evitar varreduras repetidas.
 */
function evaluateCombinations(
    matched:      PatternRuleInput[],
    combinations: CombinationRuleInput[],
): CombinationRuleInput | null {
    // Pré-computação O(N) uma vez, ao invés de O(N×C×K) no loop
    const matchedIds = new Set(matched.map(m => String(m.pattern_id)));
    const typeCount: Record<string, number> = {};
    for (const m of matched) {
        if (m.pattern_type) typeCount[m.pattern_type] = (typeCount[m.pattern_type] ?? 0) + 1;
    }

    let best: CombinationRuleInput | null = null;
    for (const combo of combinations) {
        let ok = true;
        for (const clause of combo.clauses) {
            if (clause.type === 'all_of') {
                ok = (clause.pattern_ids ?? []).every(pid => matchedIds.has(pid));
            } else if (clause.type === 'any_of') {
                ok = (clause.pattern_ids ?? []).some(pid => matchedIds.has(pid));
            } else if (clause.type === 'n_of_type') {
                ok = (typeCount[clause.pattern_type ?? ''] ?? 0) >= (clause.count ?? 1);
            }
            if (!ok) break;
        }
        if (ok && (!best || combo.weight > best.weight)) best = combo;
    }
    return best;
}

/**
 * Verifica todos os padrões e combinações vencedores de uma cartela.
 * Retorna o de maior weight (max_weight rule — ADR-005 §2).
 * null se nenhum padrão foi atingido.
 */
function findBestWinner(
    state:       number,
    patterns:    PatternRuleInput[],
    combinations?: CombinationRuleInput[],
): { name: string; weight: number } | null {
    const matched = findMatchingPatterns(state, patterns);
    if (matched.length === 0) return null;

    // Best individual pattern
    let bestName   = matched[0].name;
    let bestWeight = matched[0].weight;
    for (let i = 1; i < matched.length; i++) {
        if (matched[i].weight > bestWeight) {
            bestName   = matched[i].name;
            bestWeight = matched[i].weight;
        }
    }

    // Check combinations
    if (combinations && combinations.length > 0) {
        const bestCombo = evaluateCombinations(matched, combinations);
        if (bestCombo && bestCombo.weight > bestWeight) {
            bestName   = bestCombo.name;
            bestWeight = bestCombo.weight;
        }
    }

    return { name: bestName, weight: bestWeight };
}

/**
 * Simula uma única rodada de bingo.
 * Retorna: payout total, vencedores e padrões/combinações atingidos.
 *
 * `maxBalls`: limita quantas bolas são reveladas por rodada (default: todas as 75).
 * Valores menores (ex: 45) modelam jogos que encerram quando o primeiro jogador vence —
 * produzindo hit_rates realistas (< 100%) que permitem calibração de RTP abaixo de 100%.
 *
 * Otimização: estado incremental com ballToBit map (O(n_balls) por cartela).
 */
function simulateOneGame(
    patterns:       PatternRuleInput[],
    baseMultiplier: number,
    ticketPrice:    number,
    numTickets:     number,
    combinations?:  CombinationRuleInput[],
    maxBalls?:      number,
): {
    payout:        number;
    winners:       number;
    ballsDrawn:    number;
    patternHits:   Record<string, { count: number; totalBalls: number }>;
} {
    const allBalls   = Array.from({ length: 75 }, (_, i) => i + 1);
    const drawnBalls = fisherYatesShuffle(allBalls);
    // Limite de bolas por rodada — modela jogos que encerram antes de revelar todas as 75.
    // Com max_balls < 75, padrões difíceis têm hit_rate < 100%, permitindo calibração de RTP.
    const ballLimit  = Math.min(drawnBalls.length, maxBalls ?? drawnBalls.length);

    let totalPayout = 0;
    let winners     = 0;
    const patternHits: Record<string, { count: number; totalBalls: number }> = {};

    for (let t = 0; t < numTickets; t++) {
        const matrix = generateRandomMatrix();

        // Pré-computa bola → bitIndex para esta cartela (evita busca linear a cada bola)
        // matrixIdx 0-11 → bitIndex 0-11 ; matrixIdx 12-23 → bitIndex 13-24 (pula bit 12 = FREE)
        const ballToBit = new Map<number, number>();
        for (let mi = 0; mi < 24; mi++) {
            ballToBit.set(matrix[mi], mi < 12 ? mi : mi + 1);
        }

        let state        = 0x00001000; // bit 12 = FREE SPACE sempre ativo
        let winnerName   = '';
        let winnerWeight = 0;
        let ballsNeeded  = 0;

        for (let b = 0; b < ballLimit; b++) {
            const bit = ballToBit.get(drawnBalls[b]);
            if (bit !== undefined) state |= (1 << bit);

            const winner = findBestWinner(state, patterns, combinations);
            if (winner) {
                winnerName   = winner.name;
                winnerWeight = winner.weight;
                ballsNeeded  = b + 1;
                break;
            }
        }

        if (winnerWeight > 0) {
            const payout = ticketPrice * baseMultiplier * winnerWeight / 100;
            totalPayout += payout;
            winners++;
            if (!patternHits[winnerName]) patternHits[winnerName] = { count: 0, totalBalls: 0 };
            patternHits[winnerName].count++;
            patternHits[winnerName].totalBalls += ballsNeeded;
        }
    }

    return { payout: totalPayout, winners, ballsDrawn: ballLimit, patternHits };
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
        combinations = [],
        simulations    = DEFAULT_SIMULATIONS,
        tickets_per_game = DEFAULT_TICKETS,
        ticket_price   = DEFAULT_TICKET_PRICE,
        max_balls,
    } = input;

    let totalWagered   = 0;
    let totalPaidOut   = 0;
    let totalWinners   = 0;

    // Acumuladores por padrão + combinação
    const patternAccum: Record<string, { hits: number; totalBalls: number }> = {};
    for (const p of patterns) {
        patternAccum[p.name] = { hits: 0, totalBalls: 0 };
    }
    for (const c of combinations) {
        patternAccum[c.name] = { hits: 0, totalBalls: 0 };
    }

    for (let s = 0; s < simulations; s++) {
        const wageredThisGame = tickets_per_game * ticket_price;
        const game = simulateOneGame(patterns, base_multiplier, ticket_price, tickets_per_game, combinations, max_balls);

        totalWagered += wageredThisGame;
        totalPaidOut += game.payout;
        totalWinners += game.winners;

        for (const [name, stats] of Object.entries(game.patternHits)) {
            if (patternAccum[name]) {
                patternAccum[name].hits       += stats.count;
                patternAccum[name].totalBalls += stats.totalBalls;
            } else {
                patternAccum[name] = { hits: stats.count, totalBalls: stats.totalBalls };
            }
        }
    }

    const totalTickets = simulations * tickets_per_game;
    const rtp          = totalWagered > 0 ? totalPaidOut / totalWagered : 0;
    const ggr          = 1 - rtp;

    // Monta estatísticas por padrão (individuais + combinações)
    const allNames = new Set<string>();
    for (const p of patterns)    allNames.add(p.name);
    for (const c of combinations) allNames.add(c.name);
    const patternStats: PatternStats[] = [];
    for (const name of allNames) {
        const acc  = patternAccum[name] ?? { hits: 0, totalBalls: 0 };
        const rate = totalTickets > 0 ? acc.hits / totalTickets : 0;
        patternStats.push({
            name,
            mask:             0,
            weight:           0,
            hit_count:        acc.hits,
            hit_rate:         Math.round(rate * 1_000_000) / 1_000_000,
            avg_balls_needed: acc.hits > 0 ? Math.round((acc.totalBalls / acc.hits) * 10) / 10 : 0,
        });
    }

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

// Worker dispatch — discrimina pelo campo workerMode (retrocompatível):
//   workerMode ausente ou 'simulate' → runMonteCarlo (comportamento original)
//   workerMode 'discover'            → discoverHitRates (Fase 1)
if (!isMainThread) {
    const payload = workerData as any;
    if (payload?.workerMode === 'discover') {
        const rates = discoverHitRates(
            payload.patterns,
            payload.combinations ?? [],
            payload.sims,
            payload.ticketsPerGame,
            payload.maxBalls,
        );
        parentPort?.postMessage(rates);
    } else {
        // Retrocompatível: workerData pode ser SimulationInput direto ou { data: SimulationInput }
        const input: SimulationInput = payload?.data ?? payload;
        const result = runMonteCarlo(input);
        parentPort?.postMessage(result);
    }
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
// FASE 1 — DESCOBERTA EMPÍRICA (INDEPENDENTE)
//
// Mede P_i de cada padrão/combinação SEM aplicar max_weight.
// Cada cartela contribui para TODOS os padrões que satisfaz,
// dando probabilidades brutas para o modelo algébrico.
// ==========================================

function discoverHitRates(
    patterns:       PatternRuleInput[],
    combinations:   CombinationRuleInput[],
    sims:           number,
    ticketsPerGame: number,
    maxBalls?:      number,
): Record<string, number> {
    const hits:         Record<string, number> = {};
    const totalTickets  = sims * ticketsPerGame;
    const ballLimit     = Math.min(maxBalls ?? 75, 75);

    for (let s = 0; s < sims; s++) {
        const allBalls   = Array.from({ length: 75 }, (_, i) => i + 1);
        const drawnBalls = fisherYatesShuffle(allBalls);

        for (let t = 0; t < ticketsPerGame; t++) {
            const matrix    = generateRandomMatrix();
            const ballToBit = new Map<number, number>();
            for (let mi = 0; mi < 24; mi++) {
                ballToBit.set(matrix[mi], mi < 12 ? mi : mi + 1);
            }

            let state = 0x00001000;
            for (let b = 0; b < ballLimit; b++) {
                const bit = ballToBit.get(drawnBalls[b]);
                if (bit !== undefined) state |= (1 << bit);
            }

            // Registra TODOS os padrões individuais satisfeitos
            const matched = findMatchingPatterns(state, patterns);
            for (const p of matched) {
                hits[p.name] = (hits[p.name] ?? 0) + 1;
            }
            // Registra a melhor combinação satisfeita
            if (combinations.length > 0 && matched.length > 0) {
                const combo = evaluateCombinations(matched, combinations);
                if (combo) hits[combo.name] = (hits[combo.name] ?? 0) + 1;
            }
        }
    }

    const rates: Record<string, number> = {};
    for (const p of patterns)    rates[p.name] = (hits[p.name] ?? 0) / totalTickets;
    for (const c of combinations) rates[c.name] = (hits[c.name] ?? 0) / totalTickets;
    return rates;
}

function discoverInWorker(
    patterns:       PatternRuleInput[],
    combinations:   CombinationRuleInput[],
    sims:           number,
    ticketsPerGame: number,
    maxBalls?:      number,
): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: { workerMode: 'discover', patterns, combinations, sims, ticketsPerGame, maxBalls },
            execArgv:   ['-r', 'ts-node/register'],
        });
        worker.once('message', resolve);
        worker.once('error',   reject);
        worker.once('exit', code => {
            if (code !== 0) reject(new Error(`Worker de descoberta encerrou com código ${code}`));
        });
    });
}

// ==========================================
// FASE 3 — CALIBRAÇÃO ALGÉBRICA (EM MEMÓRIA)
//
// RTP algébrico: RTP = (base_mul/100) × Σ_i(P_i × w_i)
//
// Inicialização inversa: w_i = 1/P_i
//   → Σ(P_i × w_i) = N   →  RTP_inicial = (base_mul/100) × N
//   Garante que cada item contribui igualmente em probabilidade.
//
// Rácio de escala global por iteração:
//   scale = target_rtp / currentRtp
//   w_i_ideal = w_i × scale        (escala proporcional — preserva diferenças relativas)
//   w_i_new   = w_i + α × (w_i_ideal − w_i)   (gradient descent amortecido)
//   α         = α × CALIB_ALPHA_DECAY          (decaimento evita overshooting tardio)
//
// Sem teto de vidro: pesos livres em [1, 100M] para acomodar P_master ≈ 0.
// ==========================================

function computeAlgebraicRtp(
    probs:   Record<string, number>,
    weights: Record<string, number>,
    baseMul: number,
): number {
    let sum = 0;
    for (const [name, p] of Object.entries(probs)) {
        sum += p * (weights[name] ?? 0);
    }
    return (baseMul / 100) * sum;
}

function runAlgebraicCalibration(
    probs:       Record<string, number>,
    initWeights: Record<string, number>,
    baseMul:     number,
    targetRtp:   number,
    alpha:       number,
    maxIter:     number,
    tolerance:   number,
): { weights: Record<string, number>; iterations: number; algebraicRtp: number; converged: boolean } {
    const weights = { ...initWeights };

    // ── Inicialização inversa: w_i = 1/P_i ────────────────────────────────
    // Propriedade: Σ(P_i × 1/P_i) = N → RTP_inicial = (baseMul/100) × N.
    // O rácio de escala da 1ª iteração corrige para targetRtp em um único passo
    // quando nenhum peso é clampado; o loop lida com os clamps residuais.
    for (const name of Object.keys(weights)) {
        const p = probs[name];
        const w_inv = 1 / p;
        weights[name] = Math.max(CALIB_WEIGHT_MIN, Math.min(CALIB_WEIGHT_MAX, w_inv));
    }

    let iterations = 0;
    let rtp        = computeAlgebraicRtp(probs, weights, baseMul);
    let converged  = Math.abs(rtp - targetRtp) <= tolerance;
    let currentAlpha = alpha;

    while (iterations < maxIter && !converged) {
        iterations++;

        // ── Rácio de escala global ─────────────────────────────────────────
        // scale escalona TODOS os pesos simultaneamente.
        // Preserva proporções relativas (padrões difíceis continuam pagando mais).
        const scale = targetRtp / (rtp || 1e-9);

        for (const name of Object.keys(weights)) {
            const w_ideal = weights[name] * scale;
            const w_clamped = Math.max(CALIB_WEIGHT_MIN, Math.min(CALIB_WEIGHT_MAX, w_ideal));
            weights[name] = Math.max(CALIB_WEIGHT_MIN, Math.min(CALIB_WEIGHT_MAX,
                weights[name] + currentAlpha * (w_clamped - weights[name])
            ));
        }

        // ── Decaimento de alpha ────────────────────────────────────────────
        // Evita oscillação nas iterações tardias quando os pesos estão próximos do alvo.
        currentAlpha *= CALIB_ALPHA_DECAY;

        rtp       = computeAlgebraicRtp(probs, weights, baseMul);
        converged = Math.abs(rtp - targetRtp) <= tolerance;
    }

    return { weights, iterations, algebraicRtp: rtp, converged };
}

// ==========================================
// FASE 3b — REFINAMENTO ESTOCÁSTICO INTERNO
//
// O modelo algébrico (Fase 3) assume independência: RTP = (base_mul/100) × Σ(P_i × w_i).
// Na prática, a regra max_weight faz cada cartela pagar apenas o padrão de maior peso,
// então padrões que frequentemente co-ocorrem "cancelam" contribuições uns dos outros.
//
// Esta fase executa mini-sims Monte Carlo reais (com max_weight), mede o RTP empírico,
// e aplica escala global nos pesos para fechar o gap entre teoria e realidade.
// ==========================================

function runStochasticRefinement(
    initialWeights: Record<string, number>,
    patterns:       PatternRuleInput[],
    combinations:   CombinationRuleInput[],
    baseMul:        number,
    ticketPrice:    number,
    ticketsPerGame: number,
    targetRtp:      number,
    maxBalls:       number | undefined,
    simsPerIter:    number,
    maxIter:        number,
    tolerance:      number,
): { weights: Record<string, number>; iterations: number; finalRtp: number; converged: boolean } {
    const weights    = { ...initialWeights };
    let measuredRtp  = 0;
    let converged    = false;
    let iterations   = 0;

    for (let iter = 0; iter < maxIter; iter++) {
        const pWith = patterns.map(p => ({ ...p, weight: Math.round(weights[p.name] ?? 100) }));
        const cWith = combinations.map(c => ({ ...c, weight: Math.round(weights[c.name] ?? 100) }));

        const result = runMonteCarlo({
            gametype_name:     'refinement',
            base_multiplier:   baseMul,
            patterns:          pWith,
            combinations:      cWith,
            simulations:       simsPerIter,
            tickets_per_game:  ticketsPerGame,
            ticket_price:      ticketPrice,
            max_balls:         maxBalls,
        });

        measuredRtp = result.rtp;
        iterations++;
        converged = Math.abs(measuredRtp - targetRtp) <= tolerance;

        if (converged || iterations >= maxIter) break;

        // Escala global: corrige o gap do max_weight em um passo
        // A relação RTP × peso é aproximadamente linear (max_weight escala com o peso),
        // então uma única escala já fecha a maior parte do gap.
        const scale = targetRtp / (measuredRtp || 1e-9);
        for (const name of Object.keys(weights)) {
            weights[name] = Math.max(CALIB_WEIGHT_MIN, Math.min(CALIB_WEIGHT_MAX,
                Math.round(weights[name] * scale)
            ));
        }
    }

    return { weights, iterations, finalRtp: measuredRtp, converged };
}

// ==========================================
// CONTROLLER — calibrateWeights
// POST /api/v1/admin/calibrate-weights
//
// Implementa as 4 fases do motor de calibração:
//   Fase 1 — descoberta empírica (lote massivo único, sem max_weight)
//   Fase 2 — suavização de Laplace (injeta epsilon em P_i = 0)
//   Fase 3 — calibração algébrica em memória (sem RNG)
//   Fase 4 — validação estocástica final (prova dos nove)
// ==========================================

export async function calibrateWeights(req: Request, res: Response): Promise<void> {
    const {
        gametype_name,
        base_multiplier,
        patterns,
        combinations   = [],
        tickets_per_game,
        ticket_price,
        max_balls,
        target_rtp     = 0.85,
        discovery_sims = DISCOVERY_SIMS,
        alpha          = CALIB_ALPHA,
        tolerance      = CALIB_TOLERANCE,
        max_iter       = CALIB_MAX_ITER,
        validation_sims = VALIDATION_SIMS,
    } = req.body as CalibrateWeightsInput;

    // ── Validações básicas ────────────────────────────────────────────────────
    if (!gametype_name || !base_multiplier || !Array.isArray(patterns) || patterns.length === 0) {
        res.status(400).json({ error: 'gametype_name, base_multiplier e patterns são obrigatórios.' });
        return;
    }
    if (target_rtp <= 0 || target_rtp >= 1) {
        res.status(400).json({ error: 'target_rtp deve estar entre 0 e 1 (ex: 0.85).' });
        return;
    }

    const numTickets    = Math.min(Number(tickets_per_game ?? DEFAULT_TICKETS), 500);
    const tPrice        = Number(ticket_price ?? DEFAULT_TICKET_PRICE);
    const numBalls      = max_balls != null ? Math.max(1, Math.min(75, Number(max_balls))) : undefined;
    const discSims      = Math.min(Number(discovery_sims), MAX_SIMULATIONS);
    const valSims       = Math.min(Number(validation_sims), MAX_SIMULATIONS);

    const startMs = Date.now();

    console.log(
        `🔬 [Calibração] "${gametype_name}": ` +
        `Fase1=${discSims} sims, target=${(target_rtp * 100).toFixed(0)}%, ` +
        `α=${alpha}, maxBalls=${numBalls ?? 75}`
    );

    try {
        // ── FASE 1: Descoberta Empírica ───────────────────────────────────────
        console.log(`   ⚗️  Fase 1: descoberta de probabilidades (${discSims} rodadas)...`);
        const rawRates: Record<string, number> = discSims > 5_000
            ? await discoverInWorker(patterns, combinations, discSims, numTickets, numBalls)
            : discoverHitRates(patterns, combinations, discSims, numTickets, numBalls);

        // ── FASE 2: Suavização de Laplace (epsilon realista) ──────────────────
        // epsilon = 1 acerto no universo total de testes (não um valor fixo arbitrário).
        // Para P_master ≈ 0, isso ancora o peso em ~100M — finito, mas maciço.
        const epsilon = 1 / (discSims * numTickets);
        const probs: Record<string, number> = {};
        for (const [name, rate] of Object.entries(rawRates)) {
            probs[name] = rate > 0 ? rate : epsilon;
        }
        const zeroItems = Object.values(rawRates).filter(r => r === 0).length;
        if (zeroItems > 0) {
            console.log(`   🧂 Fase 2: epsilon realista (${epsilon.toExponential(2)}) injetado em ${zeroItems} item(ns) com P=0.`);
        }

        // ── FASE 3: Calibração Algébrica (rácio de escala global) ────────────
        console.log(`   📐 Fase 3: calibração algébrica (α=${alpha}, decay=${CALIB_ALPHA_DECAY}, tol=${tolerance})...`);
        const allNames    = Object.keys(probs);
        const initWeights = Object.fromEntries(allNames.map(n => [n, 100]));

        const cal = runAlgebraicCalibration(
            probs, initWeights, base_multiplier, target_rtp, alpha, max_iter, tolerance,
        );

        console.log(
            `   ✔  Fase 3: ${cal.iterations} iter, RTP algébrico = ${(cal.algebraicRtp * 100).toFixed(2)}%, ` +
            `convergido = ${cal.converged}`
        );

        // ── FASE 3b: Refinamento Estocástico Interno + FASE 4 c/ retentativas ──
        // O RTP algébrico superestima porque trata padrões como independentes.
        // Na prática (max_weight), cada cartela paga apenas o maior peso,
        // então padrões que co-ocorrem "cancelam" contribuições uns dos outros.
        // Fase 3b usa mini-sims reais (com max_weight) para medir o gap e aplicar
        // escala corretiva. Se o resultado final não for viável, retenta c/ amostras maiores.

        let refinedWeights     = { ...cal.weights };
        let bestRefineIter     = 0;
        let bestRefineConvg    = false;
        let retriesUsed        = 0;
        let currentRefineSims  = REFINE_SIMS;
        let currentValSims     = valSims;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const label = attempt === 0 ? '' : ` (retry ${attempt})`;

            // ── FASE 3b: Refinamento Estocástico ─────────────────────────────
            console.log(`   🔄 Fase 3b${label}: refinamento estocástico (${currentRefineSims} sims/iter, max ${REFINE_MAX_ITER} iters)...`);

            const refinement = runStochasticRefinement(
                refinedWeights, patterns, combinations,
                base_multiplier, tPrice, numTickets, target_rtp, numBalls,
                currentRefineSims, REFINE_MAX_ITER, REFINE_TOLERANCE,
            );

            refinedWeights  = refinement.weights;
            bestRefineIter  = refinement.iterations;
            bestRefineConvg = refinement.converged;

            console.log(
                `   ✔  Fase 3b${label}: ${refinement.iterations} iter, ` +
                `RTP medido = ${(refinement.finalRtp * 100).toFixed(2)}%, ` +
                `convergido = ${refinement.converged}`
            );

            // Separa pesos de padrões e combinações para a validação
            const patternWeights: Record<string, number> = {};
            const comboWeights:   Record<string, number> = {};
            for (const p of patterns)    patternWeights[p.name] = refinedWeights[p.name] ?? 100;
            for (const c of combinations) comboWeights[c.name]  = refinedWeights[c.name] ?? 100;

            const calibratedPatterns    = patterns.map(p => ({ ...p, weight: patternWeights[p.name] }));
            const calibratedCombinations = combinations.map(c => ({ ...c, weight: comboWeights[c.name] }));

            // ── FASE 4: Validação Estocástica ───────────────────────────────
            console.log(`   🎲 Fase 4${label}: validação Monte Carlo (${currentValSims} rodadas)...`);

            const validationInput: SimulationInput = {
                gametype_name,
                base_multiplier,
                patterns:        calibratedPatterns,
                combinations:    calibratedCombinations,
                simulations:     currentValSims,
                tickets_per_game: numTickets,
                ticket_price:    tPrice,
                max_balls:       numBalls,
            };

            let validationRaw: Omit<SimulationResult, 'duration_ms' | 'computed_at'>;
            if (currentValSims > 5_000) {
                validationRaw = await runInWorker(validationInput);
            } else {
                validationRaw = runMonteCarlo(validationInput);
            }

            const validation: SimulationResult = {
                ...validationRaw,
                duration_ms:  Date.now() - startMs,
                computed_at:  new Date().toISOString(),
            };

            // Se viável ou última tentativa, monta resultado final e retorna
            if (validationRaw.is_viable || attempt >= MAX_RETRIES) {
                const calibrations: ItemCalibration[] = allNames.map(name => ({
                    name,
                    probability: probs[name],
                    weight:      refinedWeights[name] ?? 100,
                }));

                const result: CalibrateWeightsResult = {
                    gametype_name,
                    target_rtp,
                    algebraic_rtp:      Math.round(cal.algebraicRtp * 1_000_000) / 1_000_000,
                    algebraic_rtp_pct:  `${(cal.algebraicRtp * 100).toFixed(4)}%`,
                    iterations:         cal.iterations,
                    converged:          cal.converged,
                    pattern_weights:    patternWeights,
                    combo_weights:      comboWeights,
                    calibrations,
                    validation,
                    refinement_iters:     bestRefineIter,
                    refinement_converged: bestRefineConvg,
                    retries:              retriesUsed,
                    duration_ms:          Date.now() - startMs,
                    computed_at:          new Date().toISOString(),
                };

                console.log(
                    `✅ [Calibração] "${gametype_name}" concluída em ${result.duration_ms}ms — ` +
                    `RTP validação: ${validation.rtp_pct}, Viável: ${validation.is_viable}` +
                    (retriesUsed > 0 ? ` (${retriesUsed} retentativa(s))` : '')
                );

                res.status(200).json(result);
                return;
            }

            // Não viável → prepara próxima tentativa com amostras maiores
            console.log(`   ⏫ Fase 4 não convergiu — retry ${attempt + 1} com amostras maiores (×${RETRY_SIM_MULTIPLIER})...`);
            currentRefineSims = Math.min(currentRefineSims * RETRY_SIM_MULTIPLIER, MAX_SIMULATIONS);
            currentValSims    = Math.min(currentValSims * RETRY_SIM_MULTIPLIER, MAX_SIMULATIONS);
            retriesUsed       = attempt + 1;
        }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Calibração] Erro:', err);
        res.status(500).json({ error: `Erro durante a calibração: ${msg}` });
    }
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
 *     pattern_id:    number,
 *     name:          string,
 *     mask:          number,         // uint32 bitmask 25 bits
 *     weight:        number,         // hundredths (1.00=100, max 255.00=25500)
 *     pattern_type?: string,         // 'simple' | 'special' | 'master'
 *   }],
 *   combinations?: [{               // combinações avaliadas após patterns individuais
 *     name:    string,
 *     weight:  number,               // hundredths
 *     clauses: [{ type, pattern_ids?, pattern_type?, count? }],
 *   }],
 *   simulations?:      number,       // 1-100.000 (padrão 10.000)
 *   tickets_per_game?: number,       // 1-500 (padrão 100)
 *   ticket_price?:     number,       // unidades abstratas (padrão 10)
 * }
 *
 * Retorna: SimulationResult completo com RTP, GGR, estatísticas por padrão+combinação e alertas.
 * Ref: ADR-005 §3
 */
export async function simulateWeights(req: Request, res: Response): Promise<void> {
    const {
        gametype_name,
        base_multiplier,
        patterns,
        combinations,
        simulations,
        tickets_per_game,
        ticket_price,
        max_balls,
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

    if (!Array.isArray(patterns) || patterns.length === 0) {
        res.status(400).json({ error: '"patterns" deve ser um array com pelo menos 1 elemento.' });
        return;
    }

    for (const p of patterns) {
        if (!p.name || typeof p.mask !== 'number' || p.mask <= 0 || p.mask >= (1 << 25)) {
            res.status(400).json({ error: 'Cada pattern deve ter name, mask (uint32 ≤ 25 bits) e weight.' });
            return;
        }
        if (typeof p.weight !== 'number' || p.weight < 10 || p.weight > 25500) {
            res.status(400).json({ error: '"weight" de cada pattern deve ser 0.10 a 255.00 (hundredths: 10–25500).' });
            return;
        }
    }

    const numBalls = max_balls != null
        ? Math.max(1, Math.min(75, Number(max_balls)))
        : undefined;

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
        combinations:    combinations ?? [],
        simulations:     numSims,
        tickets_per_game: numTickets,
        ticket_price:    Number(ticket_price ?? DEFAULT_TICKET_PRICE),
        max_balls:       numBalls,
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
