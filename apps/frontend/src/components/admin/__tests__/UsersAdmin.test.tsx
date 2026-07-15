import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import UsersAdmin from '../UsersAdmin';
import * as api from '../../../services/api';

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
    vi.spyOn(api, 'getAuthToken').mockReturnValue('token');
    vi.spyOn(api, 'updateUserPermissions').mockResolvedValue(undefined);
    vi.spyOn(api, 'assignUserRole').mockResolvedValue({ wallet_address: 'user2', role: 'admin', permissions: ['admin.*'] });
  });

  it('deve listar usuários com role e permissões', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(React.createElement(UsersAdmin, { permissions: ['admin.users.view', 'admin.users.manage'] }));

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

    render(React.createElement(UsersAdmin, { permissions: ['admin.users.view'] }));

    await waitFor(() => {
      expect(screen.queryByText(/editar permissões/i)).toBeNull();
    });
  });

  it('deve abrir modal ao clicar Editar Permissões', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(React.createElement(UsersAdmin, { permissions: ['admin.users.view', 'admin.users.manage'] }));

    await waitFor(() => {
      const editBtn = screen.getByTestId('edit-perms-user1');
      expect(editBtn).toBeTruthy();
    });
  });

  it('deve expor seletor de role e chamar assignUserRole ao trocar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    render(React.createElement(UsersAdmin, { permissions: ['admin.users.manage'] }));

    await waitFor(() => {
      expect(screen.getByTestId('role-select-user2')).toBeTruthy();
    });

    const select = screen.getByTestId('role-select-user2') as HTMLSelectElement;
    expect(select.value).toBe('player');
    fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() => {
      expect(api.assignUserRole).toHaveBeenCalledWith('user2', 'admin');
    });
  });
});
