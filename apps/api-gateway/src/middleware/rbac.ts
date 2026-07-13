// apps/api-gateway/src/middleware/rbac.ts
// Role-Based Access Control (RBAC) para rotas administrativas.
//
// O role do usuário é lido do MongoDB (campo `role` no perfil).
// O JWT contém apenas `wallet` — o role é verificado a cada request
// para refletir mudanças em tempo real (ex: revogação de admin).
//
// Roles disponíveis (shared-types/index.ts):
//   'player' | 'moderator' | 'sponsor' | 'admin'
//
// Uso:
//   app.post('/admin/patterns', requireAuth, requireRole('admin'), upsertPattern)
//
// Ref: OWASP API Security Top 10 — API1:2023 Broken Object Level Authorization

import { Request, Response, NextFunction } from 'express';
import { UserProfile }                     from '../models/UserProfile';
import type { UserRole }                   from '@cryptobingo/shared-types';
import { hasPermission }                   from '../utils/permissionMatcher';

/**
 * Middleware RBAC — verifica se o usuário autenticado possui o role exigido.
 *
 * Deve ser aplicado APÓS `requireAuth` (que injeta `req.user.wallet`).
 * Consulta o MongoDB para obter o role/permissions atuais — não persiste no JWT
 * para permitir revogação imediata de privilégios.
 *
 * Equivalência role↔permission (ADR-036): `admin.*` nas permissions é tratado
 * como role `admin` (super admin). Assim um usuário pode receber acesso admin
 * via permission OU via role, sem inconsistência entre as duas camadas.
 *
 * Retorna 403 se o role for insuficiente.
 * Retorna 404 se o perfil não existir (nunca fez login).
 */
export function requireRole(...roles: UserRole[]) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const wallet = req.user?.wallet;

        if (!wallet) {
            // requireAuth não foi aplicado antes — configuração incorreta
            res.status(401).json({ error: 'Autenticação necessária.' });
            return;
        }

        try {
            // Busca o perfil no MongoDB para obter o role/permissions atuais
            const profile = await UserProfile.findOne(
                { wallet_address: wallet },
                { role: 1, permissions: 1 }
            ).lean();

            if (!profile) {
                res.status(404).json({ error: 'Perfil não encontrado.' });
                return;
            }

            const userRole = (profile as any).role as UserRole ?? 'player';
            const userPerms: string[] = (profile as any).permissions ?? [];

            // contract_admin tem acesso a qualquer role (superset)
            const isContractAdmin = userRole === 'contract_admin';
            // admin.* nas permissions == role admin (ADR-036)
            const hasAdminWildcard = hasPermission(userPerms, 'admin.*');
            const effectiveAdmin = isContractAdmin || hasAdminWildcard;

            const roleOk =
                isContractAdmin ||
                roles.includes(userRole) ||
                (effectiveAdmin && roles.includes('admin'));

            if (!roleOk) {
                console.warn(
                    `[RBAC] Acesso negado: ${wallet} (role: ${userRole}, perms: ${userPerms.join(',') || '-'}) ` +
                    `tentou acessar rota que exige: ${roles.join(' | ')}`
                );
                res.status(403).json({
                    error: `Acesso negado. Role necessário: ${roles.join(' ou ')}.`,
                });
                return;
            }

            // Injeta o role/permissions no request para uso nos controllers
            (req as any).userRole = userRole;
            (req as any).userPermissions = userPerms;
            next();

        } catch (err) {
            console.error('[RBAC] Erro ao verificar role:', err);
            res.status(500).json({ error: 'Erro interno ao verificar permissões.' });
        }
    };
}
