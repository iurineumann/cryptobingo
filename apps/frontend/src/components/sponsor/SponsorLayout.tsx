// apps/frontend/src/components/sponsor/SponsorLayout.tsx
// Shell do painel sponsor — header + sidebar + Outlet.
// Sponsors acessam via /sponsor/rooms e /sponsor/vault.
// Role gate garantido pelo SponsorGuard em App.tsx.

import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Session } from '@wharfkit/session';
import { updateUserLocale } from '../../services/api';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { Building2, ShieldCheck } from 'lucide-react';
import Logo from '../Logo';

interface SponsorLayoutProps {
  profile:       MongoUserProfile;
  session:       Session;
  theme:         string;
  onToggleTheme: () => void;
  onLogout:      () => void;
}

const SPONSOR_NAV = [
  { path: '/sponsor/rooms', label: 'sponsor.nav_rooms', icon: <Building2 className="size-4 shrink-0" /> },
  { path: '/sponsor/vault', label: 'sponsor.nav_vault', icon: <ShieldCheck className="size-4 shrink-0" /> },
];

export default function SponsorLayout({
  profile, session, theme, onToggleTheme, onLogout,
}: SponsorLayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  const handleLangChange = async (locale: string) => {
    i18n.changeLanguage(locale);
    try { await updateUserLocale(locale); } catch { /* silencioso */ }
  };

  return (
    <div className="site-shell mode-admin" style={{ height: '100dvh' }}>

      {/* ── Top Nav ── */}
      <header className="site-nav">
        <div className="site-nav-left">
          <Logo variant="horizontal" height={64} onClick={() => navigate('/lobby')} />
          <span className="site-mode-pill">
            {t('sponsor.panel_title')}
          </span>
        </div>

        <div className="site-nav-right">
          <span className="cb-wallet-chip">
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.75rem' }}>
              {profile.wallet_address}
            </span>
          </span>

          <select
            value={i18n.language}
            onChange={e => handleLangChange(e.target.value)}
            className="cb-input cb-select"
            style={{ padding: '0.3rem 2rem 0.3rem 0.6rem', fontSize: '0.75rem', height: '2.25rem', width: 'auto' }}
            aria-label={t('common.language') ?? 'Idioma'}
          >
            <option value="pt-BR">PT</option>
            <option value="en-US">EN</option>
            <option value="zh-CN">中</option>
          </select>

          <button
            className="cb-theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}
          >

          </button>

          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => navigate('/lobby')}>
            {t('game_room.back_to_lobby')}
          </button>

          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      {/* ── Layout: sidebar + conteúdo ── */}
      <div className="site-admin-layout">

        <aside className="site-sidebar" aria-label={t('sponsor.nav_aria')}>
          <div className="site-sidebar-section">
            <span className="site-sidebar-title">{t('sponsor.nav_section')}</span>
            {SPONSOR_NAV.map(item => (
              <a
                key={item.path}
                href={item.path}
                data-testid={`sponsor-nav-${item.path.split('/').pop()}`}
                className={`site-sidebar-item${pathname === item.path ? ' is-active' : ''}`}
                aria-current={pathname === item.path ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(item.path); }}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <span className="label">{t(item.label)}</span>
              </a>
            ))}
          </div>
        </aside>

        <main className="site-content" style={{ overflowY: 'auto', padding: '2rem' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
