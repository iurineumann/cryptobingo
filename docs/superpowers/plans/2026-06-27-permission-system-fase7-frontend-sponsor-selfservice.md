# Fase 7 — Frontend: Sponsor Self-Service Delegation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD: test first.

**Goal:** Sponsor master gerencia próprias delegações diretamente pelo frontend, sem depender de admin.

**Dependencies:** Fase 4 (endpoints sponsor self-service) + Fase 5 (permissions no contexto).

---

## Global Constraints

- TDD: cada componente tem teste.
- Acesso via `/sponsor/delegations` (ou seção no SponsorLayout).
- Apenas sponsor master vê (quem tem `sponsor.{orgId}.delegations.manage`).
- Typecheck + testes verdes.

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Create | `apps/frontend/src/components/sponsor/SponsorDelegations.tsx` | Página de delegação |
| Create | `apps/frontend/src/components/sponsor/__tests__/SponsorDelegations.test.tsx` | Testes TDD |
| Edit | `apps/frontend/src/components/sponsor/SponsorLayout.tsx` | Adicionar rota delegations |
| Edit | `apps/frontend/src/services/api.ts` | Wrappers sponsor delegation API |

---

### Task 1: Tests — SponsorDelegations

- [ ] **Step 1: Criar `apps/frontend/src/components/sponsor/__tests__/SponsorDelegations.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockDelegations = {
  orgId: 'org_abc',
  delegations: [
    {
      wallet_address: 'delegate1',
      permissions: ['sponsor.org_abc.treasury.view'],
      active: true,
      createdAt: '2026-06-27T00:00:00Z',
    },
  ],
};

describe('SponsorDelegations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve listar delegações do meu org', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDelegations,
    });

    render(<SponsorDelegations permissions={['sponsor.org_abc.delegations.manage']} />);

    await waitFor(() => {
      expect(screen.getByText('delegate1')).toBeTruthy();
      expect(screen.getByText(/treasury.view/)).toBeTruthy();
    });
  });

  it('deve mostrar formulário de nova delegação', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDelegations,
    });

    render(<SponsorDelegations permissions={['sponsor.org_abc.delegations.manage']} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-nova-delegacao')).toBeTruthy();
    });
  });

  it('deve abrir modal ao clicar Nova Delegação', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDelegations,
    });

    render(<SponsorDelegations permissions={['sponsor.org_abc.delegations.manage']} />);

    await waitFor(async () => {
      await userEvent.click(screen.getByTestId('btn-nova-delegacao'));
    });

    expect(screen.getByTestId('modal-delegacao')).toBeTruthy();
  });
});
```

---

### Task 2: Criar SponsorDelegations

- [ ] **Step 1: Criar `apps/frontend/src/components/sponsor/SponsorDelegations.tsx`**

```tsx
interface SponsorDelegationsProps {
  permissions: string[];
}
```

Estrutura:
1. Fetch `GET /api/v1/sponsor/delegations` (authHeaders)
2. Mostrar orgId + tabela de delegados: Wallet, Permissões (badges), Criado em, Ações
3. Botão "Nova Delegação" → abre modal

**Modal de criação:**
- Input: wallet address
- Checkboxes: `sponsor.{orgId}.dashboard.view`, `sponsor.{orgId}.rooms.manage`, `sponsor.{orgId}.treasury.view`, `sponsor.{orgId}.treasury.withdraw`, `sponsor.{orgId}.drops.manage`, `sponsor.{orgId}.campaigns.manage`, `sponsor.{orgId}.nfts.manage`, `sponsor.{orgId}.layouts.manage`
- ⚠️ NÃO incluir `delegations.manage`
- Submit → `POST /api/v1/sponsor/delegations` com `{ wallet_address, permissions }`
- Refresh list on success

**Permissões disponíveis para sponsor delegar:**

```ts
const DELEGABLE_SPONSOR_PERMS = (orgId: string) => [
  { id: `sponsor.${orgId}.dashboard.view`,    label: 'Dashboard' },
  { id: `sponsor.${orgId}.rooms.manage`,       label: 'Gerenciar Salas' },
  { id: `sponsor.${orgId}.treasury.view`,      label: 'Ver Tesouraria' },
  { id: `sponsor.${orgId}.treasury.withdraw`,  label: 'Sacar Tesouraria' },
  { id: `sponsor.${orgId}.drops.manage`,       label: 'Gerenciar Drops' },
  { id: `sponsor.${orgId}.campaigns.manage`,   label: 'Campanhas' },
  { id: `sponsor.${orgId}.nfts.manage`,        label: 'NFTs' },
  { id: `sponsor.${orgId}.layouts.manage`,     label: 'Layouts' },
];
```

---

### Task 3: Adicionar rota no SponsorLayout

- [ ] **Step 1: Editar `SponsorLayout.tsx`**

Adicionar nav item:

```ts
{ id: 'delegations', label: 'Delegações', icon: <UserPlus className="size-4" /> },
```

No switch do `renderContent`:

```tsx
case 'delegations': {
  const hasDelegPerm = permissions?.some(p => p.includes('.delegations.manage'));
  if (!hasDelegPerm) return <div>Sem permissão</div>;
  return <SponsorDelegations permissions={permissions ?? []} />;
}
```

Filtrar nav item: só mostrar se tem `delegations.manage`.

---

### Task 4: Wrappers API

- [ ] **Step 1: Editar `apps/frontend/src/services/api.ts`**

```ts
export async function fetchMyDelegations(): Promise<any> {
  const res = await fetch(`${API_BASE}/sponsor/delegations`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createMyDelegation(wallet: string, permissions: string[]): Promise<any> {
  const res = await fetch(`${API_BASE}/sponsor/delegations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ wallet_address: wallet, permissions }),
  });
  return handleResponse(res);
}

export async function removeMyDelegation(wallet: string): Promise<any> {
  const res = await fetch(`${API_BASE}/sponsor/delegations/${wallet}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}
```

---

### Task 5: Verificação final

- [ ] **Step 1: Typecheck**
- [ ] **Step 2: Testes**
