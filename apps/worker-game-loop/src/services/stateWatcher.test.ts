// TDD — B1: State Watcher (consome ContractEventClient → publica game_loop_events)
import type { ContractEvent, ContractEventHandlers } from '@cryptobingo/blockchain-core';

import { startStateWatcher, stopStateWatcher } from './stateWatcher';
import { logger } from './logger';
import { publishGameEvent } from './rabbitPublisher';
import { redisClient } from './redis';

// ── Mocks ──────────────────────────────────────────────────────────

const mockPublishGameEvent = publishGameEvent as jest.Mock;
const mockRedisGet = redisClient.get as jest.Mock;
const mockRedisSet = redisClient.set as jest.Mock;
const mockLogInfo = logger.info as jest.Mock;
const mockLogWarn = logger.warn as jest.Mock;
const mockLogError = logger.error as jest.Mock;

// Handlers capturados pelo subscribe
let capturedHandlers: ContractEventHandlers | null = null;
let mockUnsubscribe = jest.fn();

const mockSubscribe = jest.fn().mockImplementation((handlers: ContractEventHandlers) => {
  capturedHandlers = handlers;
  mockUnsubscribe = jest.fn();
  return mockUnsubscribe;
});

jest.mock('@cryptobingo/blockchain-core', () => ({
  contractEventClient: {
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
  ContractEventClient: jest.fn(),
}));

jest.mock('./redis', () => ({
  redisClient: {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('./rabbitPublisher', () => ({
  publishGameEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────

function syntheticEvent(overrides: Partial<ContractEvent> = {}): ContractEvent {
  return {
    game_id: '42',
    action: 'fundgame',
    data: { game_id: '42', room_id: '7' },
    block_num: 1000,
    global_seq: 500,
    step: 1,
    ...overrides,
  };
}

function waitForAsyncSubscription(): Promise<void> {
  // Aguarda o IIFE assincrono de loadCursor + subscribe
  return new Promise((r) => setTimeout(r, 50));
}

// ── Testes ─────────────────────────────────────────────────────────

describe('stateWatcher', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPublishGameEvent.mockResolvedValue(undefined);
    mockRedisGet.mockResolvedValue(undefined);
    mockRedisSet.mockResolvedValue('OK');
    capturedHandlers = null;
    mockUnsubscribe = jest.fn();
    mockSubscribe.mockClear();

    startStateWatcher();
    await waitForAsyncSubscription();
  });

  afterEach(() => {
    stopStateWatcher();
  });

  it('publica evento no RabbitMQ com routingKey, action e payload contendo gameId', async () => {
    const evt = syntheticEvent();
    await capturedHandlers!.onEvent(evt);

    expect(mockPublishGameEvent).toHaveBeenCalledTimes(1);
    expect(mockPublishGameEvent).toHaveBeenCalledWith(
      'game_loop_events',
      'fundgame',
      expect.objectContaining({
        gameId: '42',
        block_num: 1000,
        global_seq: 500,
        step: 1,
      }),
    );
  });

  it('salva cursor no Redis apos publicar com sucesso', async () => {
    const evt = syntheticEvent({ global_seq: 777 });
    await capturedHandlers!.onEvent(evt);

    expect(mockRedisSet).toHaveBeenCalledWith('statewatcher:last_global_seq', '777');
  });

  it('ignora eventos com global_seq <= cursor (dedup)', async () => {
    // Primeiro evento avanca cursor para 500
    const first = syntheticEvent({ global_seq: 500 });
    await capturedHandlers!.onEvent(first);

    // Segundo evento com global_seq menor ou igual
    const dup = syntheticEvent({ global_seq: 400, action: 'lockgame' });
    await capturedHandlers!.onEvent(dup);

    // O segundo evento eh ignorado
    expect(mockPublishGameEvent).toHaveBeenCalledTimes(1);
    expect(mockPublishGameEvent).toHaveBeenCalledWith(
      'game_loop_events',
      'fundgame',
      expect.any(Object),
    );
  });

  it('ignora eventos sem game_id (loga warn)', async () => {
    const evt = syntheticEvent({ game_id: '', action: 'unknown' });
    await capturedHandlers!.onEvent(evt);

    expect(mockPublishGameEvent).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unknown' }),
      'Evento sem game_id — ignorado',
    );
  });

  it('cold start (Redis sem cursor) — subscriber inicia sem erro', async () => {
    mockRedisGet.mockResolvedValue(undefined);

    const evt = syntheticEvent();
    await capturedHandlers!.onEvent(evt);

    expect(mockPublishGameEvent).toHaveBeenCalledTimes(1);
  });

  it('recupera cursor do Redis e ignora eventos ja processados', async () => {
    mockRedisGet.mockResolvedValue('900');

    stopStateWatcher();
    startStateWatcher();
    await waitForAsyncSubscription();

    // Evento com global_seq = 800 (< cursor 900) deve ser ignorado
    const evt = syntheticEvent({ global_seq: 800 });
    await capturedHandlers!.onEvent(evt);
    expect(mockPublishGameEvent).not.toHaveBeenCalled();

    // Evento com global_seq = 910 (> cursor 900) deve ser publicado
    const newer = syntheticEvent({ global_seq: 910, action: 'lockgame' });
    await capturedHandlers!.onEvent(newer);
    expect(mockPublishGameEvent).toHaveBeenCalledTimes(1);
  });

  it('stopStateWatcher chama unsubscribe do client', () => {
    stopStateWatcher();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('trata erro de publish com log error e NAO salva cursor', async () => {
    const publishError = new Error('RabbitMQ down');
    mockPublishGameEvent.mockRejectedValueOnce(publishError);

    const evt = syntheticEvent({ global_seq: 100 });
    await capturedHandlers!.onEvent(evt);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ err: publishError, action: 'fundgame', gameId: '42' }),
      'Erro ao publicar evento no RabbitMQ:',
    );
    // Nao salva cursor apos erro de publish
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
