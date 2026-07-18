// Testes de regressão: idempotência do handler fundgame (FIX #384)
//
// Se jogo NÃO está em 'created', handler faz ack silencioso (sem
// executeFundGame, sem nack/DLQ). Se está em 'created' (ou fetchGame
// falha), chama executeFundGame + notifyGameFunded.
//
// Abordagem A: mock do amqplib captura callback registrado via
// channel.consume, teste chama cb com mensagem fake por cenário.

jest.mock('amqplib', () => {
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
    consume: jest.fn(),
    assertQueue: jest.fn(),
    assertExchange: jest.fn(),
    bindQueue: jest.fn(),
    prefetch: jest.fn(),
    checkQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
  };

  return {
    connect: jest.fn(() => ({
      createChannel: jest.fn(() => channel),
      on: jest.fn(),
    })),
  };
});

jest.mock('../blockchain.stub', () => ({
  executeFundGame: jest.fn(),
  executeLockGame: jest.fn(),
  executeStartDraw: jest.fn(),
  executeAbortGame: jest.fn(),
  executeRefundTicket: jest.fn(),
  executeClearGame: jest.fn(),
  executeClaimWinBatch: jest.fn(),
  executeClaimWin: jest.fn(),
  executeClaimCombo: jest.fn(),
  microserviceSession: {} as any,
  adminSession: {} as any,
}));

jest.mock('../invertedIndex', () => ({ buildInvertedIndex: jest.fn() }));
jest.mock('../xpEngine', () => ({ awardTicketPurchaseXP: jest.fn() }));
jest.mock('../roomManager', () => ({ onGameResolved: jest.fn() }));
jest.mock('../gameOrchestrator', () => ({ orchestrateGame: jest.fn() }));
jest.mock('../broadcaster', () => ({
  notifyGameFunded: jest.fn(),
  notifyGameLocked: jest.fn(),
  notifyGameAborted: jest.fn(),
  notifyPrizeConfirmed: jest.fn(),
}));
jest.mock('../chatSystemHelper', () => ({
  sendGameLockedMessage: jest.fn(),
  sendDrawStartedMessage: jest.fn(),
}));
jest.mock('../metrics', () => ({
  eventsProcessedTotal: { inc: jest.fn() },
  eventsFailedTotal: { inc: jest.fn() },
  eventsDeadLetteredTotal: { inc: jest.fn() },
  eventProcessingDuration: { startTimer: jest.fn(() => jest.fn()) },
  oraclePollAttempts: { observe: jest.fn() },
  autoAdvanceRunsTotal: { inc: jest.fn() },
  autoAdvanceErrorsTotal: { inc: jest.fn() },
  autoAdvanceGamesTotal: { inc: jest.fn() },
  setQueueDepth: jest.fn(),
}));
jest.mock('../connectionState', () => ({ setRabbitConnected: jest.fn() }));
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../retryBackoff', () => ({
  isResourceExhausted: jest.fn(),
  resRetryMap: new Map(),
  handleResourceBackoff: jest.fn(),
}));
jest.mock('../gameLock', () => ({
  acquireOrchestrationLock: jest.fn(),
  isLocked: jest.fn(),
  releaseOrchestrationLock: jest.fn(),
  startLockWatchdog: jest.fn(() => ({ stop: jest.fn() })),
}));
jest.mock('../payoutSaga', () => ({
  setPayoutPlan: jest.fn(),
  recordPayoutCompletion: jest.fn(),
  triggerCloseGame: jest.fn(),
  getPayoutProgress: jest.fn(),
}));
jest.mock('../prizeMetrics', () => ({
  payoutChunksTotal: { labels: () => ({ inc: jest.fn() }) },
  payoutRetriesTotal: { labels: () => ({ inc: jest.fn() }) },
  payoutRecoveredTotal: { labels: () => ({ inc: jest.fn() }) },
  prizePersistTotal: { labels: () => ({ inc: jest.fn() }) },
  prizePaymentsTotal: { labels: () => ({ inc: jest.fn() }) },
  prizePaymentsAmountTotal: { labels: () => ({ inc: jest.fn() }) },
}));
jest.mock('../prizeTransactionsService', () => ({ savePrizeTx: jest.fn() }));
jest.mock('../evaluator', () => ({ computePayoutAmount: jest.fn() }));
jest.mock('../rabbitPublisher', () => ({ publishGameEvent: jest.fn() }));
jest.mock('@cryptobingo/blockchain-core', () => ({
  fetchGame: jest.fn(),
  rpcClient: {
    v1: { chain: { get_table_rows: jest.fn().mockResolvedValue({ rows: [] }) } },
  },
}));

import amqp from 'amqplib';
import { connectRabbitMQ } from '../rabbitmq';
import { fetchGame } from '@cryptobingo/blockchain-core';
import { executeFundGame } from '../blockchain.stub';
import { notifyGameFunded } from '../broadcaster';

const mockFetchGame = fetchGame as unknown as jest.Mock;
const QUEUE_NAME = 'game_loop_events';

function getRabbitFixtures() {
  const connectMock = amqp.connect as unknown as jest.Mock;
  const connection = connectMock.mock.results[0]?.value;
  const channel = (connection.createChannel as jest.Mock).mock.results[0]?.value;
  const consumeCalls = channel.consume.mock.calls;
  const mainCall = consumeCalls.find((call: unknown[]) => call[0] === QUEUE_NAME);
  return {
    cb: mainCall?.[1] as (msg: unknown) => Promise<void>,
    channel,
  };
}

function makeMsg(action: string, gameId: string) {
  return {
    content: Buffer.from(JSON.stringify({ action, gameId })),
    fields: { deliveryTag: 1, redelivered: false },
    properties: { headers: {} },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fundgame idempotency (FIX #384)', () => {
  it('archived -> executeFundGame nao chamado, ack sim, nack nao', async () => {
    mockFetchGame.mockResolvedValue({ status: 'archived' });
    await connectRabbitMQ();
    const { cb, channel } = getRabbitFixtures();
    await cb(makeMsg('fundgame', '123'));

    expect(executeFundGame).not.toHaveBeenCalled();
    expect(notifyGameFunded).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('aborted -> executeFundGame nao chamado, ack sim, nack nao', async () => {
    mockFetchGame.mockResolvedValue({ status: 'aborted' });
    await connectRabbitMQ();
    const { cb, channel } = getRabbitFixtures();
    await cb(makeMsg('fundgame', '123'));

    expect(executeFundGame).not.toHaveBeenCalled();
    expect(notifyGameFunded).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('funding -> executeFundGame nao chamado, ack sim, nack nao', async () => {
    mockFetchGame.mockResolvedValue({ status: 'funding' });
    await connectRabbitMQ();
    const { cb, channel } = getRabbitFixtures();
    await cb(makeMsg('fundgame', '123'));

    expect(executeFundGame).not.toHaveBeenCalled();
    expect(notifyGameFunded).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('created -> executeFundGame chamado 1x, notifyGameFunded chamado, ack sim', async () => {
    mockFetchGame.mockResolvedValue({ status: 'created' });
    await connectRabbitMQ();
    const { cb, channel } = getRabbitFixtures();
    await cb(makeMsg('fundgame', '123'));

    expect(executeFundGame).toHaveBeenCalledTimes(1);
    expect(executeFundGame).toHaveBeenCalledWith('123');
    expect(notifyGameFunded).toHaveBeenCalledTimes(1);
    expect(notifyGameFunded).toHaveBeenCalledWith('123');
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('bonus: fetchGame retorna null -> executeFundGame chamado (fallback)', async () => {
    mockFetchGame.mockResolvedValue(null);
    await connectRabbitMQ();
    const { cb, channel } = getRabbitFixtures();
    await cb(makeMsg('fundgame', '123'));

    expect(executeFundGame).toHaveBeenCalledTimes(1);
    expect(executeFundGame).toHaveBeenCalledWith('123');
    expect(notifyGameFunded).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
