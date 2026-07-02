# Fase 6 — Frontend: UsersAdmin + SponsorsAdmin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: test first.

**Goal:** Transformar UsersAdmin em editor de permissões + criar página SponsorsAdmin com gestão de delegações.

**Dependencies:** Fase 5 (permissions no contexto) + Fase 3 (endpoints admin).

---

## Global Constraints

- TDD: teste de renderização + comportamento com mocks de API.
- `UsersAdmin` já existe (read-only) — expandir. `SponsorsAdmin` é novo.
- Chamadas API via `fetch` com `getAuthToken()` (padrão do projeto).
- Typecheck + testes verdes.

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Edit | `apps/frontend/src/components/admin/UsersAdmin.tsx` | Adicionar coluna permissões + modal editor |
| Create | `apps/frontend/src/components/admin/SponsorsAdmin.tsx` | Tabela orgs + delegados + modal criar delegação |
| Edit | `apps/frontend/src/components/admin/AdminLayout.tsx` | Adicionar rota sponsors |
| Edit | `apps/frontend/src/components/admin/__tests__/UsersAdmin.test.tsx` | Testes TDD |
| Create | `apps/frontend/src/components/admin/__tests__/SponsorsAdmin.test.tsx` | Testes TDD |
| Edit | `apps/frontend/src/services/api.ts` | Adicionar wrappers fetchPermissions, fetchOrgs, fetchDelegations, etc. |

---

### Task 1: Tests — UsersAdmin com edição de permissões

- [ ] **Step 1: Criar `apps/frontend/src/components/admin/__tests__/UsersAdmin.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockUsers = {
  users: [
    { wallet_address: 'user1', role: 'admin', permissions: ['admin.*'] },
    { wallet_address: 'user2', role: 'player', permissions: [] },
  ],
  total: 2, page: 1, limit: 20,
};

describe('UsersAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve listar usuários com role e permissões', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(<MemoryRouter><UsersAdmin permissions={['admin.users.view', 'admin.users.manage']} /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeTruthy();
      expect(screen.getByText('user2')).toBeTruthy();
    });
  });

  it('deve mostrar botão Editar Permissões só se tem admin.users.manage', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(<MemoryRouter><UsersAdmin permissions={['admin.users.view']} /></MemoryRouter>);

    await waitFor(() => {
      // admin.users.manage NÃO está — botão não deve aparecer
      expect(screen.queryByText(/editar permissões/i)).toBeNull();
    });
  });

  it('deve abrir modal ao clicar Editar Permissões', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(<MemoryRouter><UsersAdmin permissions={['admin.users.view', 'admin.users.manage']} /></MemoryRouter>);

    await waitFor(() => {
      const editBtn = screen.getByTestId('edit-perms-user1');
      expect(editBtn).toBeTruthy();
    });
  });
});
```

---

### Task 2: Expandir UsersAdmin com editor de permissões

- [ ] **Step 1: Atualizar `apps/frontend/src/components/admin/UsersAdmin.tsx`**

Changes:
1. Receber `permissions: string[]` como prop
2. Adicionar coluna "Permissões" que mostra badges (ex: `admin.*`, `admin.users.manage`)
3. Se `permissions.includes('admin.users.manage')`, mostrar botão "Editar" em cada linha
4. Modal com checkboxes para permissões disponíveis:

```tsx
const AVAILABLE_PERMS = [
  { id: 'admin.*', label: 'Super Admin (todas)' },
  { id: 'admin.dashboard.view', label: 'Dashboard' },
  { id: 'admin.rooms.manage', label: 'Salas' },
  { id: 'admin.patterns.manage', label: 'Padrões' },
  { id: 'admin.gametypes.manage', label: 'Game Types' },
  { id: 'admin.users.view', label: 'Usuários (ver)' },
  { id: 'admin.users.manage', label: 'Usuários (gerir)' },
  { id: 'admin.sponsors.view', label: 'Sponsors (ver)' },
  { id: 'admin.sponsors.manage', label: 'Sponsors (gerir)' },
  { id: 'admin.tokens.manage', label: 'Tokens' },
  { id: 'admin.nfts.manage', label: 'NFTs' },
  { id: 'admin.campaigns.manage', label: 'Campanhas' },
  { id: 'admin.vault.manage', label: 'Vault' },
  { id: 'admin.compliance.view', label: 'Compliance' },
  { id: 'admin.news.manage', label: 'Notícias' },
  { id: 'admin.config.manage', label: 'Config' },
];
```

5. Ao salvar, `PUT /api/v1/admin/users/:wallet/permissions` com `getAuthToken()`
6. Se `admin.*` marcado, enviar apenas `['admin.*']` (não todas as perms individuais)
7. Feedback toast/mensagem de sucesso/erro

- [ ] **Step 2: Testar**

---

### Task 3: Tests — SponsorsAdmin

- [ ] **Step 1: Criar `apps/frontend/src/components/admin/__tests__/SponsorsAdmin.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockOrgs = {
  orgs: [
    {
      orgId: 'org_abc',
      owner_wallet: 'sponsor1',
      name: 'Org do João',
      delegations: [
        { wallet_address: 'delegate1', permissions: ['sponsor.org_abc.treasury.view'], active: true },
      ],
    },
  ],
  total: 1, page: 1, limit: 20,
};

describe('SponsorsAdmin', () => {
  it('deve listar organizações sponsor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockOrgs,
    });

    render(<SponsorsAdmin permissions={['admin.sponsors.view', 'admin.sponsors.manage']} />);

    await waitFor(() => {
      expect(screen.getByText(/Org do João/i)).toBeTruthy();
    });
  });

  it('deve mostrar delegados na tabela', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockOrgs,
    });

    render(<SponsorsAdmin permissions={['admin.sponsors.view']} />);

    await waitFor(() => {
      expect(screen.getByText('delegate1')).toBeTruthy();
      expect(screen.getByText(/treasury.view/)).toBeTruthy();
    });
  });
});
```

---

### Task 4: Criar SponsorsAdmin

- [ ] **Step 1: Criar `apps/frontend/src/components/admin/SponsorsAdmin.tsx`**

Estrutura:
1. Fetch `GET /api/v1/admin/sponsor-orgs` com paginação
2. Tabela: Org ID, Owner Wallet, Name, # Delegados, Ações
3. Expandir linha para ver delegados (fetch `GET /api/v1/admin/sponsor-orgs/:orgId`)
4. Se `admin.sponsors.manage`, mostrar:
   - Botão "Nova Delegação" → modal com: wallet input + checkboxes de perms (excluindo `delegations.manage`)
   - Botão "Remover" ao lado de cada delegado

```tsx
// Props
interface SponsorsAdminProps {
  permissions: string[];
}

// Modal de criação
interface CreateDelegationModalProps {
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}
```

---

### Task 5: Registrar rota sponsors no AdminLayout

- [ ] **Step 1: Editar `AdminLayout.tsx`**

Adicionar item `sponsors` ao `ADMIN_NAV` (grupo "operation" ou grupo novo "admin"):

```ts
{ id: 'sponsors', label: 'Sponsors', icon: <Building2 className="size-4" />, group: 'admin' },
```

E no `renderContent`:

```tsx
case 'sponsors': return <SponsorsAdmin permissions={permissions} />;
```

- [ ] **Step 2: Adicionar SECTION_PERMS para sponsors**

```ts
sponsors: ['admin.sponsors.view'],
```

---

### Task 6: Adicionar wrappers API

- [ ] **Step 1: Editar `apps/frontend/src/services/api.ts`**

```ts
export async function updateUserPermissions(wallet: string, permissions: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${wallet}/permissions`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) throw new Error('Falha ao atualizar permissões');
}

export async function fetchSponsorOrgs(page = 1, limit = 20): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/sponsor-orgs?page=${page}&limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchSponsorOrg(orgId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/sponsor-orgs/${orgId}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createDelegation(orgId: string, wallet: string, permissions: string[]): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/sponsor-orgs/${orgId}/delegations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ wallet_address: wallet, permissions }),
  });
  return handleResponse(res);
}

export async function removeDelegation(orgId: string, wallet: string): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/sponsor-orgs/${orgId}/delegations/${wallet}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}
```

---

### Task 7: Verificação final

- [ ] **Step 1: Typecheck**
- [ ] **Step 2: Testes**
