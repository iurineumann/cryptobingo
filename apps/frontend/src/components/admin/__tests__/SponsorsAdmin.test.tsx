import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import SponsorsAdmin from '../SponsorsAdmin';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve listar organizações sponsor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockOrgs,
    });

    render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view', 'admin.sponsors.manage'] }));

    await waitFor(() => {
      expect(screen.getByText(/Org do João/i)).toBeTruthy();
    });
  });

  it('deve mostrar delegados ao expandir', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockOrgs,
    });

    render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view'] }));

    await waitFor(() => {
      expect(screen.getByText(/Org do João/i)).toBeTruthy();
    });

    const expandBtn = screen.getByText(/org_abc/i);
    expandBtn.click();

    await waitFor(() => {
      expect(screen.getByText('delegate1')).toBeTruthy();
      expect(screen.getByText(/treasury.view/)).toBeTruthy();
    });
  });
});
