// Site-wide layout shell — wraps every page of CryptoBingo.
// Two modes:
//   • player → top nav with primary tabs, full-width content
//   • admin  → top nav (minimal) + fixed sidebar with admin sections
// Both share logo, wallet chip, theme toggle, and optional page-header strip.

const PLAYER_NAV = [
  { id: 'lobby',   label: 'Salas',          href: '#/lobby'   },
  { id: 'tickets', label: 'Minhas Cartelas', href: '#/tickets' },
  { id: 'wallet',  label: 'Carteira',       href: '#/wallet'  },
  { id: 'profile', label: 'Perfil',         href: '#/profile' },
];

const ADMIN_NAV = [
  { id: 'dashboard',  label: 'Dashboard',     icon: '◆' },
  { id: 'patterns',   label: 'Padrões',       icon: '▦' },
  { id: 'gametypes',  label: 'Game Types',    icon: '◇' },
  { id: 'campaigns',  label: 'Campanhas B2B', icon: '▲' },
  { id: 'compliance', label: 'Compliance',    icon: '◉' },
  { id: 'users',      label: 'Usuários',      icon: '◍' },
  { id: 'mypanel',    label: 'Meu Painel',    icon: '●' },
];

// ── SiteNav ──────────────────────────────────────────────────────────────────

function SiteNav({ mode, section, theme, onToggleTheme, user }) {
  return (
    <header className="site-nav">
      <div className="site-nav-left">
        <a href="#/" className="cb-logo">Crypto<span>Bingo</span></a>

        {mode === 'admin' && (
          <span className="site-mode-pill" title="Modo administrador">
            <span aria-hidden="true">●</span>
            Painel Admin
          </span>
        )}

        {mode === 'player' && (
          <nav className="site-tabs" aria-label="Navegação principal">
            {PLAYER_NAV.map(item => (
              <a
                key={item.id}
                href={item.href}
                className={`site-tab${section === item.id ? ' is-active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="site-nav-right">
        {user && (
          <React.Fragment>
            <span className="cb-wallet-chip">
              <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
              {user.name}
            </span>
            {typeof user.balance === 'number' && (
              <span className="site-balance-pill" title="Saldo on-chain">
                <span className="amount">{user.balance.toFixed(4)}</span>
                <span className="unit">WAX</span>
              </span>
            )}
          </React.Fragment>
        )}

        {mode === 'admin' && (
          <button className="cb-btn cb-btn-ghost cb-btn-sm" type="button">
            Sair
          </button>
        )}

        <button
          className="cb-theme-toggle"
          onClick={onToggleTheme}
          aria-label="Alternar tema"
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}

// ── AdminSidebar ─────────────────────────────────────────────────────────────

function AdminSidebar({ section, collapsed = false }) {
  return (
    <aside className={`site-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Navegação administrativa">
      <div className="site-sidebar-section">
        <span className="site-sidebar-title">Operação</span>
        {ADMIN_NAV.slice(0, 4).map(item => (
          <a
            key={item.id}
            href={`#/admin/${item.id}`}
            className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
            aria-current={section === item.id ? 'page' : undefined}
          >
            <span className="icon" aria-hidden="true">{item.icon}</span>
            <span className="label">{item.label}</span>
          </a>
        ))}
      </div>
      <div className="site-sidebar-section">
        <span className="site-sidebar-title">Conformidade</span>
        {ADMIN_NAV.slice(4, 6).map(item => (
          <a
            key={item.id}
            href={`#/admin/${item.id}`}
            className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
            aria-current={section === item.id ? 'page' : undefined}
          >
            <span className="icon" aria-hidden="true">{item.icon}</span>
            <span className="label">{item.label}</span>
          </a>
        ))}
      </div>
      <div className="site-sidebar-section">
        <span className="site-sidebar-title">Pessoal</span>
        {ADMIN_NAV.slice(6).map(item => (
          <a
            key={item.id}
            href={`#/admin/${item.id}`}
            className={`site-sidebar-item${section === item.id ? ' is-active' : ''}`}
            aria-current={section === item.id ? 'page' : undefined}
          >
            <span className="icon" aria-hidden="true">{item.icon}</span>
            <span className="label">{item.label}</span>
          </a>
        ))}
      </div>

      <div className="site-sidebar-foot">
        <span className="site-sidebar-tier">
          <span className="medal" aria-hidden="true">◆</span>
          <span className="tier-info">
            <span className="tier-name">contractadmin</span>
            <span className="tier-role">contract_admin</span>
          </span>
        </span>
      </div>
    </aside>
  );
}

// ── PageHeader — page-specific context strip just below the nav ──────────────

function PageHeader({ eyebrow, title, badges, actions, children }) {
  return (
    <div className="site-page-header">
      <div className="site-page-header-left">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title && (
          <h1 className="title" style={{ fontFamily: 'var(--font-family-display)' }}>
            {title}
          </h1>
        )}
        {badges && <span className="badges">{badges}</span>}
        {children}
      </div>
      {actions && <div className="site-page-header-actions">{actions}</div>}
    </div>
  );
}

// ── SiteLayout — wraps every page ────────────────────────────────────────────

function SiteLayout({
  mode = 'player',
  section,
  theme,
  onToggleTheme,
  user,
  sidebarCollapsed = false,
  pageHeader,
  children,
  artboardId,
}) {
  return (
    <div className={`site-shell mode-${mode}`} data-screen-label={artboardId}>
      <SiteNav
        mode={mode}
        section={section}
        theme={theme}
        onToggleTheme={onToggleTheme}
        user={user}
      />

      {mode === 'admin' ? (
        <div className="site-admin-layout">
          <AdminSidebar section={section} collapsed={sidebarCollapsed} />
          <div className="site-content">
            {pageHeader}
            <main className="site-main">{children}</main>
          </div>
        </div>
      ) : (
        <div className="site-content">
          {pageHeader}
          <main className="site-main">{children}</main>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  SiteLayout, SiteNav, AdminSidebar, PageHeader,
  PLAYER_NAV, ADMIN_NAV,
});
