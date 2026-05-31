// apps/frontend/src/components/admin/AdminLayout.tsx
// Shell do painel administrativo — sidebar + conteúdo.
// Refatorado com as classes site-* do Claude Design (globals.design.css).
//
// Roteamento: state-based, prop onNavigate(section).
// Role gate: apenas roles admin/contract_admin chegam aqui (garantido em App.tsx).
// Ref: ADR-009 (Admin Panel), CLAUDE_DESIGN.md §18.5

import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { updateUserLocale } from '../../services/api';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import Logo from '../Logo';
import AdminDashboard  from './AdminDashboard';
import PatternsAdmin   from './PatternsAdmin';
import GametypesAdmin  from './GametypesAdmin';
import SponsorDashboard from './SponsorDashboard';
import ComplianceAdmin from './ComplianceAdmin';
import UsersAdmin      from './UsersAdmin';
import PlayerDashboard from './PlayerDashboard';
import RoomsAdmin      from './RoomsAdmin';

// ==========================================
// TIPOS
// ==========================================

interface AdminLayoutProps {
  profile:        MongoUserProfile;
  session?:       Session;
  theme:          string;
  onToggleTheme:  () => void;
  section:        string;
  onNavigate:     (section: string) => void;
  onLogout:       () => void;
  onBackToLobby?: () => void;
}

// Itens da sidebar — mapeados da especificação do layout.jsx do Claude Design


// ==========================================
// COMPONENTE
// ==========================================

export default function AdminLayout({
  profile, session, theme, onToggleTheme, section, onNavigate, onLogout, onBackToLobby,
}: AdminLayoutProps) {
  const { t, i18n } = useTranslation();
  const handleAdminLangChange = async (locale: string) => {
    i18n.changeLanguage(locale);
    if (session) {
      try { await updateUserLocale(locale); } catch { }
    }
  };

  const ADMIN_NAV = [
    { id: 'dashboard',  label: t('admin.dashboard'),  icon: '◆', group: 'operation' },
    { id: 'rooms',      label: t('admin.rooms'),      icon: '🏠', group: 'operation' },
    { id: 'patterns',   label: t('admin.patterns'),   icon: '▦', group: 'operation' },
    { id: 'gametypes',  label: t('admin.gametypes'),  icon: '◇', group: 'operation' },
    { id: 'campaigns',  label: t('admin.campaigns'),  icon: '▲', group: 'operation' },
    { id: 'compliance', label: t('admin.compliance'), icon: '◉', group: 'compliance' },
    { id: 'users',      label: t('admin.users'),      icon: '◍', group: 'compliance' },
    { id: 'mypanel',    label: t('admin.my_panel'),   icon: '●', group: 'personal' },
  ];

  // Renderiza a seção ativa
  function renderContent() {
    switch (section) {
      case 'dashboard':  return <AdminDashboard session={session} />;
      case 'rooms':      return <RoomsAdmin />;
      case 'patterns':   return <PatternsAdmin />;
      case 'gametypes':  return <GametypesAdmin />;
      case 'campaigns':  return <SponsorDashboard />;
      case 'compliance': return <ComplianceAdmin />;
      case 'users':      return <UsersAdmin />;
      case 'mypanel':    return session ? <PlayerDashboard session={session} /> : null;
      default:           return <AdminDashboard session={session} />;
    }
  }

  const currentNav = ADMIN_NAV.find(n => n.id === section);

  return (
    <div className="site-shell mode-admin" style={{ height: '100dvh' }}>

      {/* ── Top Nav ── */}
      <header className="site-nav">
        <div className="site-nav-left">
          <Logo
            variant="horizontal"
            height={64}
            onClick={() => onNavigate('dashboard')}
          />
          <span className="site-mode-pill">
            <span aria-hidden="true">●</span>
            {t('admin.dashboard')}
          </span>
        </div>

        <div className="site-nav-right">
          <span className="cb-wallet-chip">
            <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.75rem' }}>
              {profile.wallet_address}
            </span>
          </span>

          <select
            value={i18n.language}
            onChange={(e) => handleAdminLangChange(e.target.value)}
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
            {theme === 'dark' ? '☾' : '☀'}
          </button>

          <button
            className="cb-btn cb-btn-ghost cb-btn-sm"
            onClick={() => onBackToLobby?.()}
          >
            {t('game_room.back_to_lobby')}
          </button>

          <button
            className="cb-btn cb-btn-ghost cb-btn-sm"
            onClick={onLogout}
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      {/* ── Admin layout: sidebar + content ── */}
      <div className="site-admin-layout">

        {/* ── Sidebar ── */}
        <aside className="site-sidebar" aria-label={t('admin.nav_aria')}>

          <div className="site-sidebar-section">
            <span className="site-sidebar-title">{t('admin.section_operations')}</span>
            {ADMIN_NAV.filter(n => n.group === 'operation').map(item => (
              <a
                key={item.id}
                href={`#/admin/${item.id}`}
                className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(item.id); }}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <span className="label">{item.label}</span>
              </a>
            ))}
          </div>

          <div className="site-sidebar-section">
            <span className="site-sidebar-title">{t('admin.section_compliance')}</span>
            {ADMIN_NAV.filter(n => n.group === 'compliance').map(item => (
              <a
                key={item.id}
                href={`#/admin/${item.id}`}
                className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(item.id); }}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <span className="label">{item.label}</span>
              </a>
            ))}
          </div>

          <div className="site-sidebar-section">
            <span className="site-sidebar-title">{t('admin.section_personal')}</span>
            {ADMIN_NAV.filter(n => n.group === 'personal').map(item => (
              <a
                key={item.id}
                href={`#/admin/${item.id}`}
                className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate(item.id); }}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <span className="label">{item.label}</span>
              </a>
            ))}
          </div>

          {/* Footer da sidebar */}
          <div className="site-sidebar-foot">
            <div className="site-sidebar-tier">
              <span className="medal" aria-hidden="true">◆</span>
              <div className="tier-info">
                <span className="tier-name">{profile.wallet_address}</span>
                <span className="tier-role">{profile.role}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <div className="site-admin-content">
          {/* Page header */}
          <div className="site-page-header">
            <div className="site-page-header-left">
              <span className="eyebrow">{t('nav.admin')}</span>
              <h1 className="title" style={{ fontFamily: 'var(--font-family-display)' }}>
                {currentNav?.label ?? t('admin.dashboard')}
              </h1>
            </div>
          </div>

          <main className="site-main" style={{ overflowY: 'auto', padding: '0 1.5rem 1.5rem' }}>
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
