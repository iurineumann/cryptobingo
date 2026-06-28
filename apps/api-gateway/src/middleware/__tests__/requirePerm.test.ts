import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

function queryResult(data: unknown) {
  return { lean: () => Promise.resolve(data) };
}

const mockFindOne = jest.fn();
const mockFind = jest.fn();

jest.mock('../../models/UserProfile', () => ({
  UserProfile: { findOne: mockFindOne },
}));
jest.mock('../../models/SponsorDelegation', () => ({
  SponsorDelegation: { find: mockFind },
}));
jest.mock('../../utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

import { requirePerm } from '../requirePerm';

function mockReq(wallet: string): Partial<Request> {
  return { user: { wallet } } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as unknown as Response;
}

describe('requirePerm middleware', () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockReturnValue(queryResult([]));
    req = mockReq('testwallet');
    res = mockRes();
    next = jest.fn();
  });

  it('deve passar se user é contract_admin (bypass)', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'contract_admin',
      permissions: [],
    }));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve passar se user tem a permissão exata', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.users.manage'],
    }));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve passar se user tem wildcard admin.*', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.*'],
    }));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 403 se user NÃO tem a permissão', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.rooms.manage'],
    }));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('sem permissão') })
    );
  });

  it('deve passar se user é sponsor com permissão via delegação', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'sponsor',
      permissions: [],
    }));

    mockFind.mockReturnValue(queryResult([
      {
        orgId: 'org_abc',
        wallet_address: 'testwallet',
        permissions: ['sponsor.org_abc.treasury.view'],
        active: true,
      },
    ]));

    const middleware = requirePerm('sponsor.org_abc.treasury.view');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 403 se delegação está inativa', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'sponsor',
      permissions: [],
    }));

    mockFind.mockReturnValue(queryResult([]));

    const middleware = requirePerm('sponsor.org_abc.treasury.view');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deve aceitar múltiplas permissões (OR): qualquer uma passa', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.rooms.manage'],
    }));

    const middleware = requirePerm('admin.users.manage', 'admin.rooms.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 404 se perfil não existe', async () => {
    mockFindOne.mockReturnValue(queryResult(null));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deve injetar req.userPermissions e req.userRole', async () => {
    mockFindOne.mockReturnValue(queryResult({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.*'],
    }));

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect((req as any).userRole).toBe('admin');
    expect((req as any).userPermissions).toEqual(['admin.*']);
  });
});
