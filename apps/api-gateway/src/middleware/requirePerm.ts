import type { Request, Response, NextFunction } from 'express';
import { UserProfile } from '../models/UserProfile';
import { SponsorDelegation } from '../models/SponsorDelegation';
import { hasPermission } from '../utils/permissionMatcher';
import { logAudit } from '../utils/audit';

export function requirePerm(...perms: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = (req as any).user?.wallet;
      if (!wallet) {
        res.status(401).json({ error: 'Autenticação necessária' });
        return;
      }

      const profile = await UserProfile.findOne({ wallet_address: wallet }).lean();
      if (!profile) {
        res.status(404).json({ error: 'Perfil não encontrado' });
        return;
      }

      const userRole = profile.role;
      const userPermissions: string[] = (profile as any).permissions ?? [];

      if (userRole === 'contract_admin') {
        (req as any).userRole = userRole;
        (req as any).userPermissions = userPermissions;
        next();
        return;
      }

      const delegations = await SponsorDelegation.find({
        wallet_address: wallet,
        active: true,
      }).lean();

      const combinedPermissions = [...userPermissions];
      for (const del of delegations) {
        combinedPermissions.push(...(del as any).permissions);
      }

      const hasAny = perms.some((required) =>
        hasPermission(combinedPermissions, required)
      );

      if (!hasAny) {
        await logAudit({
          actor: wallet,
          action: 'perm.denied',
          target: `wallet:${wallet}`,
          details: {
            route: req.originalUrl,
            method: req.method,
            requiredPerms: perms,
            userRole,
            userPermissions,
          },
          ip: req.ip,
          userAgent: req.headers?.['user-agent'] as string,
        });

        res.status(403).json({
          error: 'Acesso negado: sem permissão necessária',
          required: perms,
        });
        return;
      }

      (req as any).userRole = userRole;
      (req as any).userPermissions = userPermissions;
      next();
    } catch (err) {
      next(err);
    }
  };
}
