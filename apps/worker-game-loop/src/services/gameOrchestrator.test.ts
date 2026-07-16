// Testes unitários do gameOrchestrator — todos os draw_modes e resiliência.
// sleep() usa setTimeout — jest.useFakeTimers() é obrigatório para não aguardar 3-4s reais.

process.env.GOLDEN_BALL_PAUSE_MS = '0';
process.env.STAGE_PAUSE_MS       = '0';
process.env.MULTIPLIER_TIER_PAUSE_MS = '0';
process.env.MULTIPLIER_FINAL_PAUSE_MS = '0';
process.env.CONTRACT_ACCOUNT     = 'bingogamectr';
process.env.RPC_URL              = 'http://localhost:8888';
process.env.CHAIN_ID             = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

jest.mock('@cryptobingo/blockchain-core', () => ({
    fetchGame:  jest.fn(),
    rpcClient:  { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('./evaluator', () => ({
    DEFAULT_DRAW_BALLS:              35,
    findAllWinners:                  jest.fn(),
    processAllGameWinners:           jest.fn(),
    findFirstFullCutoff:             jest.fn(),
    preComputeMultiMatchCutoffs:     jest.fn(),
    payMultiMatchStage:              jest.fn(),
    deriveGoldenMultiplierExported:  jest.fn(),
    computePayoutAmount:             jest.fn().mockReturnValue({ amount: 0, currency: 'BINGO' }),
    isBallInPattern:                 jest.fn().mockReturnValue(false),
}));
jest.mock('./broadcaster', () => ({
    startSlowReveal:    jest.fn().mockResolvedValue(undefined),
    endRevealSession:   jest.fn(),
    notifyWinners:      jest.fn(),
    notifyGoldenBall:   jest.fn(),
    notifyGoldenMultiplierProgress: jest.fn(),
    notifyStageCleared: jest.fn(),
    notifyGameEnded:    jest.fn(),
    notifyGameLocked:   jest.fn(),
    notifyGameAborted:  jest.fn(),
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
}));
jest.mock('./payoutSaga', () => ({
    setPayoutPlan:    jest.fn().mockResolvedValue(undefined),
    triggerCloseGame: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./blockchain', () => ({
    executeCloseGame: jest.fn().mockResolvedValue('tx-close'),
    executeClaimWin:  jest.fn().mockResolvedValue('tx-claim'),
    microserviceSession: {},
    adminSession:        {},
}));
jest.mock('./invertedIndex', () => ({
    deleteIndex: jest.fn().mockResolvedValue(undefined),
    indexExists: jest.fn().mockResolvedValue(false),
}));
jest.mock('./roomManager', () => ({
    onGameResolved: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./dropWorker', () => ({
    processRoomDrops: jest.fn().mockResolvedValue(undefined),
}));

import { fetchGame, rpcClient }             from '@cryptobingo/blockchain-core';
import {
    findAllWinners, processAllGameWinners,
    findFirstFullCutoff, preComputeMultiMatchCutoffs,
    payMultiMatchStage, deriveGoldenMultiplierExported,
    computePayoutAmount, isBallInPattern,
} from './evaluator';
import {
    startSlowReveal, endRevealSession, notifyWinners,
    notifyGoldenBall, notifyGoldenMultiplierProgress, notifyStageCleared, notifyGameEnded,
} from './broadcaster';
import { deleteIndex }    from './invertedIndex';
import { onGameResolved } from './roomManager';
import { orchestrateGame } from './gameOrchestrator';

const mockFetchGame         = fetchGame                                    as jest.Mock;
const mockGetTableRows      = rpcClient.v1.chain.get_table_rows            as jest.Mock;
const mockFindAllWinners    = findAllWinners                               as jest.Mock;
const mockProcessAllWinners = processAllGameWinners                        as jest.Mock;
const mockFindFirstFull     = findFirstFullCutoff                          as jest.Mock;
const mockPreCompute        = preComputeMultiMatchCutoffs                  as jest.Mock;
const mockPayStage          = payMultiMatchStage                           as jest.Mock;
const mockDeriveGolden      = deriveGoldenMultiplierExported               as jest.Mock;
const mockStartReveal       = startSlowReveal                              as jest.Mock;
const mockEndReveal         = endRevealSession                             as jest.Mock;
const mockNotifyWinners     = notifyWinners                                as jest.Mock;
const mockNotifyGoldenBall  = notifyGoldenBall                             as jest.Mock;
const mockNotifyMultiProgress = notifyGoldenMultiplierProgress                as jest.Mock;
const mockNotifyStaged      = notifyStageCleared                           as jest.Mock;
const mockNotifyEnded       = notifyGameEnded                              as jest.Mock;
const mockDeleteIndex       = deleteIndex                                  as jest.Mock;
const mockOnResolved        = onGameResolved                               as jest.Mock;
const mockComputePayout     = computePayoutAmount                          as jest.Mock;
const mockIsBallInPattern   = isBallInPattern                              as jest.Mock;

const DRAWN_BALLS = Array.from({ length: 75 }, (_, i) => i + 1);

function makeGame(overrides: Partial<any> = {}) {
    return {
        game_id: '1', status: 'drawn', gametype_id: '0',
        drawn_balls: DRAWN_BALLS,
        ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
        total_wagered:   { quantity: '80.0000 BINGO', contract: 'bingogametkn' },
        room_id: '1',
        ...overrides,
    };
}

// WinResult com a estrutura correta (ticket.owner, ticket.ticket_id)
function makeWinResult(ticketId = '1', owner = 'jogador1') {
    return {
        ticket:      { ticket_id: ticketId, owner, matrix: [], state: 0x1000, game_id: '1' },
        patternName: 'ROW_0',
        patternMask: 0n,
        weight:      100,
    };
}

// WinResult com ticket.price explícito (ADR-010: preço variável)
function makeWinResultWithPrice(price: string, ticketId = '1', weight = 100) {
    return {
        ...makeWinResult(ticketId),
        ticket: {
            ticket_id: ticketId, owner: 'jogador1', matrix: [], state: 0x1000, game_id: '1',
            price: { quantity: price, contract: 'bingogametkn' },
        },
        weight,
    };
}

// ── standard ─────────────────────────────────────────────────────────────────

describe('orchestrateGame — standard (gametype_id=0)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockFetchGame.mockResolvedValue(makeGame());
        mockFindAllWinners.mockResolvedValue([makeWinResult()]);
        mockProcessAllWinners.mockResolvedValue(undefined);
    });
    afterEach(() => jest.useRealTimers());

    it('Sequência: startSlowReveal → processAllWinners → findAllWinners → notifyWinners → notifyGameEnded → onGameResolved', async () => {
        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockStartReveal).toHaveBeenCalled();
        expect(mockProcessAllWinners).toHaveBeenCalled();
        expect(mockFindAllWinners).toHaveBeenCalled();
        expect(mockNotifyWinners).toHaveBeenCalled();
        expect(mockNotifyEnded).toHaveBeenCalledWith('1', 'standard', 1);
        expect(mockOnResolved).toHaveBeenCalledWith('1');
    });

    it('Sem vencedores → notifyWinners não chamado', async () => {
        mockFindAllWinners.mockResolvedValue([]);

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockNotifyWinners).not.toHaveBeenCalled();
        expect(mockNotifyEnded).toHaveBeenCalledWith('1', 'standard', 0);
    });

    it('finally garante endRevealSession + deleteIndex mesmo com erro', async () => {
        mockFindAllWinners.mockRejectedValue(new Error('Avaliação falhou'));

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await expect(promise).rejects.toThrow();

        expect(mockEndReveal).toHaveBeenCalledWith('1');
        expect(mockDeleteIndex).toHaveBeenCalledWith('1');
    });

    it('Game não encontrado → lança Error', async () => {
        mockFetchGame.mockResolvedValue(null);
        await expect(orchestrateGame('999')).rejects.toThrow(/não encontrado/i);
    });

    it('Game status !== drawn → lança Error', async () => {
        mockFetchGame.mockResolvedValue(makeGame({ status: 'funding' }));
        await expect(orchestrateGame('1')).rejects.toThrow(/DRAWN/i);
    });

    it('onGameResolved lança → erro é swallowed', async () => {
        mockOnResolved.mockRejectedValue(new Error('Room error'));

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await expect(promise).resolves.not.toThrow();
    });
});

// ── firstfull ────────────────────────────────────────────────────────────────

describe('orchestrateGame — firstfull', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockFetchGame.mockResolvedValue(makeGame({ gametype_id: '2' }));
        mockGetTableRows.mockResolvedValue({
            rows: [{ gametype_id: '2', draw_mode: 'firstfull', max_balls: 75, golden_ball_after: 0, base_multiplier: 100, rules: [], stages: [] }],
            more: false,
        });
        mockFindFirstFull.mockResolvedValue(10);
        mockFindAllWinners.mockResolvedValue([]);
        mockProcessAllWinners.mockResolvedValue(undefined);
    });
    afterEach(() => jest.useRealTimers());

    it('findFirstFullCutoff chamado; startSlowReveal recebe bolas até o cutoff', async () => {
        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockFindFirstFull).toHaveBeenCalledWith('1', DRAWN_BALLS);
        const revealArg = mockStartReveal.mock.calls[0]?.[1] as number[];
        expect(revealArg?.length).toBeLessThanOrEqual(10);
    });
});

// ── goldenball ────────────────────────────────────────────────────────────────

describe('orchestrateGame — goldenball', () => {
    // sleep(0) resolve imediatamente com real timers (GOLDEN_BALL_PAUSE_MS=0)
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchGame.mockResolvedValue(makeGame({ gametype_id: '3' }));
        mockGetTableRows.mockResolvedValue({
            rows: [{ gametype_id: '3', draw_mode: 'goldenball', max_balls: 5, golden_ball_after: 4, base_multiplier: 100, rules: [], stages: [] }],
            more: false,
        });
        mockDeriveGolden.mockReturnValue(5);
        mockFindAllWinners.mockResolvedValue([]);
        mockProcessAllWinners.mockResolvedValue(undefined);
    });

    it('notifyGoldenBall chamado com multiplicador correto', async () => {
        await orchestrateGame('1');
        expect(mockNotifyGoldenBall).toHaveBeenCalledWith('1', expect.any(Number), 5);
    });

    it('notifyGoldenMultiplierProgress anima tiers antes do final', async () => {
        mockDeriveGolden.mockReturnValue(5); // tiers: 2 → final(5)
        await orchestrateGame('1');
        // Deve emitir ×2 (tier) e ×5 (final)
        expect(mockNotifyMultiProgress).toHaveBeenCalledWith('1', 2, false);
        expect(mockNotifyMultiProgress).toHaveBeenCalledWith('1', 5, true);
    });

    it('notifyGoldenMultiplierProgress pula tiers acima do multiplicador final', async () => {
        mockDeriveGolden.mockReturnValue(3); // tiers: 2 → sem tier≥3 → final(3)
        await orchestrateGame('1');
        expect(mockNotifyMultiProgress).toHaveBeenCalledWith('1', 2, false);
        expect(mockNotifyMultiProgress).toHaveBeenCalledWith('1', 3, true);
    });

    it('notifyGoldenMultiplierProgress quando multiplier=2 só emite final', async () => {
        mockDeriveGolden.mockReturnValue(2); // sem tier<2 → só final
        await orchestrateGame('1');
        expect(mockNotifyMultiProgress).toHaveBeenCalledWith('1', 2, true);
        expect(mockNotifyMultiProgress).toHaveBeenCalledTimes(1);
    });

    it('startSlowReveal recebe totalBalls = ga + 1', async () => {
        await orchestrateGame('1');
        // max_balls=5, golden_ball_after=4, ga=4, totalReveal=5
        expect(mockStartReveal.mock.calls[0][2]).toBe(5); // primeira chamada
        expect(mockStartReveal.mock.calls[1][2]).toBe(5); // golden ball
    });

    it('startSlowReveal chamado 2x (bolas normais + golden)', async () => {
        await orchestrateGame('1');
        expect(mockStartReveal).toHaveBeenCalledTimes(2);
    });

    it('T2 — ga fallback goldenBallAfter=0 usa drawnBalls.length-1 (não maxBalls)', async () => {
        jest.clearAllMocks();
        const drawnBalls37 = Array.from({ length: 37 }, (_, i) => i + 1);
        mockFetchGame.mockResolvedValue(makeGame({ gametype_id: '3', drawn_balls: drawnBalls37 }));
        mockGetTableRows.mockResolvedValue({
            rows: [{ gametype_id: '3', draw_mode: 'goldenball', max_balls: 35, golden_ball_after: 0, base_multiplier: 100, rules: [], stages: [] }],
            more: false,
        });
        mockDeriveGolden.mockReturnValue(2);
        mockFindAllWinners.mockResolvedValue([]);
        mockProcessAllWinners.mockResolvedValue(undefined);

        await orchestrateGame('1');
        const findAllArgs = mockFindAllWinners.mock.calls[0];
        const effectiveBalls = findAllArgs![1] as number[];
        // After fix: ga = 36 (37-1), effectiveBalls = 37
        // Before fix: ga = 35 (maxBalls), effectiveBalls = 36
        expect(effectiveBalls.length).toBe(drawnBalls37.length); // 37
        expect(effectiveBalls.length).not.toBe(36); // não truncado
    });

    it('T5 — goldenBallAfter=39 (40 bolas) mantém comportamento', async () => {
        jest.clearAllMocks();
        const drawnBalls40 = Array.from({ length: 40 }, (_, i) => i + 1);
        mockFetchGame.mockResolvedValue(makeGame({ gametype_id: '3', drawn_balls: drawnBalls40 }));
        mockGetTableRows.mockResolvedValue({
            rows: [{ gametype_id: '3', draw_mode: 'goldenball', max_balls: 35, golden_ball_after: 39, base_multiplier: 100, rules: [], stages: [] }],
            more: false,
        });
        mockDeriveGolden.mockReturnValue(2);
        mockFindAllWinners.mockResolvedValue([]);
        mockProcessAllWinners.mockResolvedValue(undefined);

        await orchestrateGame('1');
        const findAllArgs = mockFindAllWinners.mock.calls[0];
        const effectiveBalls = findAllArgs![1] as number[];
        // goldenBallAfter=39 → ga=39, effectiveBalls = 40
        expect(effectiveBalls.length).toBe(40);
    });

    it('goldenMultiplier aplicado por entrada — só quando golden ball está no padrão', async () => {
        mockDeriveGolden.mockReturnValue(5);
        mockFindAllWinners.mockResolvedValue([
            { ...makeWinResult('tk_a', 'jogador1'), patternMask: 1n, patternName: 'DIAG_TL_BR' },
            { ...makeWinResult('tk_b', 'jogador2'), patternMask: 2n, patternName: 'ROW_0' },
        ]);
        mockComputePayout
            .mockReturnValueOnce({ amount: 30, currency: 'BINGO' })
            .mockReturnValueOnce({ amount: 10, currency: 'BINGO' });
        mockIsBallInPattern
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);
        mockProcessAllWinners.mockResolvedValue(undefined);

        await orchestrateGame('1');

        expect(mockComputePayout).toHaveBeenNthCalledWith(1, expect.any(String), 100, 100, 5);
        expect(mockComputePayout).toHaveBeenNthCalledWith(2, expect.any(String), 100, 100, 0);
    });

    it('goldenMultiplier=0/1 não multiplica nenhuma entrada (regressão)', async () => {
        mockDeriveGolden.mockReturnValue(1);
        mockFindAllWinners.mockResolvedValue([
            { ...makeWinResult('tk_a', 'jogador1'), patternMask: 1n, patternName: 'DIAG_TL_BR' },
            { ...makeWinResult('tk_b', 'jogador2'), patternMask: 2n, patternName: 'ROW_0' },
        ]);
        mockComputePayout
            .mockReturnValueOnce({ amount: 5, currency: 'BINGO' })
            .mockReturnValueOnce({ amount: 5, currency: 'BINGO' });
        mockIsBallInPattern.mockReturnValue(false);
        mockProcessAllWinners.mockResolvedValue(undefined);

        await orchestrateGame('1');

        expect(mockComputePayout).toHaveBeenNthCalledWith(1, expect.any(String), 100, 100, 0);
        expect(mockComputePayout).toHaveBeenNthCalledWith(2, expect.any(String), 100, 100, 0);
    });
});

// ── multimatch ────────────────────────────────────────────────────────────────

describe('orchestrateGame — multimatch', () => {
    // sleep(0) resolve imediatamente com real timers (STAGE_PAUSE_MS=0)
    const stageResults = [
        { stage: 1, cutoffBall: 5,  cutoffIndex: 4,  winners: [makeWinResult('1')] },
        { stage: 2, cutoffBall: 10, cutoffIndex: 9,  winners: [makeWinResult('1')] },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchGame.mockResolvedValue(makeGame({ gametype_id: '4' }));
        mockGetTableRows.mockResolvedValue({
            rows: [{ gametype_id: '4', draw_mode: 'multimatch', max_balls: 35, base_multiplier: 100, rules: [], stages: [
                { stage: 1, patterns_required: 1, weight: 100 },
                { stage: 2, patterns_required: 2, weight: 200 },
            ]}],
            more: false,
        });
        mockPreCompute.mockResolvedValue(stageResults);
        mockPayStage.mockResolvedValue(undefined);
        mockProcessAllWinners.mockResolvedValue(undefined);
    });

    it('processAllGameWinners chamado antes do reveal (state validation)', async () => {
        await orchestrateGame('1');
        expect(mockProcessAllWinners).toHaveBeenCalledWith('1');
    });

    it('preComputeMultiMatchCutoffs chamado depois de processAllGameWinners', async () => {
        await orchestrateGame('1');
        const procOrder  = mockProcessAllWinners.mock.invocationCallOrder[0];
        const preCompOrder = mockPreCompute.mock.invocationCallOrder[0];
        expect(procOrder).toBeLessThan(preCompOrder);
    });

    it('startSlowReveal recebe totalBalls do último cutoff', async () => {
        await orchestrateGame('1');
        // stageResults: cutoff 5 e 10 → totalBalls = 10
        const totalBallsCall0 = mockStartReveal.mock.calls[0][2];
        expect(totalBallsCall0).toBe(10);
    });

    it('preComputeMultiMatchCutoffs chamado antes do reveal', async () => {
        await orchestrateGame('1');
        expect(mockPreCompute).toHaveBeenCalledWith('1', expect.any(Array), '4');
    });

    it('notifyStageCleared chamado para cada stage com vencedores', async () => {
        await orchestrateGame('1');
        expect(mockNotifyStaged).toHaveBeenCalledTimes(2);
    });

    it('payMultiMatchStage chamado para cada stage com vencedores', async () => {
        await orchestrateGame('1');
        expect(mockPayStage).toHaveBeenCalledTimes(2);
    });

    it('revela exatamente até o cutoff de cada stage — não continua além do último', async () => {
        // Stage 1 cutoff=5, Stage 2 cutoff=10, drawnBalls=75 (sem slice de max_balls)
        // Após stage 2, o jogo encerra no ball 10; balls 11-75 NÃO devem ser reveladas.
        await orchestrateGame('1');
        const allRevealedBalls = mockStartReveal.mock.calls.flatMap((c: any[]) => c[1] as number[]);
        // Deve ter revelado exatamente 10 bolas (0..4 + 5..9)
        expect(allRevealedBalls).toHaveLength(10);
    });

    it('dispatch passa TODOS os drawnBalls ao multimatch — sem slice de max_balls', async () => {
        await orchestrateGame('1');
        // preComputeMultiMatchCutoffs deve receber todos os 75 balls do oracle
        expect(mockPreCompute).toHaveBeenCalledWith('1', DRAWN_BALLS, '4');
    });

    it('startSlowReveal cobre TODAS as bolas quando nenhum stage tem vencedores (zero fallback bug)', async () => {
        // Dois stages sem vencedores — cutoffBall é sentinela (drawnBalls.length + 1 = 76)
        mockPreCompute.mockResolvedValue([
            { stage: 1, cutoffBall: 76, cutoffIndex: 75, winners: [] },
            { stage: 2, cutoffBall: 76, cutoffIndex: 75, winners: [] },
        ]);
        await orchestrateGame('1');
        // Deve revelar todos os 75 balls lentamente para evitar o fallbackBalls do frontend
        const allRevealedBalls = mockStartReveal.mock.calls.flatMap((c: any[]) => c[1] as number[]);
        expect(allRevealedBalls).toEqual(DRAWN_BALLS);
    });
});

// ── buildWinnerPayloads (via orchestrateStandard) ────────────────────────────

// buildWinnerPayloads é privada; é testada indiretamente via orchestrateGame no
// caminho standard com gametype_id != '0' (modo dinâmico ADR-005 Fase 2).
describe('buildWinnerPayloads — preço variável e baseMultiplier (ADR-010 + ADR-005)', () => {
    const GT_ROWS = (baseMultiplier = 1) => ({
        rows: [{ gametype_id: '1', draw_mode: 'standard', max_balls: 75, base_multiplier: baseMultiplier, rules: [], stages: [] }],
        more: false,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockFetchGame.mockResolvedValue(makeGame({
            gametype_id: '1',
            ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
        }));
        mockGetTableRows.mockResolvedValue(GT_ROWS());
        mockFindAllWinners.mockResolvedValue([makeWinResult()]);
        mockProcessAllWinners.mockResolvedValue(undefined);
        mockComputePayout.mockReturnValue({ amount: 5, currency: 'BINGO' });
    });
    afterEach(() => jest.useRealTimers());

    it('usa ticket.price quando definido — não o default do jogo (ADR-010)', async () => {
        mockFindAllWinners.mockResolvedValue([makeWinResultWithPrice('1.0000 BINGO')]);

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockComputePayout).toHaveBeenCalledWith(
            '1.0000 BINGO',
            1,
            100,
            0,
        );
    });

    it('cai para game.ticket_price quando ticket.price não está definido', async () => {
        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockComputePayout).toHaveBeenCalledWith(
            '10.0000 BINGO',
            1,
            100,
            0,
        );
    });

    it('baseMultiplier do gametype é repassado a computePayoutAmount', async () => {
        mockGetTableRows.mockResolvedValue(GT_ROWS(200));

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockComputePayout).toHaveBeenCalledWith(
            expect.any(String),
            200,
            100,
            0,
        );
    });

    it('notifyWinners recebe payouts formatados quando amount > 0', async () => {
        mockComputePayout.mockReturnValue({ amount: 3.5, currency: 'BINGO' });

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockNotifyWinners).toHaveBeenCalledWith('1', [
            expect.objectContaining({ payouts: ['3.5000 BINGO'] }),
        ]);
    });

    it('payouts vazio quando computePayoutAmount retorna amount=0', async () => {
        mockComputePayout.mockReturnValue({ amount: 0, currency: 'BINGO' });

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockNotifyWinners).toHaveBeenCalledWith('1', [
            expect.objectContaining({ payouts: [] }),
        ]);
    });

    it('2 tickets com preços diferentes → cada um usa seu próprio preço', async () => {
        mockFindAllWinners.mockResolvedValue([
            makeWinResultWithPrice('1.0000 BINGO', 'tk1'),
            makeWinResultWithPrice('5.0000 BINGO', 'tk2'),
        ]);
        mockComputePayout
            .mockReturnValueOnce({ amount: 1, currency: 'BINGO' })
            .mockReturnValueOnce({ amount: 5, currency: 'BINGO' });

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockComputePayout).toHaveBeenNthCalledWith(1, '1.0000 BINGO', 1, 100, 0);
        expect(mockComputePayout).toHaveBeenNthCalledWith(2, '5.0000 BINGO', 1, 100, 0);
    });

    it('weight do WinResult é repassado a computePayoutAmount', async () => {
        mockFindAllWinners.mockResolvedValue([makeWinResultWithPrice('2.0000 BINGO', 'tk1', 250)]);

        const promise = orchestrateGame('1');
        jest.runAllTimers();
        await promise;

        expect(mockComputePayout).toHaveBeenCalledWith(
            '2.0000 BINGO',
            1,
            250,
            0,
        );
    });
});
