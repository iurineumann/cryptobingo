import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  describe('createSponsorOrg', () => {
    const mockUsers = {
      users: [
        { wallet_address: 'wallet1', username: 'User 1', role: 'player' },
        { wallet_address: 'wallet2', username: 'User 2', role: 'player' },
      ],
    };

    it('não mostra botão criar sem permissão manage', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockOrgs });

      render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view'] }));

      await waitFor(() => expect(screen.getByText(/Org do João/i)).toBeTruthy());

      expect(screen.queryByTestId('btn-create-org')).toBeNull();
    });

    it('mostra botão criar com permissão manage', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockOrgs });

      render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view', 'admin.sponsors.manage'] }));

      await waitFor(() => {
        expect(screen.getByTestId('btn-create-org')).toBeTruthy();
      });
    });

    it('abre modal e cria org com sucesso', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockOrgs }); // lista orgs
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockUsers }); // lista users

      render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view', 'admin.sponsors.manage'] }));

      await waitFor(() => expect(screen.getByTestId('btn-create-org')).toBeTruthy());

      screen.getByTestId('btn-create-org').click();
      await waitFor(() => expect(screen.getByTestId('field-owner-wallet')).toBeTruthy());

      const input = screen.getByTestId('field-owner-wallet');
      fireEvent.input(input, { target: { value: 'wallet1' } });

      await waitFor(() => expect(screen.getByTestId('combobox-option-wallet1')).toBeTruthy());

      screen.getByTestId('combobox-option-wallet1').click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orgId: 'org_new1', owner_wallet: 'wallet1', name: 'Org Teste', permissionsAutoAssigned: true }),
      });

      screen.getByTestId('btn-submit-org').click();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/v1/admin/sponsor-orgs',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('wallet1'),
          })
        );
      });
    });

    it('mostra erro 404 se wallet não encontrada', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockOrgs });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockUsers });

      render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view', 'admin.sponsors.manage'] }));

      await waitFor(() => expect(screen.getByTestId('btn-create-org')).toBeTruthy());

      screen.getByTestId('btn-create-org').click();
      await waitFor(() => expect(screen.getByTestId('field-owner-wallet')).toBeTruthy());

      const input = screen.getByTestId('field-owner-wallet');
      fireEvent.input(input, { target: { value: 'inexistente' } });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Perfil não encontrado' }),
      });

      screen.getByTestId('btn-submit-org').click();

      await waitFor(() => {
        expect(screen.getByText(/Perfil não encontrado/i)).toBeTruthy();
      });
    });

    it('mostra erro 409 se wallet já tem org', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockOrgs });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockUsers });

      render(React.createElement(SponsorsAdmin, { permissions: ['admin.sponsors.view', 'admin.sponsors.manage'] }));

      await waitFor(() => expect(screen.getByTestId('btn-create-org')).toBeTruthy());

      screen.getByTestId('btn-create-org').click();
      await waitFor(() => expect(screen.getByTestId('field-owner-wallet')).toBeTruthy());

      const input = screen.getByTestId('field-owner-wallet');
      fireEvent.input(input, { target: { value: 'wallet1' } });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Wallet já possui uma organização' }),
      });

      screen.getByTestId('btn-submit-org').click();

      await waitFor(() => {
        expect(screen.getByText(/já possui/i)).toBeTruthy();
      });
    });
  });
});
