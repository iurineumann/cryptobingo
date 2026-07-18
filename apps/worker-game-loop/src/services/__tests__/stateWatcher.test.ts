// Testes do State Watcher (Fase B1/B5) — métricas e ciclo de vida.
// Estratégia: mockar contractEventClient.subscribe para capturar os callbacks,
// redisClient, publishGameEvent e as métricas.

process.env.METRICS_PORT = '0';

const mockSubscribe = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockPublish = jest.fn();

jest.mock('@cryptobingo/blockchain-core', () => ({
    contractEventClient: { subscribe: mockSubscribe },
}));

jest.mock('../redis', () => ({
    redisClient: { get: mockRedisGet, set: mockRedisSet },
}));

jest.mock('../rabbitPublisher', () => ({
    publishGameEvent: mockPublish,
}));

// Mock de todas as métricas
const metrics: Record<string, jest.Mock | { inc: jest.Mock; set: jest.Mock; startTimer: jest.Mock }> = {};
function mockMetric(proto: Record<string, jest.Mock>): any {
    const m = { ...proto };
    metrics[Object.keys(proto)[0]] = m as any;
    return m;
}

jest.mock('../metrics', () => ({
    stateWatcherEventsReceived: { inc: jest.fn() },
    stateWatcherPublished:      { inc: jest.fn() },
    stateWatcherErrors:         { inc: jest.fn() },
    stateWatcherReconnections:  { inc: jest.fn() },
    stateWatcherSourceChanges:  { inc: jest.fn() },
    stateWatcherCursorPosition: { set: jest.fn() },
    stateWatcherPublishLatency: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
}));

import { startStateWatcher, stopStateWatcher } from '../stateWatcher';
import {
    stateWatcherEventsReceived,
    stateWatcherPublished,
    stateWatcherErrors,
    stateWatcherReconnections,
    stateWatcherSourceChanges,
    stateWatcherCursorPosition,
} from '../metrics';

type OnEvent = (evt: any) => Promise<void>;
type OnError = (err: Error) => void;
type OnSourceChange = (src: 'firehose' | 'hyperion') => void;

function captureHandlers(): { onEvent: OnEvent; onError: OnError; onSourceChange: OnSourceChange } {
    const call = mockSubscribe.mock.calls[0]?.[0];
    return {
        onEvent:   call.onEvent,
        onError:   call.onError ?? (() => {}),
        onSourceChange: call.onSourceChange ?? (() => {}),
    };
}

describe('stateWatcher — instrumentação de métricas (B5)', () => {
    let handlers: ReturnType<typeof captureHandlers>;

    beforeAll(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockRedisGet.mockResolvedValue('42');
        mockPublish.mockResolvedValue(undefined);
        mockSubscribe.mockImplementation((h: any) => {
            handlers = { onEvent: h.onEvent, onError: h.onError ?? (() => {}), onSourceChange: h.onSourceChange ?? (() => {}) };
            return jest.fn();
        });
        startStateWatcher();
    });

    afterAll(() => {
        jest.useRealTimers();
        stopStateWatcher();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisGet.mockResolvedValue('42');
        mockPublish.mockResolvedValue(undefined);
    });

    it('Evento recebido + publicado → metrics inc/set chamados', async () => {
        await handlers.onEvent({
            action: 'fundgame',
            game_id: '1',
            global_seq: 50,
            block_num: 100,
            step: 0,
            data: {},
        });

        expect(stateWatcherEventsReceived.inc).toHaveBeenCalledWith({ source: 'firehose' });
        expect(stateWatcherPublished.inc).toHaveBeenCalledWith({ action: 'fundgame' });
        expect(stateWatcherCursorPosition.set).toHaveBeenCalledWith(50);
        expect(mockRedisSet).toHaveBeenCalledWith('statewatcher:last_global_seq', '50');
    });

    it('Evento sem game_id → stateWatcherEventsReceived NÃO incrementa', async () => {
        const receivedIncBefore = (stateWatcherEventsReceived.inc as jest.Mock).mock.calls.length;

        await handlers.onEvent({
            action: 'skip',
            game_id: null,
            global_seq: 55,
            block_num: 101,
            step: 0,
            data: {},
        });

        const receivedIncAfter = (stateWatcherEventsReceived.inc as jest.Mock).mock.calls.length;
        expect(receivedIncAfter - receivedIncBefore).toBe(0);
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it('Erro de publish → stateWatcherErrors.inc + cursor NÃO salvo', async () => {
        mockPublish.mockRejectedValueOnce(new Error('RabbitMQ down'));

        await handlers.onEvent({
            action: 'lockgame',
            game_id: '2',
            global_seq: 60,
            block_num: 102,
            step: 0,
            data: {},
        });

        expect(stateWatcherEventsReceived.inc).toHaveBeenCalled();
        expect(stateWatcherErrors.inc).toHaveBeenCalled();
        expect(mockRedisSet).not.toHaveBeenCalled(); // cursor nao salvo
    });

    it('onError → stateWatcherErrors.inc + stateWatcherReconnections.inc', () => {
        handlers.onError(new Error('Stream connection lost'));

        expect(stateWatcherErrors.inc).toHaveBeenCalled();
        expect(stateWatcherReconnections.inc).toHaveBeenCalled();
    });

    it('onSourceChange → stateWatcherSourceChanges.inc (fallback Hyperion)', () => {
        handlers.onSourceChange('hyperion');

        expect(stateWatcherSourceChanges.inc).toHaveBeenCalled();
    });
});
