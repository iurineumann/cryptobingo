import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AdminLayout from '../AdminLayout';

vi.mock('react-router-dom', () => ({
  MemoryRouter: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  useNavigate: () => vi.fn(),
  useParams: () => ({ section: 'dashboard' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const defaultProps = {
  session: {} as any,
  profile: { wallet_address: 'test', role: 'admin' } as any,
  permissions: [] as string[],
  theme: 'dark' as const,
  onToggleTheme: vi.fn(),
  onLanguageChange: vi.fn(),
  onLogout: vi.fn(),
  pageTitle: 'Admin',
  children: null,
};

describe('AdminLayout permission filtering', () => {
  it('deve mostrar dashboard quando tem admin.dashboard.view', () => {
    render(React.createElement(AdminLayout, { ...defaultProps, permissions: ['admin.dashboard.view'] }));

    expect(screen.getAllByText(/dashboard/i).length).toBeGreaterThanOrEqual(1);
  });

  it('deve NÃO mostrar users se não tem admin.users.view', () => {
    render(React.createElement(AdminLayout, { ...defaultProps, permissions: ['admin.dashboard.view'] }));

    expect(screen.queryByText(/users/i)).toBeNull();
  });

  it('deve mostrar users quando tem admin.users.view', () => {
    render(React.createElement(AdminLayout, { ...defaultProps, permissions: ['admin.users.view'] }));

    expect(screen.getByText(/users/i)).toBeTruthy();
  });
});
