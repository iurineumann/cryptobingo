import type { Request, Response } from 'express';
import { UserProfile } from '../models/UserProfile';
import { SponsorOrg } from '../models/SponsorOrg';
import { SponsorDelegation } from '../models/SponsorDelegation';
import { logAudit } from '../utils/audit';
import { logger } from '../middleware/logger';
const ORG_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateOrgId(): string {
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += ORG_ID_ALPHABET[Math.floor(Math.random() * ORG_ID_ALPHABET.length)];
    }
    return `org_${id}`;
}
export async function updateUserPermissions(req: Request, res: Response) {
  try {
    const { wallet } = req.params;
    let { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions deve ser um array de strings.' });
      return;
    }
    permissions = permissions.map((p: unknown) => String(p));

    const existing = await UserProfile.findOne({ wallet_address: wallet }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const oldRole = (existing as any).role ?? 'player';
    const oldPerms: string[] = (existing as any).permissions ?? [];

    // Invariante role↔perm (ADR-036): admin.* nas permissions implica role admin,
    // e ausência de admin.* em role admin rebaixa para player. Evita estado órfão
    // (ex: permissions admin.* mas role player — o bug do cworldcntrct).
    let nextRole = oldRole;
    if (permissions.includes('admin.*') && oldRole === 'player') {
      nextRole = 'admin';
    } else if (!permissions.includes('admin.*') && oldRole === 'admin') {
      nextRole = 'player';
    }

    const updated = await UserProfile.findOneAndUpdate(
      { wallet_address: wallet },
      { $set: { permissions, role: nextRole } },
      { new: true }
    ).lean();

    await logAudit({
      actor: (req as any).user?.wallet ?? 'system',
      action: 'perm.update',
      target: `wallet:${wallet}`,
      details: {
        oldPermissions: oldPerms,
        newPermissions: permissions,
        oldRole,
        newRole: nextRole,
        roleChanged: oldRole !== nextRole,
      },
      ip: req.ip,
      userAgent: req.headers?.['user-agent'] as string,
    });

    res.json({
      wallet_address: updated!.wallet_address,
      role: (updated as any).role,
      permissions: (updated as any).permissions,
    });
  } catch (err) {
    logger.error({ err: err, tag: 'PermissionController' }, 'updateUserPermissions');
    res.status(500).json({ error: 'Erro ao atualizar permissões' });
  }
}

export async function listSponsorOrgs(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [allOrgs, total] = await Promise.all([
      SponsorOrg.find().lean(),
      SponsorOrg.countDocuments(),
    ]);
    allOrgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const orgs = allOrgs.slice(skip, skip + limit);

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

export async function createSponsorOrg(req: Request, res: Response) {
  try {
    const { owner_wallet, name } = req.body;

    if (!owner_wallet || typeof owner_wallet !== 'string') {
      res.status(400).json({ error: 'Campo "owner_wallet" obrigatório.' });
      return;
    }

    const wallet = owner_wallet.trim().toLowerCase();

    const profile = await UserProfile.findOne({ wallet_address: wallet }).lean();
    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado. Usuário precisa fazer login primeiro.' });
      return;
    }

    const existingOrg = await SponsorOrg.findOne({ owner_wallet: wallet }).lean();
    if (existingOrg) {
      res.status(409).json({ error: 'Wallet já possui uma organização sponsor.' });
      return;
    }

    const orgId = generateOrgId();

    await SponsorOrg.create({
      orgId,
      owner_wallet: wallet,
      name: name?.trim() || `Org de ${owner_wallet}`,
      settings: { autoApproveDelegations: true },
    });

    let permissionsAutoAssigned = false;
    try {
      await UserProfile.updateOne(
        { wallet_address: wallet },
        { $addToSet: { permissions: `sponsor.${orgId}.*` } }
      );
      permissionsAutoAssigned = true;
    } catch {
      // não-bloqueante — admin pode atribuir manualmente
    }

    await logAudit({
      actor: (req as any).user?.wallet ?? 'system',
      action: 'org.create',
      target: `org:${orgId}`,
      details: { owner_wallet: owner_wallet },
      ip: req.ip,
      userAgent: req.headers?.['user-agent'] as string,
    });

    res.status(201).json({ orgId, owner_wallet: wallet, name: name?.trim() || `Org de ${owner_wallet}`, permissionsAutoAssigned });
  } catch (err) {
    logger.error({ err: err, tag: 'PermissionController' }, 'createSponsorOrg');
    res.status(500).json({ error: 'Erro ao criar organização sponsor.' });
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
