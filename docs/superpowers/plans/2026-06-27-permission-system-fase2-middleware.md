# Fase 2 — Middleware requirePerm + Pattern Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: write test FIRST, then code.

**Goal:** Criar middleware `requirePerm` que verifica permissões granulares, integrando com `UserProfile.permissions` e `SponsorDelegation`.

**Dependencies:** Fase 1 completa (permissionMatcher, modelos, campo permissions).

---

## Global Constraints

- TDD: cada passo começa pelo teste.
- `requirePerm` não substitui `requireRole` — são complementares.
- `contract_admin` bypassa qualquer `requirePerm` (sem precisar de permissão explícita).
- Para sponsors, buscar `SponsorDelegation` ativa do wallet + org.
- Typecheck: `npx tsc --project tsconfig.build.json --noEmit` no api-gateway.
- Testes: `npx jest <file>`.

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Create | `apps/api-gateway/src/middleware/__tests__/requirePerm.test.ts` | Testes TDD |
| Create | `apps/api-gateway/src/middleware/requirePerm.ts` | Middleware |
| Edit | `apps/api-gateway/src/controllers/profileController.ts` | Retornar permissions no GET /profile |

---

### Task 1: TDD — Teste do middleware requirePerm

- [ ] **Step 1: Criar `apps/api-gateway/src/middleware/__tests__/requirePerm.test.ts`**

```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// Mock dos modelos
jest.mock('../../models/UserProfile');
jest.mock('../../models/SponsorDelegation');

import { UserProfile } from '../../models/UserProfile';
import { SponsorDelegation } from '../../models/SponsorDelegation';
import { requirePerm } from '../requirePerm';

function mockReq(wallet: string): Partial<Request> {
  return {
    user: { wallet },
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as Response;
}

describe('requirePerm middleware', () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockReq('testwallet');
    res = mockRes();
    next = jest.fn();
  });

  it('deve passar se user é contract_admin (bypass)', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'contract_admin',
      permissions: [],
    });

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve passar se user tem a permissão exata', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.users.manage'],
    });

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve passar se user tem wildcard admin.*', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.*'],
    });

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 403 se user NÃO tem a permissão', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.rooms.manage'],
    });

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('sem permissão') })
    );
  });

  it('deve passar se user é sponsor com permissão via delegação', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'sponsor',
      permissions: [],
    });

    (SponsorDelegation.find as jest.Mock).mockResolvedValue([
      {
        orgId: 'org_abc',
        wallet_address: 'testwallet',
        permissions: ['sponsor.org_abc.treasury.view'],
        active: true,
      },
    ]);

    const middleware = requirePerm('sponsor.org_abc.treasury.view');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 403 se delegação está inativa', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'sponsor',
      permissions: [],
    });

    (SponsorDelegation.find as jest.Mock).mockResolvedValue([
      {
        orgId: 'org_abc',
        wallet_address: 'testwallet',
        permissions: ['sponsor.org_abc.treasury.view'],
        active: false,
      },
    ]);

    const middleware = requirePerm('sponsor.org_abc.treasury.view');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deve aceitar múltiplas permissões (OR): qualquer uma passa', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.rooms.manage'],
    });

    const middleware = requirePerm('admin.users.manage', 'admin.rooms.manage');
    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 404 se perfil não existe', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue(null);

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deve injetar req.userPermissions e req.userRole', async () => {
    (UserProfile.findOne as jest.Mock).mockResolvedValue({
      wallet_address: 'testwallet',
      role: 'admin',
      permissions: ['admin.*'],
    });

    const middleware = requirePerm('admin.users.manage');
    await middleware(req as Request, res, next);

    expect((req as any).userRole).toBe('admin');
    expect((req as any).userPermissions).toEqual(['admin.*']);
  });
});
```

- [ ] **Step 2: Verificar que falha** (arquivo não existe — red)

---

### Task 2: Implementar middleware requirePerm

- [ ] **Step 1: Criar `apps/api-gateway/src/middleware/requirePerm.ts`**

```ts
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
      const userPermissions: string[] = profile.permissions ?? [];

      // contract_admin: bypass total
      if (userRole === 'contract_admin') {
        (req as any).userRole = userRole;
        (req as any).userPermissions = userPermissions;
        next();
        return;
      }

      // Busca delegações sponsor (se houver)
      const delegations = await SponsorDelegation.find({
        wallet_address: wallet,
        active: true,
      }).lean();

      let combinedPermissions = [...userPermissions];

      for (const del of delegations) {
        combinedPermissions.push(...del.permissions);
      }

      // Verifica se alguma permissão combinada casa com alguma requerida
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
```

- [ ] **Step 2: Rodar testes — devem passar**
  ```bash
  npx jest src/middleware/__tests__/requirePerm.test.ts
  ```

---

### Task 3: Garantir que GET /profile retorna permissions

- [ ] **Step 1: Verificar profileController**

Em `apps/api-gateway/src/controllers/profileController.ts`, na resposta do `getProfile`, confirmar que `permissions` está incluso:

```ts
// Já deve estar incluído se usamos .lean() — o campo existe no schema da Fase 1.
// Se não, adicionar explicitamente:
const profile = await UserProfile.findOne({ wallet_address }).select('+permissions').lean();
```

- [ ] **Step 2: Typecheck + testes**
  ```bash
  npx tsc --project tsconfig.build.json --noEmit
  npx jest
  ```

---

### Task 4: Verificação final

- [ ] **Step 1: Rodar typecheck**
- [ ] **Step 2: Rodar todos os testes**
- [ ] **Step 3: Verificar que não há regressão**
