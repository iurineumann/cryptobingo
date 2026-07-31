// apps/escrow-service/src/escrowEventHandlers.test.ts
// Testes dos handlers da Fase C v2 — correções B1-B5 (grill 2026-07-31).
// Cobre: shape routing do transfer (B4), logmint via byasset + meta (B1/B3),
// addbacking meta por asset_id (B2), releaseburn com fallback RPC (B4).

import { handleEvent } from './escrowEventHandlers';

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
  eventsReceived: { inc: jest.fn() },
  handlerErrors: { inc: jest.fn() },
  nftsBought: { inc: jest.fn() },
  nftsRedeemed: { inc: jest.fn() },
  revenueTotal: { inc: jest.fn() },
  cacheUpdates: { inc: jest.fn() },
}));

jest.mock('./logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock do rpcClient do blockchain-core (byasset do logmint/claim/releaseburn)
const mockGetTableRows = jest.fn();
jest.mock('@cryptobingo/blockchain-core', () => ({
  rpcClient: {
    v1: { chain: { get_table_rows: (...args: any[]) => mockGetTableRows(...args) } },
  },
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { redisClient } from './redis';
import { handlerErrors, nftsRedeemed, nftsBought } from './metrics';

const mockRedis = redisClient as any;
const mockRpc = rpcClient.v1.chain.get_table_rows as unknown as jest.Mock;

const evt = (action: string, data: any) => ({ action, data, global_seq: 1, block_num: 1, step: 1, game_id: '' });

const escrowRow = {
  esc_id: 7, asset_id: 100, owner: 'comprador1', depositor: 'deposit1',
  token_contract: 'bingogametkn', token_amount: '100.0000 BINGO', claimed: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTableRows.mockResolvedValue({ rows: [] });
  mockRedis.hGetAll.mockResolvedValue({});
  mockRedis.get.mockResolvedValue(null);
});

describe('B4 — shape routing do transfer (claim vs depósito)', () => {
  it('transfer com asset_ids + memo redeem → claim (nftsRedeemed inc, contadores)', async () => {
    // Meta presente (escrita pelo addbacking/logmint corrigidos)
    mockRedis.hGetAll.mockResolvedValue({
      depositor: 'deposit1', token_contract: 'bingogametkn',
      amount_raw: '1000000', owner: 'comprador1', asset_id: '100', esc_id: '7',
    });
    mockRedis.get.mockResolvedValue(JSON.stringify([{ asset_id: 100, claimed: false }]));
    mockRedis.eval.mockResolvedValue('1');

    await handleEvent(evt('transfer', {
      from: 'comprador1', to: 'bingogamescr', asset_ids: [100], memo: 'redeem',
    }));

    expect(nftsRedeemed.inc).toHaveBeenCalled();
    // 2 decrementos (obligated + balance) + snapshot + agg_ratio
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('transfer com quantity (token) → depósito de backing (não claim)', async () => {
    await handleEvent(evt('transfer', {
      from: 'deposit1', to: 'bingogamescr', quantity: '100.0000 BINGO', memo: '',
    }));

    expect(nftsRedeemed.inc).not.toHaveBeenCalled();
  });

  it('transfer com memo buy: → revenue (não claim)', async () => {
    await handleEvent(evt('transfer', {
      from: 'comprador1', to: 'bingogamescr', quantity: '10.00000000 WAX', memo: 'buy:1',
    }));

    expect(nftsRedeemed.inc).not.toHaveBeenCalled();
  });

  it('receive_asset (alias defensivo) com memo redeem → claim', async () => {
    mockRedis.hGetAll.mockResolvedValue({
      depositor: 'deposit1', token_contract: 'bingogametkn',
      amount_raw: '1000000', owner: 'comprador1', asset_id: '100', esc_id: '7',
    });
    mockRedis.get.mockResolvedValue(JSON.stringify([{ asset_id: 100, claimed: false }]));

    await handleEvent(evt('receive_asset', {
      from: 'comprador1', to: 'bingogamescr', asset_ids: [100], memo: 'redeem',
    }));

    expect(nftsRedeemed.inc).toHaveBeenCalled();
  });
});

describe('B1+B3 — logmint via escrows byasset + meta', () => {
  it('consulta escrows por byasset (não pending_mints) e grava meta por asset_id', async () => {
    mockGetTableRows.mockResolvedValue({ rows: [escrowRow] });

    await handleEvent(evt('logmint', {
      asset_id: 100, authorized_minter: 'bingogamescr',
      new_asset_owner: 'comprador1', template_id: 533298,
    }));

    // byasset: index_position 2 + bound asset_id
    const call = mockGetTableRows.mock.calls[0][0];
    expect(call.table).toBe('escrows');
    expect(call.index_position).toBe(2);
    expect(call.lower_bound).toBe(100);
    // meta por asset_id gravada (B3)
    expect(mockRedis.hSet).toHaveBeenCalledWith(
      expect.stringContaining(':100'),
      expect.objectContaining({ depositor: 'deposit1', owner: 'comprador1' }),
    );
    expect(nftsBought.inc).toHaveBeenCalled();
  });

  // 10 retries × backoff 500ms ≈ 27.5s — timeout estendido para o caminho rpc_empty
  it('logmint sem rows (rpc_empty) → não grava meta, incrementa handlerErrors', async () => {
    mockGetTableRows.mockResolvedValue({ rows: [] });

    await handleEvent(evt('logmint', {
      asset_id: 999, authorized_minter: 'bingogamescr', new_asset_owner: 'x',
    }));

    expect(handlerErrors.inc).toHaveBeenCalledWith(
      expect.objectContaining({ handler: 'logmint', error_type: 'rpc_empty' }),
    );
    expect(mockRedis.hSet).not.toHaveBeenCalled();
  }, 35_000);
});

describe('B2 — addbacking meta por asset_id', () => {
  it('grava meta keyed por asset_id + upsert no by_asset (esc_id via RPC)', async () => {
    // Row existe pós-action (addbacking) — RPC resolve na 1ª tentativa, sem retry
    mockGetTableRows.mockResolvedValue({ rows: [escrowRow] });

    await handleEvent(evt('addbacking', {
      depositor: 'deposit1', asset_id: 100, token_contract: 'bingogametkn', amount: '100.0000 BINGO',
    }));

    // meta por ASSET_ID (B2 — antes era por esc_id undefined)
    expect(mockRedis.hSet).toHaveBeenCalledWith(
      expect.stringContaining(':100'),
      expect.objectContaining({ asset_id: '100' }),
    );
    // upsert no índice by_asset (C2) — field esc_id, value JSON
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('HGET'),
      {
        keys: ['escrow:by_asset:100', 'escrow:meta:100'],
        arguments: [
          '7', // esc_id resolvido via RPC
          expect.stringContaining('"esc_id":"7"'),
          '3600',
          expect.stringMatching(/^\d+$/),
        ],
      },
    );
  });
});

describe('B4 — releaseburn com fallback RPC', () => {
  it('meta ausente → fallback RPC byasset → claim', async () => {
    mockRedis.hGetAll.mockResolvedValue({}); // meta miss
    mockGetTableRows.mockResolvedValue({ rows: [escrowRow] });
    mockRedis.get.mockResolvedValue(JSON.stringify([{ asset_id: 100, claimed: false }]));

    await handleEvent(evt('releaseburn', { asset_id: 100, owner: 'comprador1' }));

    expect(nftsRedeemed.inc).toHaveBeenCalled();
    // fallback RPC foi chamado (byasset)
    const call = mockGetTableRows.mock.calls[0][0];
    expect(call.table).toBe('escrows');
    expect(call.lower_bound).toBe(100);
  });

  it('meta ausente E RPC falha → handlerErrors rpc_empty (sem crash)', async () => {
    mockRedis.hGetAll.mockResolvedValue({});
    mockGetTableRows.mockResolvedValue({ rows: [] });

    await handleEvent(evt('releaseburn', { asset_id: 999, owner: 'x' }));

    expect(handlerErrors.inc).toHaveBeenCalledWith(
      expect.objectContaining({ handler: 'releaseburn', error_type: 'rpc_empty' }),
    );
  });
});
