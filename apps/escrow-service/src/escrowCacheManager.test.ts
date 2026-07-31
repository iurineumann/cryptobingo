// apps/escrow-service/src/escrowCacheManager.test.ts
// Testes unitários do cache manager — Redis mockado (sem instância real).
//
// Cenários (grill):
//  - addbacking salva meta preventiva + obligated incrementa (TTL renovado)
//  - cancelback lê meta (0 RPC) e decrementa
//  - agg_ratio calculado com guard de timestamp (reconciliação não sobrescreve evento recente)

import { adjustCounter, recalcAggRatio, setEscrowMeta, getEscrowMeta, loadCursor, saveCursor } from './escrowCacheManager';
import {
  upsertAssetEscrow,
  removeAssetEscrow,
  deleteAssetEscrows,
  getAssetEscrows,
  getAssetLastModified,
  rebuildAssetEscrows,
  markEscrowClaimed,
} from './escrowCacheManager';

jest.mock('./redis', () => ({
  redisClient: {
    hSet: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    hGetAll: jest.fn().mockResolvedValue({}),
    hGet: jest.fn().mockResolvedValue(null),
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

// ─── Índice by_asset (Fase C v2) ───────────────────────────────────────

const entry = {
  esc_id: '7',
  asset_id: '100',
  owner: 'comprador1',
  depositor: 'deposit1',
  token_contract: 'bingogametkn',
  token_amount: '100.0000 BINGO',
  token_amount_raw: '1000000',
  updated_at: 1,
};

describe('escrowCacheManager — índice by_asset (Fase C v2)', () => {
  it('upsertAssetEscrow chama Lua com by_asset + meta (guard anti-ressurreição)', async () => {
    const ok = await upsertAssetEscrow(100, entry);

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('HGET'),
      {
        keys: ['escrow:by_asset:100', 'escrow:meta:100'],
        arguments: [
          '7',
          expect.stringContaining('"esc_id":"7"'),
          '3600',
          expect.stringMatching(/^\d+$/),
        ],
      },
    );
    expect(ok).toBe(true);
  });

  it('upsert retorna false quando meta claimed (anti-ressurreição — lua retorna 0)', async () => {
    redisClient.eval.mockResolvedValueOnce('0');
    const ok = await upsertAssetEscrow(100, entry);
    expect(ok).toBe(false);
  });

  it('removeAssetEscrow chama Lua com HDEL + HLEN→DEL', async () => {
    await removeAssetEscrow(100, '7');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('HDEL'),
      {
        keys: ['escrow:by_asset:100'],
        arguments: ['7', '3600', expect.stringMatching(/^\d+$/)],
      },
    );
  });

  it('deleteAssetEscrows DEL a chave inteira (claim — asset sai de circulação)', async () => {
    await deleteAssetEscrows(100);
    expect(redisClient.del).toHaveBeenCalledWith('escrow:by_asset:100');
  });

  it('getAssetEscrows retorna entries (ignora __lm__) e [] se ausente', async () => {
    redisClient.hGetAll.mockResolvedValueOnce({
      '7': JSON.stringify(entry),
      __lm__: '123',
    });
    const entries = await getAssetEscrows(100);
    expect(entries).toHaveLength(1);
    expect(entries[0].esc_id).toBe('7');

    redisClient.hGetAll.mockResolvedValueOnce({});
    const empty = await getAssetEscrows(999);
    expect(empty).toHaveLength(0);
  });

  it('getAssetLastModified lê o campo __lm__ (0 se ausente)', async () => {
    redisClient.hGet.mockResolvedValueOnce('456');
    expect(await getAssetLastModified(100)).toBe(456);
    expect(await getAssetLastModified(100)).toBe(0);
  });

  it('rebuildAssetEscrows chama Lua com guard __lm__ (T0) + TTL', async () => {
    redisClient.eval.mockResolvedValueOnce('1');
    const ok = await rebuildAssetEscrows(100, [entry], 500);

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('__lm__'),
      {
        keys: ['escrow:by_asset:100'],
        arguments: [
          '500',
          expect.stringContaining('"7"'),
          expect.stringMatching(/^\d+$/),
          '3600',
        ],
      },
    );
    expect(ok).toBe(true);
  });

  it('rebuild retorna false quando evento tocou o asset durante o scan (lua 0)', async () => {
    redisClient.eval.mockResolvedValueOnce('0');
    const ok = await rebuildAssetEscrows(100, [entry], 500);
    expect(ok).toBe(false);
  });

  it('markEscrowClaimed grava claimed=true + TTL 24h', async () => {
    await markEscrowClaimed(100);
    expect(redisClient.hSet).toHaveBeenCalledWith('escrow:meta:100', { claimed: 'true' });
    expect(redisClient.expire).toHaveBeenCalledWith('escrow:meta:100', 86400);
  });
});
