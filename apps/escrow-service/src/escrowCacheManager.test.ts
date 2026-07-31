// apps/escrow-service/src/escrowCacheManager.test.ts
// Testes unitários do cache manager — Redis mockado (sem instância real).
//
// Cenários (grill):
//  - addbacking salva meta preventiva + obligated incrementa (TTL renovado)
//  - cancelback lê meta (0 RPC) e decrementa
//  - agg_ratio calculado com guard de timestamp (reconciliação não sobrescreve evento recente)

import { adjustCounter, recalcAggRatio, setEscrowMeta, getEscrowMeta, loadCursor, saveCursor } from './escrowCacheManager';

jest.mock('./redis', () => ({
  redisClient: {
    hSet: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    hGetAll: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue('1'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('./metrics', () => ({
  cacheUpdates: { inc: jest.fn() },
  handlerErrors: { inc: jest.fn() },
}));

jest.mock('./logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { redisClient } = require('./redis') as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('escrowCacheManager', () => {
  it('setEscrowMeta salva hash + TTL 24h (cache preventivo)', async () => {
    await setEscrowMeta(42, {
      depositor: 'bingogamescr',
      token_contract: 'eosio.token',
      amount: '100.0000 WAX',
      amount_raw: '1000000',
      owner: 'player1',
      asset_id: '777',
      esc_id: '42',
    });

    expect(redisClient.hSet).toHaveBeenCalledWith(
      'escrow:meta:42',
      expect.objectContaining({ depositor: 'bingogamescr', amount_raw: '1000000' }),
    );
    expect(redisClient.expire).toHaveBeenCalledWith('escrow:meta:42', 86400);
  });

  it('getEscrowMeta retorna null quando não existe (fallback RPC no cancelback)', async () => {
    redisClient.hGetAll.mockResolvedValueOnce({});
    const meta = await getEscrowMeta(999);
    expect(meta).toBeNull();
  });

  it('adjustCounter usa Lua (INCRBY + EXPIRE atômicos)', async () => {
    await adjustCounter('bingogamescr', 'eosio.token', -500, 'balance');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCRBY'),
      {
        keys: ['escrow:balance:bingogamescr:eosio.token'],
        arguments: ['-500', '3600'],
      },
    );
  });

  it('recalcAggRatio chama Lua com keys obrigatorias e obligated/balance', async () => {
    redisClient.eval.mockResolvedValueOnce('0.5');
    const ratio = await recalcAggRatio('bingogamescr', 'eosio.token');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('obligated / balance'),
      {
        keys: [
          'escrow:obligated:bingogamescr:eosio.token',
          'escrow:balance:bingogamescr:eosio.token',
          'escrow:agg_ratio:bingogamescr:eosio.token',
          'escrow:last_modified',
        ],
        arguments: ['0', '3600'],
      },
    );
    expect(ratio).toBe(0.5);
  });

  it('loadCursor retorna 0 quando Redis vazio', async () => {
    const cursor = await loadCursor();
    expect(cursor).toBe(0);
  });

  it('saveCursor seta com TTL 24h', async () => {
    await saveCursor(123456);
    expect(redisClient.set).toHaveBeenCalledWith('escrow:statewatcher:cursor', '123456', { EX: 86400 });
  });
});
