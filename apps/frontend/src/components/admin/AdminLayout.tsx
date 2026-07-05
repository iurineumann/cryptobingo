// apps/frontend/src/components/admin/AdminLayout.tsx
// Shell do painel administrativo — sidebar + conteúdo.
// Auto-contido: usa useNavigate/useParams diretamente (ADR-015).
// Role gate: apenas roles admin/contract_admin chegam aqui (garantido em App.tsx).
// Ref: ADR-009 (Admin Panel), ADR-015 (Routing), CLAUDE_DESIGN.md §18.5

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { hasAnyPermission } from '../../utils/permissionMatcher';
import { Session } from '@wharfkit/session';
import { updateUserLocale } from '../../services/api';
import { PaletteSelector } from '../ui/PaletteSelector';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import {
  LayoutDashboard, Building2, Grid3x3, Puzzle, Megaphone, ShieldCheck,
  Image, Coins, Settings, Users, UserCircle, Handshake, FileText,
} from 'lucide-react';
import Logo from '../Logo';
import AdminDashboard   from './AdminDashboard';
import PatternsAdmin    from './PatternsAdmin';
import GametypesAdmin   from './GametypesAdmin';
import SponsorDashboard from './SponsorDashboard';
import ComplianceAdmin  from './ComplianceAdmin';
import UsersAdmin       from './UsersAdmin';
import SponsorsAdmin    from './SponsorsAdmin';
import PlayerDashboard  from './PlayerDashboard';
import RoomsAdmin       from './RoomsAdmin';
import VaultAdmin       from './VaultAdmin';
import NftAdmin         from './NftAdmin';
import TokenAdmin         from './TokenAdmin';
import SystemTokensAdmin  from './SystemTokensAdmin';
import ContentAdmin      from './ContentAdmin';

interface AdminLayoutProps {
  readonly profile:        MongoUserProfile;
  readonly session?:       Session;
  readonly theme:          string;
  readonly permissions?:   string[];
  readonly onToggleTheme:  () => void;
  readonly onLogout:       () => void;
}

export default function AdminLayout({
  profile, session, permissions = [], theme, onToggleTheme, onLogout,
}: AdminLayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate     = useNavigate();
  const { section = 'dashboard' } = useParams<{ section: string }>();

  const handleLangChange = async (locale: string) => {
    i18n.changeLanguage(locale);
    if (session) {
      try { await updateUserLocale(locale); } catch { /* silencioso */ }
    }
  };

  const ADMIN_NAV = [
    { id: 'dashboard',  label: t('admin.dashboard'),  group: 'operation',  icon: <LayoutDashboard className="size-4 shrink-0" /> },
    { id: 'rooms',      label: t('admin.rooms'),      group: 'operation',  icon: <Building2 className="size-4 shrink-0" /> },
    { id: 'patterns',   label: t('admin.patterns'),   group: 'operation',  icon: <Grid3x3 className="size-4 shrink-0" /> },
    { id: 'gametypes',  label: t('admin.gametypes'),  group: 'operation',  icon: <Puzzle className="size-4 shrink-0" /> },
    { id: 'campaigns',  label: t('admin.campaigns'),  group: 'operation',  icon: <Megaphone className="size-4 shrink-0" /> },
    { id: 'content',    label: t('admin.content'),    group: 'operation',  icon: <FileText className="size-4 shrink-0" /> },
    { id: 'vault',      label: t('admin.vault'),      group: 'operation',  icon: <ShieldCheck className="size-4 shrink-0" /> },
    { id: 'nfts',       label: t('admin.nfts'),       group: 'assets',     icon: <Image className="size-4 shrink-0" /> },
    { id: 'token',          label: t('admin.token'),          group: 'assets',     icon: <Coins className="size-4 shrink-0" /> },
    { id: 'config-tokens',  label: t('token_admin.title'),    group: 'assets',     icon: <Settings className="size-4 shrink-0" /> },
    { id: 'compliance', label: t('admin.compliance'), group: 'compliance', icon: <ShieldCheck className="size-4 shrink-0" /> },
    { id: 'users',      label: t('admin.users'),      group: 'compliance', icon: <Users className="size-4 shrink-0" /> },
    { id: 'sponsors',   label: t('admin.sponsors'),   group: 'compliance', icon: <Handshake className="size-4 shrink-0" /> },
    { id: 'mypanel',    label: t('admin.my_panel'),   group: 'personal',   icon: <UserCircle className="size-4 shrink-0" /> },
  ];

  function renderContent() {
    switch (section) {
      case 'dashboard':  return <AdminDashboard session={session} />;
      case 'rooms':      return <RoomsAdmin />;
      case 'patterns':   return <PatternsAdmin />;
      case 'gametypes':  return <GametypesAdmin />;
      case 'content':    return <ContentAdmin />;
      case 'campaigns':  return <SponsorDashboard />;
      case 'vault':      return <VaultAdmin />;
      case 'nfts':       return <NftAdmin session={session} />;
      case 'token':          return <TokenAdmin session={session} />;
      case 'config-tokens':  return <SystemTokensAdmin />;
      case 'compliance': return <ComplianceAdmin />;
      case 'users':      return <UsersAdmin permissions={permissions} />;
      case 'sponsors':   return <SponsorsAdmin permissions={permissions} />;
      case 'mypanel':    return session ? <PlayerDashboard session={session} /> : null;
      default:           return <AdminDashboard session={session} />;
    }
  }

  const SECTION_PERMS: Record<string, string[]> = {
    dashboard:    ['admin.dashboard.view'],
    rooms:        ['admin.rooms.manage'],
    content:      ['admin.content.*'],
    patterns:     ['admin.patterns.manage'],
    gametypes:    ['admin.gametypes.manage'],
    campaigns:    ['admin.campaigns.manage'],
    vault:        ['admin.vault.manage'],
    nfts:         ['admin.nfts.manage'],
    token:        ['admin.tokens.manage'],
    'config-tokens': ['admin.config.manage'],
    compliance:   ['admin.compliance.view'],
    users:        ['admin.users.view'],
    sponsors:     ['admin.sponsors.view'],
    mypanel:      [],
  };

  const visibleNav = ADMIN_NAV.filter(
    (item) =>
      !SECTION_PERMS[item.id] ||
      SECTION_PERMS[item.id].length === 0 ||
      hasAnyPermission(permissions, SECTION_PERMS[item.id], profile.role)
  );

  const currentNav = visibleNav.find(n => n.id === section);

  const SidebarGroup = ({ group, title }: { group: string; title: string }) => {
    const groupItems = visibleNav.filter(n => n.group === group);
    if (groupItems.length === 0) return null;
    return (
    <div className="site-sidebar-section">
      <span className="site-sidebar-title">{title}</span>
      {groupItems.map(item => (
        <a
          key={item.id}
          href={`/admin/${item.id}`}
          data-testid={`admin-nav-${item.id}`}
          className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
          aria-current={section === item.id ? 'page' : undefined}
          onClick={e => { e.preventDefault(); navigate(`/admin/${item.id}`); }}
        >
          <span className="icon" aria-hidden="true">{item.icon}</span>
          <span className="label">{item.label}</span>
        </a>
      ))}
    </div>
  );
  };

  return (
    <div className="site-shell mode-admin" style={{ height: '100dvh' }}>

      {/* ── Top Nav ── */}
      <header className="site-nav">
        <div className="site-nav-left">
          <Logo
            variant="horizontal"
            height={64}
            onClick={() => navigate('/admin/dashboard')}
          />
          <span className="site-mode-pill">
            {t('nav.admin')}
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

          <PaletteSelector />

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

      {/* ── Admin layout: sidebar + content ── */}
      <div className="site-admin-layout">

        <aside className="site-sidebar" aria-label={t('admin.nav_aria')}>
          <SidebarGroup group="operation"  title={t('admin.section_operations')} />
          <SidebarGroup group="assets"     title={t('admin.section_assets')} />
          <SidebarGroup group="compliance" title={t('admin.section_compliance')} />
          <SidebarGroup group="personal"   title={t('admin.section_personal')} />

          <div className="site-sidebar-foot">
            <div className="site-sidebar-tier">
              <span className="medal" aria-hidden="true"></span>
              <div className="tier-info">
                <span className="tier-name">{profile.wallet_address}</span>
                <span className="tier-role">{profile.role}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <div className="site-admin-content">
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
