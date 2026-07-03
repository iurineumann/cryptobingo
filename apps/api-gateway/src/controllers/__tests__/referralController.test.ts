import { Request, Response } from 'express';

jest.mock('../../models/Referral', () => ({
  Referral: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

import { Referral } from '../../models/Referral';
import {
  getReferralStatus,
  generateReferralCode,
  applyReferralCode,
} from '../referralController';

const mockFindOne = Referral.findOne as jest.Mock;
const mockCreate = Referral.create as jest.Mock;

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function makeReq(opts: {
    params?: Record<string, string>;
    query?:  Record<string, string>;
    body?:   Record<string, unknown>;
    user?:   { wallet: string } | null;
} = {}): Request {
    const hasUser = 'user' in opts;
    return {
        params: opts.params ?? {},
        query:  opts.query  ?? {},
        body:   opts.body   ?? {},
        user:   hasUser ? (opts.user as { wallet: string } | undefined) : { wallet: 'player1.wam' },
    } as unknown as Request;
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    wallet: 'player1.wam',
    referralCode: 'ABC123',
    referred: [],
    rewards: { xpAwarded: 0, ticketsAwarded: 0 },
    save: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getReferralStatus', () => {
  it('retorna status com código existente', async () => {
    const doc = makeDoc({ referred: ['r1', 'r2', 'r3', 'r4', 'r5'], rewards: { xpAwarded: 300, ticketsAwarded: 5 } });
    mockFindOne.mockResolvedValue(doc);

    const req = makeReq();
    const res = makeRes();
    await getReferralStatus(req, res);

    expect(mockFindOne).toHaveBeenCalledWith({ wallet: 'player1.wam' });
    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.code).toBe('ABC123');
    expect(json.totalReferred).toBe(5);
    expect(json.tier).toBe('bronze_referrer');
  });

  it('cria novo doc se wallet não existe', async () => {
    mockFindOne.mockResolvedValue(null);
    const newDoc = makeDoc();
    mockCreate.mockResolvedValue(newDoc);

    const req = makeReq();
    const res = makeRes();
    await getReferralStatus(req, res);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: 'player1.wam', referralCode: expect.any(String) }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 401 sem autenticação', async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    await getReferralStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('generateReferralCode', () => {
  it('retorna código existente se já tem', async () => {
    const doc = makeDoc();
    mockFindOne.mockResolvedValue(doc);

    const req = makeReq();
    const res = makeRes();
    await generateReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0].code).toBe('ABC123');
  });

  it('cria novo código se não tem', async () => {
    mockFindOne.mockResolvedValue(null);
    const newDoc = makeDoc({ referralCode: 'XYZ789' });
    mockCreate.mockResolvedValue(newDoc);

    const req = makeReq();
    const res = makeRes();
    await generateReferralCode(req, res);

    expect(mockCreate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect((res.json as jest.Mock).mock.calls[0][0].code).toBe('XYZ789');
  });

  it('retorna 401 sem autenticação', async () => {
    const req = makeReq({ user: undefined as any });
    const res = makeRes();
    await generateReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('applyReferralCode', () => {
  it('aplica código com sucesso', async () => {
    const referrer = makeDoc({ wallet: 'referrer.wam', referralCode: 'REF123', referred: [] });
    mockFindOne.mockResolvedValue(referrer);

    const req = makeReq({ body: { code: 'REF123' } });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(referrer.referred).toContain('player1.wam');
    expect(referrer.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('retorna 404 se código não existe', async () => {
    mockFindOne.mockResolvedValue(null);

    const req = makeReq({ body: { code: 'INVALID' } });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 400 se tenta usar próprio código', async () => {
    const referrer = makeDoc({ wallet: 'player1.wam', referralCode: 'SELF' });
    mockFindOne.mockResolvedValue(referrer);

    const req = makeReq({ body: { code: 'SELF' } });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 409 se código já usado', async () => {
    const referrer = makeDoc({ wallet: 'referrer.wam', referralCode: 'REF123', referred: ['player1.wam'] });
    mockFindOne.mockResolvedValue(referrer);

    const req = makeReq({ body: { code: 'REF123' } });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('retorna 400 se body.code é inválido', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 401 sem autenticação', async () => {
    const req = makeReq({ user: undefined as any, body: { code: 'REF123' } });
    const res = makeRes();
    await applyReferralCode(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
