import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import SponsorDelegations from '../SponsorDelegations';

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

    render(React.createElement(SponsorDelegations, { permissions: ['sponsor.org_abc.delegations.manage'] }));

    await waitFor(() => {
      expect(screen.getByText('delegate1')).toBeTruthy();
      expect(screen.getByText(/treasury.view/)).toBeTruthy();
    });
  });

  it('deve mostrar botão Nova Delegação', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDelegations,
    });

    render(React.createElement(SponsorDelegations, { permissions: ['sponsor.org_abc.delegations.manage'] }));

    await waitFor(() => {
      expect(screen.getByTestId('btn-nova-delegacao')).toBeTruthy();
    });
  });

  it('deve abrir modal ao clicar Nova Delegação', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDelegations,
    });

    render(React.createElement(SponsorDelegations, { permissions: ['sponsor.org_abc.delegations.manage'] }));

    await waitFor(async () => {
      await userEvent.click(screen.getByTestId('btn-nova-delegacao'));
    });

    expect(screen.getByTestId('modal-delegacao')).toBeTruthy();
  });
});
