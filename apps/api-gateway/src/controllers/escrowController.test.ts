// Testes TDD do escrowController (C4) — 4 endpoints + self-only + fail-closed.
// Cobre: ?owner= → 400, charset WAX, 403 ≠ wallet, no-store, fallback ownership
// Atomic → RPC → 503, miss+RPC falha no /status → 503 financial.

import { Request, Response } from 'express';

jest.mock('../database/redis', () => ({
  redisClient: {
    get: jest.fn(async () => null),
    setEx: jest.fn(async () => 'OK'),
    hGetAll: jest.fn(async () => ({})),
    scanIterator: jest.fn(() =>
      (async function* () {
        /* vazio */
      })(),
    ),
  },
}));

jest.mock('@cryptobingo/blockchain-core', () => ({
  rpcClient: {
    v1: {
      chain: {
        get_table_rows: jest.fn(),
        get_info: jest.fn(),
      },
    },
  },
  assetToRaw: (asset: string | null | undefined) => {
    if (!asset) return 0;
    const [amount] = asset.split(' ');
    const [, decimals = ''] = amount.split('.');
    return Math.round(parseFloat(amount) * Math.pow(10, decimals.length));
  },
}));

import { redisClient } from '../database/redis';
import { rpcClient } from '@cryptobingo/blockchain-core';
import {
  getMyEscrows,
  getEscrowStatusByDepositor,
  getTierPrices,
  getEscrowHealth,
} from './escrowController';
import { escrowKeys, LM_FIELD } from '../services/escrowCacheReader';

const mockGet = redisClient.get as jest.Mock;
const mockHGetAll = redisClient.hGetAll as jest.Mock;
const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;

const mockRes = () => {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    json(obj: unknown) {
      this.body = obj;
      return this;
    },
  };
  return res;
};

const req = (overrides: Partial<Request> = {}): Request =>
  ({ query: {}, params: {}, user: { wallet: 'jogador1' }, ...overrides }) as unknown as Request;

const escrowEntry = (esc_id: string, asset_id = '100') => ({
  esc_id,
  asset_id,
  owner: 'comprador1',
  depositor: 'jogador1',
  token_contract: 'bingogametkn',
  token_amount: '100.0000 BINGO',
  token_amount_raw: '1000000',
  updated_at: Date.now(),
});

describe('GET /api/v1/escrow/my', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('?owner= → 400 (IDOR — ownership vem do JWT)', async () => {
    const res = mockRes();
    await getMyEscrows(req({ query: { owner: 'outro1' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('wallet inválido → 400', async () => {
    const res = mockRes();
    await getMyEscrows(req({ user: { wallet: 'INVÁLIDO!' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('Atomic API ok → 200 com escrows do Redis por asset + no-store', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ asset_id: '100', template_id: 1, schema_name: 'utility', collection_name: 'cryptobingo1' }],
      }),
    })) as any;
    mockHGetAll.mockResolvedValue({
      [LM_FIELD]: String(Date.now()),
      '7': JSON.stringify(escrowEntry('7')),
    });

    const res = mockRes();
    await getMyEscrows(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].escrows).toHaveLength(1);
    expect(res.body.items[0].escrow_source).toBe('redis');
    expect(res.body.stale).toBe(false);
  });

  it('Atomic API caiu → fallback RPC assets owner-scoped', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('atomic down');
    }) as any;
    mockGetTableRows.mockImplementation((opts: any) => {
      if (opts.table === 'assets') {
        return Promise.resolve({
          rows: [{ asset_id: '100', template_id: 1, schema_name: 'utility', collection_name: 'cryptobingo1' }],
        });
      }
      if (opts.table === 'escrows') return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    mockHGetAll.mockResolvedValue({});

    const res = mockRes();
    await getMyEscrows(req(), res);
    expect(res.statusCode).toBe(200);
    expect(mockGetTableRows).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'atomicassets', scope: 'jogador1', table: 'assets' }),
    );
    expect(res.body.items[0].escrows).toEqual([]);
  });

  it('Atomic API + RPC cairam → 503 (ownership é a base do /my)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('atomic down');
    }) as any;
    mockGetTableRows.mockRejectedValue(new Error('rpc down'));

    const res = mockRes();
    await getMyEscrows(req(), res);
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/v1/escrow/status/:depositor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('charset inválido → 400', async () => {
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'BOM_!!' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('depositor ≠ wallet → 403 (self-only)', async () => {
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'outro1111' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('snapshot fresco → 200 cached, stale:false + no-store', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === escrowKeys.snapshot('jogador1')) return Promise.resolve(JSON.stringify([escrowEntry('7')]));
      if (key === escrowKeys.lastModified) return Promise.resolve(String(Date.now()));
      return Promise.resolve(null);
    });
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'jogador1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body).toMatchObject({ stale: false, cached: true });
    expect(res.body.escrows).toHaveLength(1);
    // Normalização (self-review): nunca servir campos undefined (padrão B5)
    const e = res.body.escrows[0];
    expect(e).toMatchObject({ esc_id: '7', asset_id: '100', claimed: false });
    for (const v of Object.values(e)) expect(v).not.toBeUndefined();
  });

  it('sem cache + RPC falha → 503 financial fail-closed (nunca inventar)', async () => {
    mockGet.mockResolvedValue(null);
    mockGetTableRows.mockRejectedValue(new Error('rpc down'));
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'jogador1' } }), res);
    expect(res.statusCode).toBe(503);
  });

  it('sem cache + RPC ok → 200 via bydepositor (cached:false)', async () => {
    mockGet.mockResolvedValue(null);
    mockGetTableRows.mockResolvedValue({
      rows: [{ esc_id: 7, asset_id: 100, owner: 'comprador1', depositor: 'jogador1', token_contract: 'bingogametkn', token_amount: '100.0000 BINGO', claimed: false }],
    });
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'jogador1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(mockGetTableRows).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'escrows', index_position: 3, lower_bound: 'jogador1' }),
    );
    expect(res.body.escrows).toHaveLength(1);
  });

  it('snapshot stale ≤30min → 200 stale:true (serve dado conhecido)', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === escrowKeys.snapshot('jogador1')) return Promise.resolve(JSON.stringify([escrowEntry('7')]));
      if (key === escrowKeys.lastModified) return Promise.resolve(String(Date.now() - 5 * 60_000));
      return Promise.resolve(null);
    });
    const res = mockRes();
    await getEscrowStatusByDepositor(req({ params: { depositor: 'jogador1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.stale).toBe(true);
  });
});

describe('GET /api/v1/escrow/tierprices', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cache Redis → 200 sem RPC', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ tierprices: [{ id: 1, template_id: 1 }] }));
    const res = mockRes();
    await getTierPrices(req(), res);
    expect(res.statusCode).toBe(200);
    expect(mockGetTableRows).not.toHaveBeenCalled();
    expect(res.body.tierprices).toHaveLength(1);
  });

  it('sem cache → RPC paginado + setEx cache', async () => {
    mockGet.mockResolvedValue(null);
    mockGetTableRows.mockResolvedValue({ rows: [{ id: 1, template_id: 1 }], more: false });
    const res = mockRes();
    await getTierPrices(req(), res);
    expect(res.statusCode).toBe(200);
    expect(redisClient.setEx).toHaveBeenCalledWith(
      escrowKeys.tierPrices,
      300,
      expect.stringContaining('tierprices'),
    );
  });

  it('RPC falhou → 503', async () => {
    mockGet.mockResolvedValue(null);
    mockGetTableRows.mockRejectedValue(new Error('rpc down'));
    const res = mockRes();
    await getTierPrices(req(), res);
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/v1/escrow/health', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 com estado das fontes', async () => {
    mockGet.mockResolvedValue(String(Date.now()));
    mockGetTableRows.mockRejectedValue(new Error('não usado'));
    (rpcClient.v1.chain.get_info as jest.Mock).mockResolvedValue({ chain_id: 'x' });
    const res = mockRes();
    await getEscrowHealth(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', redis: 'up', rpc: 'up', contract: 'bingogamescr' });
  });
});
