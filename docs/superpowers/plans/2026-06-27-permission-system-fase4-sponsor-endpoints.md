# Fase 4 — Endpoints Sponsor Self-Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: test first.

**Goal:** Sponsor master gerenciar próprio org e delegações via API self-service.

**Dependencies:** Fase 3 (admin endpoints + permissionController patterns).

---

## Global Constraints

- Requer `requirePerm` com escopo dinâmico — sponsor precisa ter `sponsor.{seuOrgId}.delegations.manage`.
- Sponsor master é identificado por ser `owner_wallet` do SponsorOrg.
- Typecheck + testes verdes.

---

## Arquivos

| Ação | Arquivo |
|------|---------|
| Create | `apps/api-gateway/src/controllers/__tests__/sponsorPermissions.test.ts` |
| Create | `apps/api-gateway/src/controllers/sponsorPermissionController.ts` |
| Edit | `apps/api-gateway/src/index.ts` |

---

### Task 1: TDD — Testes dos endpoints sponsor self-service

- [ ] **Step 1: Criar `apps/api-gateway/src/controllers/__tests__/sponsorPermissions.test.ts`**

```ts
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
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
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

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'sponsormaster',
        name: 'Minha Org',
      });

      await getMyOrg(req as Request, res);

      expect(SponsorOrg.findOne).toHaveBeenCalledWith({ owner_wallet: 'sponsormaster' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_abc' })
      );
    });

    it('deve retornar 404 se não tem org', async () => {
      (SponsorOrg.findOne as jest.Mock).mockResolvedValue(null);

      await getMyOrg(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listMyDelegations', () => {
    it('deve listar delegações do org do master', async () => {
      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'sponsormaster',
      });

      (SponsorDelegation.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          { wallet_address: 'delegate1', permissions: ['sponsor.org_abc.treasury.view'], active: true },
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

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'sponsormaster',
      });

      (SponsorDelegation.findOneAndUpdate as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        wallet_address: 'delegate2',
        permissions: ['sponsor.org_abc.treasury.view'],
      });

      await createMyDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('deve rejeitar se tentar delegar delegations.manage', async () => {
      req.body = {
        wallet_address: 'delegate2',
        permissions: ['sponsor.org_abc.delegations.manage'],
      };

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'sponsormaster',
      });

      await createMyDelegation(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('removeMyDelegation', () => {
    it('deve desativar delegação', async () => {
      req.params = { wallet: 'delegate1' };

      (SponsorOrg.findOne as jest.Mock).mockResolvedValue({
        orgId: 'org_abc',
        owner_wallet: 'sponsormaster',
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
```

- [ ] **Step 2: Verificar que falha (red)**

---

### Task 2: Implementar sponsorPermissionController

- [ ] **Step 1: Criar `apps/api-gateway/src/controllers/sponsorPermissionController.ts`**

```ts
import type { Request, Response } from 'express';
import { SponsorOrg } from '../models/SponsorOrg';
import { SponsorDelegation } from '../models/SponsorDelegation';

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

    const delegations = await SponsorDelegation.find({ orgId: org.orgId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ orgId: org.orgId, delegations });
  } catch (err) {
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
    res.status(500).json({ error: 'Erro ao remover delegação' });
  }
}
```

- [ ] **Step 2: Rodar testes — passar (green)**

---

### Task 3: Registrar rotas no index.ts

- [ ] **Step 1: Importar + registrar**

```ts
import {
  getMyOrg,
  listMyDelegations,
  createMyDelegation,
  removeMyDelegation,
} from './controllers/sponsorPermissionController';

// ── Sponsor Self-Service ────────────────────────────
app.get('/api/v1/sponsor/org',
  authLimiter, requireAuth,
  getMyOrg
);

app.get('/api/v1/sponsor/delegations',
  authLimiter, requireAuth,
  listMyDelegations
);

app.post('/api/v1/sponsor/delegations',
  authLimiter, requireAuth,
  createMyDelegation
);

app.delete('/api/v1/sponsor/delegations/:wallet',
  authLimiter, requireAuth,
  removeMyDelegation
);
```

Nota: rotas sponsor self-service usam `authLimiter` (não `adminLimiter`) e `requireAuth` apenas — o controller já valida que o caller é owner_wallet do org. Não precisamos de `requireRole('sponsor')` extra pois se ele não for sponsor, não achará org.

---

### Task 4: Verificação final

- [ ] **Step 1: Typecheck**
- [ ] **Step 2: Testes**
- [ ] **Step 3: Sem regressão**
