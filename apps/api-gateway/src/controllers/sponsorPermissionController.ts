import type { Request, Response } from 'express';
import { SponsorOrg } from '../models/SponsorOrg';
import { SponsorDelegation } from '../models/SponsorDelegation';
import { logger } from '../middleware/logger';
export async function getMyOrg(req: Request, res: Response) {
  try {
    const wallet = (req as any).user?.wallet;
    if (!wallet) {
      res.status(401).json({ error: 'Autenticação necessária' });
      return;
    }

    const org = await SponsorOrg.findOne({ owner_wallet: wallet }).lean();

    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada. Você precisa ser sponsor.' });
      return;
    }

    const delegations = await SponsorDelegation.find({ orgId: org.orgId, active: true }).lean();

    res.json({ ...org, delegations });
  } catch (err) {
    logger.error({ err: err, tag: 'SponsorPerm' }, 'getMyOrg');
    res.status(500).json({ error: 'Erro ao buscar organização' });
  }
}

export async function listMyDelegations(req: Request, res: Response) {
  try {
    const wallet = (req as any).user?.wallet;
    const org = await SponsorOrg.findOne({ owner_wallet: wallet }).lean();

    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    const delegations = await SponsorDelegation.find({ orgId: org.orgId }).lean();
    delegations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ orgId: org.orgId, delegations });
  } catch (err) {
    logger.error({ err: err, tag: 'SponsorPerm' }, 'listMyDelegations');
    res.status(500).json({ error: 'Erro ao listar delegações' });
  }
}

export async function createMyDelegation(req: Request, res: Response) {
  try {
    const wallet = (req as any).user?.wallet;
    const { wallet_address, permissions } = req.body;

    const org = await SponsorOrg.findOne({ owner_wallet: wallet }).lean();
    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    if (permissions.some((p: string) => p.endsWith('delegations.manage'))) {
      res.status(400).json({ error: 'Não é permitido delegar delegations.manage (prevenção de escalada)' });
      return;
    }

    const delegation = await SponsorDelegation.findOneAndUpdate(
      { orgId: org.orgId, wallet_address },
      {
        $set: {
          permissions,
          delegated_by: wallet,
          active: true,
        },
      },
      { upsert: true, new: true }
    ).lean();

    res.status(201).json(delegation);
  } catch (err) {
    logger.error({ err: err, tag: 'SponsorPerm' }, 'createMyDelegation');
    res.status(500).json({ error: 'Erro ao criar delegação' });
  }
}

export async function removeMyDelegation(req: Request, res: Response) {
  try {
    const wallet = (req as any).user?.wallet;
    const { wallet: delegateWallet } = req.params;

    const org = await SponsorOrg.findOne({ owner_wallet: wallet }).lean();
    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    await SponsorDelegation.findOneAndUpdate(
      { orgId: org.orgId, wallet_address: delegateWallet },
      { $set: { active: false } }
    );

    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err, tag: 'SponsorPerm' }, 'removeMyDelegation');
    res.status(500).json({ error: 'Erro ao remover delegação' });
  }
}
