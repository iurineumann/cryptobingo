import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../models/SponsorOrg');
jest.mock('../../models/SponsorDelegation');

import { SponsorOrg } from '../../models/SponsorOrg';
import { SponsorDelegation } from '../../models/SponsorDelegation';
import {
  getMyOrg,
  listMyDelegations,
  createMyDelegation,
  removeMyDelegation,
} from '../sponsorPermissionController';

function mockReq(overrides = {}): Partial<Request> {
  return {
    user: { wallet: 'sponsormaster' },
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as unknown as Response;
}

describe('sponsorPermissionController', () => {
  let req: Partial<Request>;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockReq();
    res = mockRes();
  });

  describe('getMyOrg', () => {
    it('deve retornar org do sponsor master', async () => {
      req = mockReq({ user: { wallet: 'sponsormaster' } });

      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          owner_wallet: 'sponsormaster',
          name: 'Minha Org',
        }),
      });

      (SponsorDelegation.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { wallet_address: 'delegate1', active: true },
        ]),
      });

      await getMyOrg(req as Request, res);

      expect(SponsorOrg.findOne).toHaveBeenCalledWith({ owner_wallet: 'sponsormaster' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_abc' })
      );
    });

    it('deve retornar 404 se não tem org', async () => {
      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await getMyOrg(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listMyDelegations', () => {
    it('deve listar delegações do org do master', async () => {
      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          owner_wallet: 'sponsormaster',
        }),
      });

      (SponsorDelegation.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { wallet_address: 'delegate1', permissions: ['sponsor.org_abc.treasury.view'], active: true, createdAt: new Date('2025-01-01') },
        ]),
      });

      await listMyDelegations(req as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          delegations: expect.arrayContaining([
            expect.objectContaining({ wallet_address: 'delegate1' }),
          ]),
        })
      );
    });
  });

  describe('createMyDelegation', () => {
    it('deve criar delegação como master', async () => {
      req.body = {
        wallet_address: 'delegate2',
        permissions: ['sponsor.org_abc.treasury.view'],
      };

      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          owner_wallet: 'sponsormaster',
        }),
      });

      (SponsorDelegation.findOneAndUpdate as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          wallet_address: 'delegate2',
          permissions: ['sponsor.org_abc.treasury.view'],
        }),
      });

      await createMyDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('deve rejeitar se tentar delegar delegations.manage', async () => {
      req.body = {
        wallet_address: 'delegate2',
        permissions: ['sponsor.org_abc.delegations.manage'],
      };

      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          owner_wallet: 'sponsormaster',
        }),
      });

      await createMyDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('removeMyDelegation', () => {
    it('deve desativar delegação', async () => {
      req.params = { wallet: 'delegate1' };

      (SponsorOrg.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          orgId: 'org_abc',
          owner_wallet: 'sponsormaster',
        }),
      });

      (SponsorDelegation.findOneAndUpdate as jest.Mock).mockResolvedValue({
        active: false,
      });

      await removeMyDelegation(req as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
