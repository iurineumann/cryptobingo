// Testes unitários do gameOrchestrator — todos os draw_modes e resiliência.
// sleep() usa setTimeout — jest.useFakeTimers() é obrigatório para não aguardar 3-4s reais.

process.env.GOLDEN_BALL_PAUSE_MS = '0';
process.env.STAGE_PAUSE_MS       = '0';
process.env.CONTRACT_ACCOUNT     = 'bingo.game';
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
}));
jest.mock('./broadcaster', () => ({
    startSlowReveal:    jest.fn().mockResolvedValue(undefined),
    endRevealSession:   jest.fn(),
    notifyWinners:      jest.fn(),
    notifyGoldenBall:   jest.fn(),
    notifyStageCleared: jest.fn(),
    notifyGameEnded:    jest.fn(),
    notifyGameLocked:   jest.fn(),
    notifyGameAborted:  jest.fn(),
}));
jest.mock('./blockchain', () => ({
    executeCloseGame: jest.fn().mockResolvedValue('tx-close'),
    executeClaimWin:  jest.fn().mockResolvedValue('tx-claim'),
    microserviceSession: {},
    contractSession:     {},
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
} from './evaluator';
import {
    startSlowReveal, endRevealSession, notifyWinners,
    notifyGoldenBall, notifyStageCleared, notifyGameEnded,
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
const mockNotifyStaged      = notifyStageCleared                           as jest.Mock;
const mockNotifyEnded       = notifyGameEnded                              as jest.Mock;
const mockDeleteIndex       = deleteIndex                                  as jest.Mock;
const mockOnResolved        = onGameResolved                               as jest.Mock;

const DRAWN_BALLS = Array.from({ length: 75 }, (_, i) => i + 1);

function makeGame(overrides: Partial<any> = {}) {
    return {
        game_id: '1', status: 'drawn', gametype_id: '0',
        drawn_balls: DRAWN_BALLS,
        ticket_price: { quantity: '10.0000 BINGO', contract: 'bingo.token' },
        total_wagered:   { quantity: '80.0000 BINGO', contract: 'bingo.token' },
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

    it('startSlowReveal chamado 2x (bolas normais + golden)', async () => {
        await orchestrateGame('1');
        expect(mockStartReveal).toHaveBeenCalledTimes(2);
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
});
