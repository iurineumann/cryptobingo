# Fase 1 — Modelos MongoDB + Campo Permissions + Auto-atribuição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task. TDD: write test FIRST, then code to pass.

**Goal:** Adicionar `permissions: string[]` ao `UserProfile`, criar modelos `SponsorOrg` e `SponsorDelegation`, implementar auto-atribuição de permissions ao promover admin/sponsor.

**Dependencies:** Nenhuma (primeira fase).

---

## Global Constraints

- Idioma: PT-BR. Comentários explicam *porquê*, não *o quê*.
- TDD: cada task começa pelo teste.
- Typecheck: `npx tsc --project tsconfig.build.json --noEmit` na raiz do api-gateway.
- Testes: `npx jest <file>` (api-gateway usa jest).
- Compromissos PT-BR `tipo(escopo): ...` com `Co-Authored-By:`.
- Git flow: branch `feature/perm-system-fase1` de `develop`.

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Edit | `packages/shared-types/src/index.ts` | Add PermissionTemplate type, PermissionPattern |
| Create | `apps/api-gateway/src/models/SponsorOrg.ts` | Mongoose schema |
| Create | `apps/api-gateway/src/models/SponsorDelegation.ts` | Mongoose schema |
| Edit | `apps/api-gateway/src/models/UserProfile.ts` | Add `permissions` field |
| Create | `apps/api-gateway/src/utils/permissionMatcher.ts` | Pattern matching + teste |
| Create | `apps/api-gateway/src/utils/__tests__/permissionMatcher.test.ts` | Testes TDD |
| Edit | `apps/api-gateway/src/controllers/profileController.ts` | Auto-atribuição |
| Edit | `apps/api-gateway/src/index.ts` | Registrar novas rotas (se houver) |

---

### Task 1: Add permission types to shared-types

**Test first: N/A (type-only, sem runtime).**

- [ ] **Step 1: Adicionar tipos no shared-types**

Em `packages/shared-types/src/index.ts`, adicionar:

```ts
// Permissões granulares do sistema (ADR-036)
export type AdminPermission =
  | 'admin.dashboard.view'
  | 'admin.rooms.manage'
  | 'admin.patterns.manage'
  | 'admin.gametypes.manage'
  | 'admin.users.view'
  | 'admin.users.manage'
  | 'admin.sponsors.view'
  | 'admin.sponsors.manage'
  | 'admin.tokens.manage'
  | 'admin.nfts.manage'
  | 'admin.campaigns.manage'
  | 'admin.vault.manage'
  | 'admin.compliance.view'
  | 'admin.news.manage'
  | 'admin.config.manage';

export type SponsorPermission =
  | `sponsor.${string}.dashboard.view`
  | `sponsor.${string}.rooms.manage`
  | `sponsor.${string}.rooms.${string}.manage`
  | `sponsor.${string}.nfts.manage`
  | `sponsor.${string}.treasury.view`
  | `sponsor.${string}.treasury.withdraw`
  | `sponsor.${string}.drops.manage`
  | `sponsor.${string}.campaigns.manage`
  | `sponsor.${string}.layouts.manage`
  | `sponsor.${string}.delegations.manage`;

export type Permission = AdminPermission | SponsorPermission | 'admin.*';

export interface SponsorOrgDocument {
  orgId: string;
  owner_wallet: string;
  name: string;
  settings: {
    autoApproveDelegations: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorDelegationDocument {
  orgId: string;
  wallet_address: string;
  permissions: Permission[];
  delegated_by: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Task 2: TDD — Teste do permissionMatcher

**Red: escrever teste que falha → Green: implementar → Refactor.**

- [ ] **Step 1: Escrever o teste**

Criar `apps/api-gateway/src/utils/__tests__/permissionMatcher.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { hasPermission } from '../permissionMatcher';

describe('permissionMatcher', () => {
  describe('hasPermission', () => {
    it('deve casar exato: admin.users.manage === admin.users.manage', () => {
      expect(hasPermission(['admin.users.manage'], 'admin.users.manage')).toBe(true);
    });

    it('deve casar wildcard: admin.* casa admin.users.manage', () => {
      expect(hasPermission(['admin.*'], 'admin.users.manage')).toBe(true);
    });

    it('deve casar wildcard: admin.* casa admin.dashboard.view', () => {
      expect(hasPermission(['admin.*'], 'admin.dashboard.view')).toBe(true);
    });

    it('deve casar sponsor wildcard: sponsor.org_abc.* casa sponsor.org_abc.rooms.manage', () => {
      expect(hasPermission(['sponsor.org_abc.*'], 'sponsor.org_abc.rooms.manage')).toBe(true);
    });

    it('deve casar sponsor wildcard segundo nível: sponsor.*.treasury.view casa sponsor.org_abc.treasury.view', () => {
      expect(hasPermission(['sponsor.*.treasury.view'], 'sponsor.org_abc.treasury.view')).toBe(true);
    });

    it('deve NÃO casar quando namespace diferente', () => {
      expect(hasPermission(['admin.users.manage'], 'admin.rooms.manage')).toBe(false);
    });

    it('deve NÃO casar quando orgId diferente', () => {
      expect(hasPermission(['sponsor.org_abc.rooms.manage'], 'sponsor.org_xyz.rooms.manage')).toBe(false);
    });

    it('deve NÃO casar wildcard admin.* contra sponsor.*', () => {
      expect(hasPermission(['admin.*'], 'sponsor.org_abc.dashboard.view')).toBe(false);
    });

    it('deve aceitar array vazio como false', () => {
      expect(hasPermission([], 'admin.users.manage')).toBe(false);
    });

    it('deve aceitar multiplas perms: qualquer uma casa', () => {
      expect(hasPermission(
        ['admin.rooms.manage', 'admin.users.manage'],
        'admin.users.manage'
      )).toBe(true);
    });

    it('deve casar contract_admin como bypass (lista null)', () => {
      expect(hasPermission(null, 'admin.users.manage')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Verificar que o teste falha** (arquivo não existe ainda — red)

---

### Task 3: Implementar permissionMatcher

- [ ] **Step 1: Criar o utility**

Criar `apps/api-gateway/src/utils/permissionMatcher.ts`:

```ts
export function hasPermission(
  userPermissions: string[] | null | undefined,
  requiredPermission: string
): boolean {
  if (!userPermissions) return true;

  for (const pattern of userPermissions) {
    if (matchPermission(pattern, requiredPermission)) return true;
  }
  return false;
}

export function matchPermission(pattern: string, permission: string): boolean {
  const patternParts = pattern.split('.');
  const permissionParts = permission.split('.');

  if (patternParts.length > permissionParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== permissionParts[i]) return false;
  }

  return true;
}
```

- [ ] **Step 2: Rodar teste — deve passar (green)**
  ```bash
  npx jest src/utils/__tests__/permissionMatcher.test.ts
  ```

---

### Task 4: Adicionar campo `permissions` ao UserProfile

- [ ] **Step 1: Editar schema**

Em `apps/api-gateway/src/models/UserProfile.ts`, adicionar após o campo `role`:

```ts
permissions: {
  type: [String],
  default: [],
  index: true,
}
```

- [ ] **Step 2: Typecheck**
  ```bash
  npx tsc --project tsconfig.build.json --noEmit
  ```

---

### Task 5: Criar modelo SponsorOrg

- [ ] **Step 1: Criar `apps/api-gateway/src/models/SponsorOrg.ts`**

```ts
import { Schema, model, Document } from 'mongoose';

export interface ISponsorOrg extends Document {
  orgId: string;
  owner_wallet: string;
  name: string;
  settings: {
    autoApproveDelegations: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SponsorOrgSchema = new Schema<ISponsorOrg>(
  {
    orgId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    owner_wallet: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
    },
    settings: {
      autoApproveDelegations: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const SponsorOrg = model<ISponsorOrg>('SponsorOrg', SponsorOrgSchema);
```

---

### Task 7: Criar modelo AuditLog + Utility

> ⚠️ AuditLog é usado por TODAS as fases seguintes. Implementar com cuidado.

- [ ] **Step 1: Criar `apps/api-gateway/src/models/AuditLog.ts`**

```ts
import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor:    { type: String, required: true, index: true },
    action:   { type: String, required: true, index: true },
    target:   { type: String, required: true, index: true },
    details:  { type: Schema.Types.Mixed, default: {} },
    ip:       { type: String, default: '' },
    userAgent:{ type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
```

- [ ] **Step 2: Criar utility de audit**

Criar `apps/api-gateway/src/utils/audit.ts`:

```ts
import { AuditLog } from '../models/AuditLog';

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      details: entry.details ?? {},
      ip: entry.ip ?? '',
      userAgent: entry.userAgent ?? '',
    });
  } catch (err) {
    console.error('[Audit] Falha ao registrar:', entry.action, err);
  }
}
```

### Task 8: Criar modelo SponsorDelegation

- [ ] **Step 1: Criar `apps/api-gateway/src/models/SponsorDelegation.ts`**

```ts
import { Schema, model, Document } from 'mongoose';

export interface ISponsorDelegation extends Document {
  orgId: string;
  wallet_address: string;
  permissions: string[];
  delegated_by: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorDelegationSchema = new Schema<ISponsorDelegation>(
  {
    orgId: {
      type: String,
      required: true,
      index: true,
    },
    wallet_address: {
      type: String,
      required: true,
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    delegated_by: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

SponsorDelegationSchema.index({ orgId: 1, wallet_address: 1 }, { unique: true });

export const SponsorDelegation = model<ISponsorDelegation>(
  'SponsorDelegation',
  SponsorDelegationSchema
);
```

---

### Task 9: Auto-atribuição de permissions no profileController (com audit)

- [ ] **Step 1: TDD — Teste de auto-atribuição**

Criar `apps/api-gateway/src/controllers/__tests__/profileController.permissions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
// Mock mongoose models and test the auto-assignment logic
// This test should:
// 1. Mock UserProfile.findOneAndUpdate
// 2. Call getProfile logic with role === 'admin'
// 3. Assert permissions set to ['admin.*']
// 4. Call getProfile logic with role === 'sponsor'
// 5. Assert SponsorOrg.create was called
// 6. Assert permissions set to ['sponsor.{orgId}.*']
```

- [ ] **Step 2: Implementar no profileController**

Em `apps/api-gateway/src/controllers/profileController.ts`, na função `getProfile` (ou na `assignRole`):

**Onde o perfil é criado (getProfile):** Após criar perfil, se `wallet_address === CONTRACT_ACCOUNT`, setar role `contract_admin`.

**Onde role é atribuída (assignRole):** Após `findOneAndUpdate({ role })`, se nova role === `'admin'`, setar `permissions = ['admin.*']`. Se nova role === `'sponsor'`:

```ts
import { SponsorOrg } from '../models/SponsorOrg';
import { logAudit } from '../utils/audit';
import { customAlphabet } from 'nanoid'; // ou crypto.randomUUID
const generateOrgId = () => `org_${customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)()}`;

// Dentro de assignRole, quando role === 'sponsor':
const oldProfile = await UserProfile.findOne({ wallet_address: wallet }).lean();
const existingOrg = await SponsorOrg.findOne({ owner_wallet: wallet });

if (!existingOrg) {
  const orgId = generateOrgId();
  await SponsorOrg.create({
    orgId,
    owner_wallet: wallet,
    name: `Org de ${wallet}`,
    settings: { autoApproveDelegations: true },
  });
  await UserProfile.findOneAndUpdate(
    { wallet_address: wallet },
    { $set: { permissions: [`sponsor.${orgId}.*`] } }
  );

  await logAudit({
    actor: req.user?.wallet ?? 'system',
    action: 'org.create',
    target: `org:${orgId}`,
    details: { owner_wallet: wallet },
    ip: req.ip,
    userAgent: req.headers?.['user-agent'] as string,
  });
} else {
  await UserProfile.findOneAndUpdate(
    { wallet_address: wallet },
    { $set: { permissions: [`sponsor.${existingOrg.orgId}.*`] } }
  );
}

// Log da mudança de role
await logAudit({
  actor: req.user?.wallet ?? 'system',
  action: 'role.assign',
  target: `wallet:${wallet}`,
  details: {
    oldRole: oldProfile?.role ?? 'none',
    newRole: role,
    oldPermissions: oldProfile?.permissions ?? [],
    newPermissions: role === 'sponsor'
      ? [`sponsor.${existingOrg?.orgId ?? orgId}.*`]
      : role === 'admin' ? ['admin.*'] : [],
  },
  ip: req.ip,
  userAgent: req.headers?.['user-agent'] as string,
});
```

Se role rebaixada de admin/sponsor para player:
```ts
const oldProfile = await UserProfile.findOne({ wallet_address: wallet }).lean();
await UserProfile.findOneAndUpdate(
  { wallet_address: wallet },
  { $set: { permissions: [] } }
);

await logAudit({
  actor: req.user?.wallet ?? 'system',
  action: 'role.assign',
  target: `wallet:${wallet}`,
  details: {
    oldRole: oldProfile?.role ?? 'unknown',
    newRole: 'player',
    reason: 'rebaixamento',
  },
  ip: req.ip,
  userAgent: req.headers?.['user-agent'] as string,
});
```

**No getProfile:** Incluir `permissions` no retorno:
```ts
const profile = await UserProfile.findOne({ wallet_address }).lean();
// ... existing logic ...
return res.json({ ...profile, permissions: profile?.permissions ?? [] });
```

**Log da auto-atribuição contract_admin no getProfile:**
```ts
if (!profile) {
  // criar perfil
  const role = wallet_address === CONTRACT_ACCOUNT ? 'contract_admin' : 'player';
  // ... create ...

  if (role === 'contract_admin') {
    await logAudit({
      actor: wallet_address,
      action: 'role.autoassign',
      target: `wallet:${wallet_address}`,
      details: { role: 'contract_admin', reason: 'CONTRACT_ACCOUNT login' },
      ip: req.ip,
      userAgent: req.headers?.['user-agent'] as string,
    });
  }
}
```

- [ ] **Step 3: Rodar testes + typecheck**

---

### Task 10: Verificação final

- [ ] **Step 1: Rodar typecheck**
  ```bash
  npx tsc --project tsconfig.build.json --noEmit
  ```

- [ ] **Step 2: Rodar todos os testes do api-gateway**
  ```bash
  npx jest
  ```


