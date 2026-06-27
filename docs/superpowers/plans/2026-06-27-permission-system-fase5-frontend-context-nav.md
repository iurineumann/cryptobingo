# Fase 5 — Frontend: Permissions no Contexto + Nav Filtrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: test first.

**Goal:** Passar `permissions: string[]` de App.tsx para AdminLayout/SponsorLayout, filtrar nav items baseado nas permissões do usuário.

**Dependencies:** Fase 2 (modelo de permissões definido + middleware requer as perms). API real precisa retornar permissions no GET /profile.

---

## Global Constraints

- TDD: teste de renderização com mock de permissões.
- `permissions` vêm da API (`GET /api/v1/profile`), já incluídas no `MongoUserProfile` ou campo separado.
- Se permissions não vier (versão antiga da API), default `[]`.
- Typecheck: `npx tsc --noEmit` em `apps/frontend/`.
- Testes: `pnpm --filter @cryptobingo/frontend test` (vitest).

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Edit | `packages/shared-types/src/index.ts` | Add `permissions: string[]` ao `MongoUserProfile` |
| Edit | `apps/frontend/src/App.tsx` | Passar permissions no PageProps + isAdmin/isSponsor refinado |
| Edit | `apps/frontend/src/components/admin/AdminLayout.tsx` | Filtrar nav por permissions |
| Edit | `apps/frontend/src/components/sponsor/SponsorLayout.tsx` | Filtrar nav sponsor por permissions |
| Create | `apps/frontend/src/utils/permissionMatcher.ts` | Replicar pattern matching (frontend-side) |
| Create | `apps/frontend/src/utils/__tests__/permissionMatcher.test.ts` | Testes TDD |
| Create | `apps/frontend/src/components/admin/__tests__/AdminLayout.permissions.test.tsx` | Teste TDD |

---

### Task 1: shared-types — Adicionar permissions ao MongoUserProfile

- [ ] **Step 1: Editar `packages/shared-types/src/index.ts`**

Buscar a interface `MongoUserProfile` (ou similar) e adicionar:

```ts
permissions?: string[];
```

---

### Task 2: permissionMatcher frontend-side

- [ ] **Step 1: TDD — Teste do matcher**

Criar `apps/frontend/src/utils/__tests__/permissionMatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissionMatcher';

describe('permissionMatcher (frontend)', () => {
  it('deve casar exato', () => {
    expect(hasPermission(['admin.users.manage'], 'admin.users.manage')).toBe(true);
  });
  it('deve casar wildcard admin.*', () => {
    expect(hasPermission(['admin.*'], 'admin.users.manage')).toBe(true);
  });
  it('deve NÃO casar namespace diferente', () => {
    expect(hasPermission(['admin.users.manage'], 'admin.rooms.manage')).toBe(false);
  });
  it('deve passar com null/undefined (bypass)', () => {
    expect(hasPermission(null, 'admin.users.manage')).toBe(true);
    expect(hasPermission(undefined, 'admin.users.manage')).toBe(true);
  });
});
```

- [ ] **Step 2: Implementar**

Criar `apps/frontend/src/utils/permissionMatcher.ts`:

```ts
export function hasPermission(
  userPermissions: string[] | null | undefined,
  requiredPermission: string
): boolean {
  if (!userPermissions) return true;

  for (const pattern of userPermissions) {
    const patternParts = pattern.split('.');
    const permissionParts = requiredPermission.split('.');
    if (patternParts.length > permissionParts.length) continue;

    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') continue;
      if (patternParts[i] !== permissionParts[i]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

export function hasAnyPermission(
  userPermissions: string[] | null | undefined,
  requiredPermissions: string[]
): boolean {
  if (!userPermissions) return true;
  return requiredPermissions.some((p) => hasPermission(userPermissions, p));
}
```

- [ ] **Step 3: Rodar testes — passar**
  ```bash
  npx vitest run src/utils/__tests__/permissionMatcher.test.ts
  ```

---

### Task 3: App.tsx — Passar permissions no PageProps

- [ ] **Step 1: Editar App.tsx**

Onde `pageProps` é montado (próximo de `const pageProps: PageProps = {`), adicionar:

```ts
const userPermissions: string[] = (profile as any)?.permissions ?? [];
```

Incluir no `pageProps`:

```ts
permissions: userPermissions,
```

Atualizar também `isAdmin`:

```ts
const isAdmin = !!(
  profile && (
    profile.role === 'admin' ||
    profile.role === 'contract_admin' ||
    hasAnyPermission(userPermissions, ['admin.*', 'admin.dashboard.view'])
  )
);
```

E o `isSponsor`:

```ts
const isSponsor = !!(
  profile && (
    profile.role === 'sponsor' ||
    profile.role === 'contract_admin' ||
    userPermissions.some(p => p.startsWith('sponsor.'))
  )
);
```

- [ ] **Step 2: Adicionar `permissions` ao tipo `PageProps`**

Em App.tsx, localizar `interface PageProps` e adicionar:

```ts
permissions: string[];
```

---

### Task 4: TDD — AdminLayout com filtro de permissões

- [ ] **Step 1: Criar teste**

Criar `apps/frontend/src/components/admin/__tests__/AdminLayout.permissions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminLayout } from '../AdminLayout';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const defaultProps = {
  session: {} as any,
  permissions: [] as string[],
  theme: 'dark' as const,
  onToggleTheme: vi.fn(),
  onLanguageChange: vi.fn(),
  onLogout: vi.fn(),
  pageTitle: 'Admin',
};

describe('AdminLayout permission filtering', () => {
  it('deve mostrar dashboard quando tem admin.dashboard.view', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout {...defaultProps} permissions={['admin.dashboard.view']} />
      </MemoryRouter>
    );

    expect(screen.getByText(/dashboard/i)).toBeTruthy();
  });

  it('deve NÃO mostrar users se não tem admin.users.view', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout {...defaultProps} permissions={['admin.dashboard.view']} />
      </MemoryRouter>
    );

    expect(screen.queryByText(/users/i)).toBeNull();
  });

  it('deve mostrar users quando tem admin.users.view', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout {...defaultProps} permissions={['admin.users.view']} />
      </MemoryRouter>
    );

    expect(screen.getByText(/users/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verificar que falha** (AdminLayout ainda não filtra)

---

### Task 5: AdminLayout — Filtrar nav por permissions

- [ ] **Step 1: Receber permissions como prop**

Em `apps/frontend/src/components/admin/AdminLayout.tsx`:

- Adicionar `permissions: string[]` às props
- Importar `hasAnyPermission` do utils

- [ ] **Step 2: Filtrar ADMIN_NAV**

Mapear `ADMIN_NAV` para incluir `requiredPerms: string[]` em cada item (ou mapear por id):

```ts
const SECTION_PERMS: Record<string, string[]> = {
  dashboard:    ['admin.dashboard.view'],
  rooms:        ['admin.rooms.manage'],
  patterns:     ['admin.patterns.manage'],
  gametypes:    ['admin.gametypes.manage'],
  campaigns:    ['admin.campaigns.manage'],
  vault:        ['admin.vault.manage'],
  nfts:         ['admin.nfts.manage'],
  token:        ['admin.tokens.manage'],
  'config-tokens': ['admin.config.manage'],
  compliance:   ['admin.compliance.view'],
  users:        ['admin.users.view'],
  mypanel:      [], // sempre visível
};

// Filtrar grupos:
const visibleNav = ADMIN_NAV.filter(
  (item) =>
    !SECTION_PERMS[item.id] ||
    SECTION_PERMS[item.id].length === 0 ||
    hasAnyPermission(permissions, SECTION_PERMS[item.id])
);
```

- [ ] **Step 3: Renderizar using visibleNav**

Substituir o map que itera sobre `ADMIN_NAV` para usar `visibleNav`.

- [ ] **Step 4: Rodar testes — passar**

---

### Task 6: SponsorLayout — Filtrar nav sponsor

- [ ] **Step 1: Verificar SponsorLayout**

Em `apps/frontend/src/components/sponsor/SponsorLayout.tsx`:

- Adicionar `permissions: string[]` às props
- Filtrar seções baseado em `sponsor.{orgId}.*`

Atual `SponsorLayout` tem 2 seções (rooms, vault). Pode adicionar futuramente delegations. Filtrar por:

```ts
const hasRoomPerm = permissions.some(p => p.includes('.rooms.'));
const hasVaultPerm = permissions.some(p => p.includes('.vault.') || p.includes('.drops.'));
```

---

### Task 7: Verificação final

- [ ] **Step 1: Typecheck**
  ```bash
  npx tsc --noEmit
  ```
- [ ] **Step 2: Testes**
  ```bash
  npx vitest run
  ```
