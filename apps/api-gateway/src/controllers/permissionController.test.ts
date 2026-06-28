import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

function queryResult(data: unknown) {
  return { lean: () => Promise.resolve(data) };
}

function findChainResult(data: unknown) {
  return {
    sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve(data) }) }) }),
  };
}

const userFindOneAndUpdate = jest.fn();
const orgFindOne = jest.fn();
const orgFind = jest.fn();
const orgCountDocuments = jest.fn();
const delFindOneAndUpdate = jest.fn();
const delFind = jest.fn();

jest.mock('../models/UserProfile', () => ({
  UserProfile: { findOneAndUpdate: userFindOneAndUpdate },
}));
jest.mock('../models/SponsorOrg', () => ({
  SponsorOrg: {
    findOne: orgFindOne,
    find: orgFind,
    countDocuments: orgCountDocuments,
  },
}));
jest.mock('../models/SponsorDelegation', () => ({
  SponsorDelegation: {
    findOneAndUpdate: delFindOneAndUpdate,
    find: delFind,
  },
}));

import {
  updateUserPermissions,
  listSponsorOrgs,
  getSponsorOrg,
  createDelegation,
  removeDelegation,
} from './permissionController';

function mockReq(overrides = {}): Partial<Request> {
  return {
    user: { wallet: 'adminwallet' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as unknown as Response;
}

describe('permissionController', () => {
  let req: Partial<Request>;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockReq();
    res = mockRes();
  });

  describe('updateUserPermissions', () => {
    it('deve atualizar permissions do usuário', async () => {
      req.params = { wallet: 'targetuser' };
      req.body = { permissions: ['admin.*'] };

      userFindOneAndUpdate.mockReturnValue(queryResult({
        wallet_address: 'targetuser',
        permissions: ['admin.*'],
      }));

      await updateUserPermissions(req as Request, res);

      expect(userFindOneAndUpdate).toHaveBeenCalledWith(
        { wallet_address: 'targetuser' },
        { $set: { permissions: ['admin.*'] } },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ wallet_address: 'targetuser' })
      );
    });

    it('deve retornar 404 se usuário não existe', async () => {
      req.params = { wallet: 'nonexistent' };
      req.body = { permissions: ['admin.*'] };

      userFindOneAndUpdate.mockReturnValue(queryResult(null));

      await updateUserPermissions(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listSponsorOrgs', () => {
    it('deve listar orgs com paginação', async () => {
      orgFind.mockReturnValue(findChainResult([
        { orgId: 'org_abc', owner_wallet: 'walt1', name: 'Org 1' },
        { orgId: 'org_xyz', owner_wallet: 'walt2', name: 'Org 2' },
      ]));
      orgCountDocuments.mockResolvedValue(2);

      await listSponsorOrgs(req as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ orgs: expect.arrayContaining([
          expect.objectContaining({ orgId: 'org_abc' }),
        ])})
      );
    });
  });

  describe('getSponsorOrg', () => {
    it('deve retornar org por orgId', async () => {
      req.params = { orgId: 'org_abc' };

      orgFindOne.mockReturnValue(queryResult({
        orgId: 'org_abc',
        owner_wallet: 'walt1',
        name: 'Org 1',
      }));
      delFind.mockReturnValue(queryResult([]));

      await getSponsorOrg(req as Request, res);

      expect(orgFindOne).toHaveBeenCalledWith({ orgId: 'org_abc' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_abc' })
      );
    });

    it('deve retornar 404 se org não existe', async () => {
      req.params = { orgId: 'nonexistent' };

      orgFindOne.mockReturnValue(queryResult(null));

      await getSponsorOrg(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createDelegation', () => {
    it('deve criar delegação para wallet', async () => {
      req.params = { orgId: 'org_abc' };
      req.body = {
        wallet_address: 'delegatewallet',
        permissions: ['sponsor.org_abc.treasury.view'],
      };

      orgFindOne.mockReturnValue(queryResult({
        orgId: 'org_abc',
        owner_wallet: 'ownerwallet',
      }));

      delFindOneAndUpdate.mockReturnValue(queryResult({
        orgId: 'org_abc',
        wallet_address: 'delegatewallet',
        permissions: ['sponsor.org_abc.treasury.view'],
      }));

      await createDelegation(req as Request, res);

      expect(delFindOneAndUpdate).toHaveBeenCalledWith(
        { orgId: 'org_abc', wallet_address: 'delegatewallet' },
        expect.objectContaining({
          $set: expect.objectContaining({
            permissions: ['sponsor.org_abc.treasury.view'],
          }),
        }),
        expect.objectContaining({ upsert: true, new: true })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('deve rejeitar se tentar delegar delegations.manage', async () => {
      req.params = { orgId: 'org_abc' };
      req.body = {
        wallet_address: 'delegatewallet',
        permissions: ['sponsor.org_abc.delegations.manage'],
      };

      await createDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('delegations.manage') })
      );
    });

    it('deve retornar 404 se org não existe', async () => {
      req.params = { orgId: 'nonexistent' };
      req.body = {
        wallet_address: 'delegatewallet',
        permissions: ['sponsor.org_abc.treasury.view'],
      };

      orgFindOne.mockReturnValue(queryResult(null));

      await createDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('removeDelegation', () => {
    it('deve remover delegação (set active=false)', async () => {
      req.params = { orgId: 'org_abc', wallet: 'delegatewallet' };

      orgFindOne.mockReturnValue(queryResult({
        orgId: 'org_abc',
        owner_wallet: 'ownerwallet',
      }));

      delFindOneAndUpdate.mockResolvedValue({
        orgId: 'org_abc',
        wallet_address: 'delegatewallet',
        active: false,
      });

      await removeDelegation(req as Request, res);

      expect(delFindOneAndUpdate).toHaveBeenCalledWith(
        { orgId: 'org_abc', wallet_address: 'delegatewallet' },
        { $set: { active: false } }
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
