// Testes TDD da matriz de fallback do cache escrow (C3 — escrowCacheReader).
// Matriz (grill v2-grill-api P3): fresco ≤30s / stale ≤30min / revalida >30min /
// miss → RPC; miss + RPC falha → lança (caller decide 503 financial).

import {
  parseEscrowHash,
  readAssetEscrows,
  readDepositorSnapshot,
  readDepositorBalances,
  escrowKeys,
  LM_FIELD,
} from './escrowCacheReader';

jest.mock('../database/redis', () => ({
  redisClient: {
    hGetAll: jest.fn(),
    get: jest.fn(),
    setEx: jest.fn(async () => 'OK'),
    scanIterator: jest.fn(),
  },
}));

import { redisClient } from '../database/redis';

const mockHGetAll = redisClient.hGetAll as jest.Mock;
const mockGet = redisClient.get as jest.Mock;

const entry = (esc_id: string, asset_id = '100') => ({
  esc_id,
  asset_id,
  owner: 'comprador1',
  depositor: 'deposit1',
  token_contract: 'bingogametkn',
  token_amount: '100.0000 BINGO',
  token_amount_raw: '1000000',
  updated_at: Date.now(),
});

const hashOf = (entries: unknown[], lm?: number) => {
  const raw: Record<string, string> = { [LM_FIELD]: String(lm ?? Date.now()) };
  for (const e of entries) raw[`${(e as any).esc_id}`] = JSON.stringify(e);
  return raw;
};

describe('escrowCacheReader — matriz de fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parseEscrowHash ignora __lm__ e descarta entradas corrompidas', () => {
    const raw: Record<string, string> = {
      [LM_FIELD]: '123',
      '7': JSON.stringify(entry('7')),
      '8': '{corrompido',
    };
    const parsed = parseEscrowHash(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].esc_id).toBe('7');
  });

  it('fresco (≤30s) → serve Redis, stale:false', async () => {
    mockHGetAll.mockResolvedValue(hashOf([entry('7')], Date.now()));
    const read = await readAssetEscrows('100', jest.fn());
    expect(read).toMatchObject({ source: 'redis', stale: false, cached: true });
    expect(read.data).toHaveLength(1);
  });

  it('stale (≤30min) → serve Redis, stale:true', async () => {
    mockHGetAll.mockResolvedValue(hashOf([entry('7')], Date.now() - 5 * 60_000));
    const read = await readAssetEscrows('100', jest.fn());
    expect(read).toMatchObject({ source: 'redis', stale: true, cached: true });
  });

  it('stale >30min + RPC ok → revalida e serve RPC', async () => {
    mockHGetAll.mockResolvedValue(hashOf([entry('7')], Date.now() - 40 * 60_000));
    const rpc = jest.fn().mockResolvedValue([entry('9')]);
    const read = await readAssetEscrows('100', rpc);
    expect(read).toMatchObject({ source: 'rpc', stale: false, cached: false });
    expect(rpc).toHaveBeenCalled();
  });

  it('stale >30min + RPC falha → serve stale Redis (não derruba)', async () => {
    mockHGetAll.mockResolvedValue(hashOf([entry('7')], Date.now() - 40 * 60_000));
    const rpc = jest.fn().mockRejectedValue(new Error('rpc down'));
    const read = await readAssetEscrows('100', rpc);
    expect(read).toMatchObject({ source: 'redis', stale: true, cached: true });
    expect(read.data).toHaveLength(1);
  });

  it('miss (sem chave) + RPC ok → serve RPC, cached:false', async () => {
    mockHGetAll.mockResolvedValue({});
    const rpc = jest.fn().mockResolvedValue([entry('7')]);
    const read = await readAssetEscrows('100', rpc);
    expect(read).toMatchObject({ source: 'rpc', stale: false, cached: false });
  });

  it('miss + RPC falha → lança (caller decide 503 financial / fail-open)', async () => {
    mockHGetAll.mockResolvedValue({});
    const rpc = jest.fn().mockRejectedValue(new Error('rpc down'));
    await expect(readAssetEscrows('100', rpc)).rejects.toThrow('rpc down');
  });

  it('Redis down (hGetAll lança) → tratado como miss', async () => {
    mockHGetAll.mockRejectedValue(new Error('redis down'));
    const rpc = jest.fn().mockResolvedValue([entry('7')]);
    const read = await readAssetEscrows('100', rpc);
    expect(read).toMatchObject({ source: 'rpc', stale: false, cached: false });
  });

  it('readDepositorSnapshot parseia JSON + last_modified', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === escrowKeys.snapshot('jogador1')) return Promise.resolve(JSON.stringify([entry('7')]));
      if (key === escrowKeys.lastModified) return Promise.resolve('1234567890');
      return Promise.resolve(null);
    });
    const { snapshot, lastModified } = await readDepositorSnapshot('jogador1');
    expect(snapshot).toHaveLength(1);
    expect(lastModified).toBe(1234567890);
  });

  it('readDepositorBalances usa SCAN (nunca KEYS) + MGET por token', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.includes('balance')) return Promise.resolve('5000.0000 BINGO');
      if (key.includes('obligated')) return Promise.resolve('1000.0000 BINGO');
      if (key.includes('agg_ratio')) return Promise.resolve('0.5');
      return Promise.resolve(null);
    });
    (redisClient.scanIterator as jest.Mock).mockReturnValue(
      (async function* () {
        yield 'escrow:balance:jogador1:bingogametkn';
      })(),
    );
    const balances = await readDepositorBalances('jogador1');
    expect(balances).toEqual({
      bingogametkn: { balance: '5000.0000 BINGO', obligated: '1000.0000 BINGO', agg_ratio: '0.5' },
    });
    expect(redisClient.scanIterator).toHaveBeenCalledWith(
      expect.objectContaining({ MATCH: 'escrow:balance:jogador1:*', COUNT: 100 }),
    );
  });
});
