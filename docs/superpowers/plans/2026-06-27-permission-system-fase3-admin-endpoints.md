# Fase 3 — Endpoints Admin (Permissions, Orgs, Delegações) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: test first.

**Goal:** Criar endpoints para admin gerenciar permissões de usuários, organizações sponsor e delegações.

**Dependencies:** Fase 2 (middleware requirePerm).

---

## Global Constraints

- TDD: cada endpoint começa com teste de integração.
- Requer `requirePerm` nas rotas.
- `contract_admin` bypassa tudo.
- admin.sponsors.view/manage controlam acesso a endpoints de org/delegação.
- admin.users.manage controla edição de permissões de outros usuários.
- Typecheck: `npx tsc --project tsconfig.build.json --noEmit`.
- Testes: `npx jest <file>`.

---

## Arquivos

| Ação | Arquivo |
|------|---------|
| Create | `apps/api-gateway/src/controllers/__tests__/adminPermissions.test.ts` |
| Create | `apps/api-gateway/src/controllers/permissionController.ts` |
| Edit | `apps/api-gateway/src/index.ts` |

---

### Task 1: TDD — Testes dos endpoints admin

- [ ] **Step 1: Criar `apps/api-gateway/src/controllers/__tests__/adminPermissions.test.ts`**

Testar:
1. `PUT /api/v1/admin/users/:wallet/permissions` — admin.users.manage
2. `GET /api/v1/admin/sponsor-orgs` — admin.sponsors.view
3. `GET /api/v1/admin/sponsor-orgs/:orgId` — admin.sponsors.view
4. `POST /api/v1/admin/sponsor-orgs/:orgId/delegations` — admin.sponsors.manage
5. `DELETE /api/v1/admin/sponsor-orgs/:orgId/delegations/:wallet` — admin.sponsors.manage

```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../models/UserProfile');
jest.mock('../../models/SponsorOrg');
jest.mock('../../models/SponsorDelegation');

import { UserProfile } from '../../models/UserProfile';
import { SponsorOrg } from '../../models/SponsorOrg';
import { SponsorDelegation } from '../../models/SponsorDelegation';
import {
  updateUserPermissions,
  listSponsorOrgs,
  getSponsorOrg,
  createDelegation,
  removeDelegation,
} from '../permissionController';

function mockReq(overrides = {}): Partial<Request> {
  return {
    user: { wallet: 'adminwallet' },
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
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

      (UserProfile.findOneAndUpdate as jest.Mock).mockResolvedValue({
        wallet_address: 'targetuser',
        permissions: ['admin.*'],
      });

      await updateUserPermissions(req as Request, res);

      expect(UserProfile.findOneAndUpdate).toHaveBeenCalledWith(
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

      (UserProfile.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      await updateUserPermissions(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listSponsorOrgs', () => {
    it('deve listar orgs com paginação', async () => {
      (SponsorOrg.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { orgId: 'org_abc', owner_wallet: 'walt1', name: 'Org 1' },
          { orgId: 'org_xyz', owner_wallet: 'walt2', name: 'Org 2' },
        ]),
      });

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

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'walt1',
        name: 'Org 1',
      });

      await getSponsorOrg(req as Request, res);

      expect(SponsorOrg.findOne).toHaveBeenCalledWith({ orgId: 'org_abc' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_abc' })
      );
    });

    it('deve retornar 404 se org não existe', async () => {
      req.params = { orgId: 'nonexistent' };

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue(null);

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

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'ownerwallet',
      });

      (SponsorDelegation.findOneAndUpdate as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        wallet_address: 'delegatewallet',
        permissions: ['sponsor.org_abc.treasury.view'],
      });

      await createDelegation(req as Request, res);

      expect(SponsorDelegation.findOneAndUpdate).toHaveBeenCalledWith(
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

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue(null);

      await createDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('removeDelegation', () => {
    it('deve remover delegação (set active=false)', async () => {
      req.params = { orgId: 'org_abc', wallet: 'delegatewallet' };

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'ownerwallet',
      });

      (SponsorDelegation.findOneAndUpdate as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        wallet_address: 'delegatewallet',
        active: false,
      });

      await removeDelegation(req as Request, res);

      expect(SponsorDelegation.findOneAndUpdate).toHaveBeenCalledWith(
        { orgId: 'org_abc', wallet_address: 'delegatewallet' },
        { $set: { active: false } }
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
```

- [ ] **Step 2: Verificar que falha** (controller não existe — red)

---

### Task 2: Implementar permissionController

- [ ] **Step 1: Criar `apps/api-gateway/src/controllers/permissionController.ts`**

```ts
import type { Request, Response } from 'express';
import { UserProfile } from '../models/UserProfile';
import { SponsorOrg } from '../models/SponsorOrg';
import { SponsorDelegation } from '../models/SponsorDelegation';

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

    res.json({ wallet_address: updated.wallet_address, permissions: updated.permissions });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar permissões' });
  }
}

export async function listSponsorOrgs(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const orgs = await SponsorOrg.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await SponsorOrg.countDocuments();

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

    // Buscar delegações junto
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
```

- [ ] **Step 2: Rodar testes — passar**
  ```bash
  npx jest src/controllers/__tests__/adminPermissions.test.ts
  ```

---

### Task 3: Registrar rotas no index.ts

- [ ] **Step 1: Importar controller + middleware**

Em `apps/api-gateway/src/index.ts`, adicionar:

```ts
import {
  updateUserPermissions,
  listSponsorOrgs,
  getSponsorOrg,
  createDelegation,
  removeDelegation,
} from './controllers/permissionController';
```

- [ ] **Step 2: Registrar rotas**

Dentro de `registerRoutes()`, adicionar:

```ts
// ── Permissions / Sponsor Orgs (admin) ──────────────
app.put('/api/v1/admin/users/:wallet/permissions',
  adminLimiter, requireAuth, requireRole('admin'), requirePerm('admin.users.manage'),
  updateUserPermissions
);

app.get('/api/v1/admin/sponsor-orgs',
  adminLimiter, requireAuth, requireRole('admin'), requirePerm('admin.sponsors.view'),
  listSponsorOrgs
);

app.get('/api/v1/admin/sponsor-orgs/:orgId',
  adminLimiter, requireAuth, requireRole('admin'), requirePerm('admin.sponsors.view'),
  getSponsorOrg
);

app.post('/api/v1/admin/sponsor-orgs/:orgId/delegations',
  adminLimiter, requireAuth, requireRole('admin'), requirePerm('admin.sponsors.manage'),
  createDelegation
);

app.delete('/api/v1/admin/sponsor-orgs/:orgId/delegations/:wallet',
  adminLimiter, requireAuth, requireRole('admin'), requirePerm('admin.sponsors.manage'),
  removeDelegation
);
```

---

### Task 4: Verificação final

- [ ] **Step 1: Rodar typecheck**
- [ ] **Step 2: Rodar todos os testes**
- [ ] **Step 3: Verificar regressão zero**
