import type { Request, Response } from 'express';
import { UserProfile } from '../models/UserProfile';
import { SponsorOrg } from '../models/SponsorOrg';
import { SponsorDelegation } from '../models/SponsorDelegation';
import { logAudit } from '../utils/audit';

export async function updateUserPermissions(req: Request, res: Response) {
  try {
    const { wallet } = req.params;
    const { permissions } = req.body;

    const updated = await UserProfile.findOneAndUpdate(
      { wallet_address: wallet },
      { $set: { permissions } },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    res.json({ wallet_address: updated.wallet_address, permissions: (updated as any).permissions });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar permissões' });
  }
}

export async function listSponsorOrgs(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [orgs, total] = await Promise.all([
      SponsorOrg.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SponsorOrg.countDocuments(),
    ]);

    res.json({ orgs, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar organizações' });
  }
}

export async function getSponsorOrg(req: Request, res: Response) {
  try {
    const { orgId } = req.params;

    const org = await SponsorOrg.findOne({ orgId }).lean();

    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    const delegations = await SponsorDelegation.find({ orgId, active: true }).lean();

    res.json({ ...org, delegations });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar organização' });
  }
}

export async function createDelegation(req: Request, res: Response) {
  try {
    const { orgId } = req.params;
    const { wallet_address, permissions } = req.body;

    const org = await SponsorOrg.findOne({ orgId }).lean();
    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    if (permissions.some((p: string) => p.endsWith('delegations.manage'))) {
      res.status(400).json({ error: 'Não é permitido delegar delegations.manage (prevenção de escalada)' });
      return;
    }

    const delegation = await SponsorDelegation.findOneAndUpdate(
      { orgId, wallet_address },
      {
        $set: {
          permissions,
          delegated_by: (req as any).user?.wallet ?? 'unknown',
          active: true,
        },
      },
      { upsert: true, new: true }
    ).lean();

    res.status(201).json(delegation);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar delegação' });
  }
}

export async function removeDelegation(req: Request, res: Response) {
  try {
    const { orgId, wallet } = req.params;

    const org = await SponsorOrg.findOne({ orgId }).lean();
    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada' });
      return;
    }

    await SponsorDelegation.findOneAndUpdate(
      { orgId, wallet_address: wallet },
      { $set: { active: false } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover delegação' });
  }
}
