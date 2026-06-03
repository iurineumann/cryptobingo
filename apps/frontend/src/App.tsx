// apps/frontend/src/App.tsx
// Raiz da aplicação — BrowserRouter + AppRoot com roteamento URL-based (ADR-015).
//
// Hierarquia:
//   App          → <BrowserRouter> (necessário para hooks de router)
//   AppRoot      → estado de sessão/tema + useNavigate + <Routes>
//   AuthGuard    → layout route; redireciona para / se não autenticado
//   AdminGuard   → layout route; redireciona para /lobby se não admin
//   SponsorGuard → layout route; redireciona para /lobby se não sponsor
//
// Rotas:
//   /                     → RootRedirect (sessão → /lobby, sem sessão → Landing)
//   /lobby                → PlayerShell > Lobby
//   /history              → PlayerShell > MyHistoryPage
//   /wallet               → PlayerShell > WalletPage
//   /room/:roomId/:gameId → GameRoom (full-screen)
//   /replay/:gameId       → ReplayRoom (full-screen)
//   /room/:roomId/history → RoomHistoryPanel (público, sem auth)
//   /admin                → redirect /admin/dashboard
//   /admin/:section       → AdminLayout (full-screen, role admin)
//   /sponsor              → redirect /sponsor/rooms
//   /sponsor/rooms        → SponsorLayout > SponsorRooms (role sponsor)
//   /sponsor/vault        → SponsorLayout > SponsorVault  (role sponsor)
//
// Ref: ADR-006 (JWT), ADR-007 (WebSocket), ADR-009 (Admin), ADR-010 (Rooms), ADR-015 (Routing)

import { useEffect, useState, useCallback } from 'react';
import { useTranslation }                   from 'react-i18next';
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    Outlet,
    useNavigate,
    useLocation,
    useParams,
} from 'react-router-dom';
import { Session }                          from '@wharfkit/session';
import {
    fetchUserProfile, updateUserLocale,
    clearAuthToken, getAuthToken,
} from './services/api';
import { sessionKit }    from './services/wharfkit';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { useAuth }       from './hooks/useAuth';
import { useTheme }      from './hooks/useTheme';
import LandingPage       from './components/LandingPage';
import Lobby             from './components/Lobby';
import GameRoom          from './components/GameRoom';
import ReplayRoom        from './components/ReplayRoom';
import RoomHistoryPanel  from './components/RoomHistoryPanel';
import MyHistoryPage     from './components/MyHistoryPage';
import WalletPage        from './components/WalletPage';
import AdminLayout       from './components/admin/AdminLayout';
import SponsorLayout    from './components/sponsor/SponsorLayout';
import SponsorRooms     from './components/sponsor/SponsorRooms';
import SponsorVault     from './components/sponsor/SponsorVault';
import Logo             from './components/Logo';

// ── DEV LOGIN (tree-shaken em produção) ──────────────────────────────────────
interface DevAccount {
    actor: string;
    key:   string;
    label: string;
}

let   createDevSession: (() => Promise<Session>) | null = null;
let   createCustomSession: ((actor: string, key: string) => Promise<Session>) | null = null;
const devAccounts: DevAccount[] = [];
const devAdminActors = new Set<string>();

if (import.meta.env.DEV) {
    const { WalletPluginPrivateKey } = await import('@wharfkit/wallet-plugin-privatekey');
    const devChainId = import.meta.env.VITE_CHAIN_ID;
    const devRpcUrl  = import.meta.env.VITE_RPC_URL;

    const DEV_ENTRIES: [string, string, string][] = [
        ['VITE_DEV_ACTOR',                 'VITE_DEV_PRIVATE_KEY',          'Jogador 1'],
        ['VITE_DEV_ACTOR_JOGADOR2',        'VITE_DEV_KEY_JOGADOR2',        'Jogador 2'],
        ['VITE_DEV_ACTOR_GAME_ADMIN',      'VITE_DEV_KEY_GAME_ADMIN',      'Game Admin'],
        ['VITE_DEV_ACTOR_CONTRACT_ADMIN',  'VITE_DEV_KEY_CONTRACT_ADMIN',  'Contract Admin'],
        ['VITE_DEV_ACTOR_SPONSOR',         'VITE_DEV_KEY_SPONSOR',         'Sponsor'],
    ];

    for (const [actorKey, privKey, label] of DEV_ENTRIES) {
        const actor = import.meta.env[actorKey] as string | undefined;
        const key   = import.meta.env[privKey] as string | undefined;
        if (actor && key) {
            devAccounts.push({ actor, key, label });
            if (label === 'Admin' || label === 'Game Admin' || label === 'Contract Admin') {
                devAdminActors.add(actor);
            }
        }
    }

    if (devChainId && devRpcUrl && devAccounts.length > 0) {
        createDevSession = async () => {
            const a = devAccounts[0];
            return new Session({
                actor: a.actor, permission: 'active',
                chain: { id: devChainId, url: devRpcUrl },
                walletPlugin: new WalletPluginPrivateKey(a.key),
            });
        };
        createCustomSession = async (actor: string, key: string) => new Session({
            actor, permission: 'active',
            chain: { id: devChainId, url: devRpcUrl },
            walletPlugin: new WalletPluginPrivateKey(key),
        });
    }
}

// ── GUARDS ───────────────────────────────────────────────────────────────────

interface AuthGuardProps {
    session:           Session | null;
    profile:           MongoUserProfile | null;
    restoringSession:  boolean;
}

function AuthGuard({ session, profile, restoringSession }: AuthGuardProps) {
    if (restoringSession) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
                <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
            </div>
        );
    }
    if (!session || !profile) return <Navigate to="/" replace />;
    return <Outlet />;
}

function AdminGuard({ isAdmin }: { isAdmin: boolean }) {
    if (!isAdmin) return <Navigate to="/lobby" replace />;
    return <Outlet />;
}

function SponsorGuard({ isSponsor }: { isSponsor: boolean }) {
    if (!isSponsor) return <Navigate to="/lobby" replace />;
    return <Outlet />;
}

// ── WRAPPERS DE ROTA (extraem useParams e delegam props) ─────────────────────

interface PageProps {
    session:  Session;
    profile:  MongoUserProfile;
    isAdmin:  boolean;
    theme:    'dark' | 'light';
    onToggleTheme:    () => void;
    onLanguageChange: (locale: string) => void;
    onLogout:         () => void;
}

function GameRoomPage({ session, profile, isAdmin, theme, onToggleTheme, onLanguageChange, onLogout }: PageProps) {
    const { roomId, gameId } = useParams<{ roomId: string; gameId: string }>();
    const navigate = useNavigate();
    return (
        <GameRoom
            key={gameId}
            roomId={roomId!}
            gameId={gameId!}
            session={session}
            profile={profile}
            onLeave={() => navigate('/lobby')}
            onGoToHistory={() => navigate('/history')}
            onGoToWallet={() => navigate('/wallet')}
            onGoToAdmin={isAdmin ? () => navigate('/admin/dashboard') : undefined}
            isAdmin={isAdmin}
            onLogout={onLogout}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onLanguageChange={onLanguageChange}
        />
    );
}

function ReplayPage({ session }: { session: Session }) {
    const { gameId } = useParams<{ gameId: string }>();
    const navigate = useNavigate();
    return (
        <ReplayRoom
            gameId={gameId!}
            session={session}
            onLeave={() => navigate('/lobby')}
        />
    );
}

// Rota pública — sem session required (ADR-015); visitantes podem ver histórico de sala
function RoomHistoryPage({ session }: { session?: Session | null }) {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const destination = session ? '/lobby' : '/';
    return (
        <div className="site-shell mode-player" style={{ minHeight: '100dvh' }}>
            <div className="site-content">
                <main className="site-main" style={{ padding: '1.5rem' }}>
                    <RoomHistoryPanel
                        roomId={roomId!}
                        session={session}
                        onViewReplay={(gid) => navigate(`/replay/${gid}`)}
                        onBack={() => navigate(destination)}
                    />
                </main>
            </div>
        </div>
    );
}

// AdminLayout é auto-contido — lê useParams/useNavigate internamente (ADR-015)

// ── APP ROOT (dentro do BrowserRouter — pode usar hooks de router) ────────────

function AppRoot() {
    const { t, i18n }                                          = useTranslation();
    const { isAuthenticating, authError, authenticateSession } = useAuth();
    const { theme, toggleTheme }                               = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const [session,          setSession]          = useState<Session | null>(null);
    const [profile,          setProfile]          = useState<MongoUserProfile | null>(null);
    const [loading,          setLoading]          = useState(false);
    const [error,            setError]            = useState<string | null>(null);
    const [restoringSession, setRestoringSession] = useState(true);

    const isAdmin = !!(
        profile && (
            profile.role === 'admin' ||
            profile.role === 'contract_admin' ||
            (import.meta.env.DEV && session && devAdminActors.has(session.actor.toString()))
        )
    );
    const isSponsor = profile?.role === 'sponsor';

    // ── Restore de sessão ao recarregar (suporta deep links) ─────────────────
    useEffect(() => {
        sessionKit.restore().then(async (restored) => {
            if (restored && getAuthToken()) {
                setSession(restored);
                await loadProfile();
                // Não navega — o usuário permanece na URL que acessou (deep link funciona)
            }
        }).catch(() => {}).finally(() => setRestoringSession(false));
    }, []);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchUserProfile();
            setProfile(data);
            if (data.preferences?.locale && data.preferences.locale !== i18n.language) {
                i18n.changeLanguage(data.preferences.locale);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('errors.generic') ?? 'Erro');
        } finally {
            setLoading(false);
        }
    }, [i18n, t]);

    const handleLogin = useCallback(async (sessionPromise: Promise<Session>) => {
        setLoading(true);
        setError(null);
        try {
            const newSession    = await sessionPromise;
            const authenticated = await authenticateSession(newSession);
            if (!authenticated) throw new Error(t('auth.auth_failed') ?? 'Falha na autenticação');
            setSession(newSession);
            await loadProfile();
            navigate('/lobby');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('errors.generic') ?? 'Erro');
            clearAuthToken();
        } finally {
            setLoading(false);
        }
    }, [authenticateSession, loadProfile, navigate, t]);

    const login = useCallback(
        () => handleLogin(sessionKit.login().then(({ session: s }) => s)),
        [handleLogin],
    );

    const loginDev = useCallback(() => {
        if (createDevSession) handleLogin(createDevSession());
    }, [handleLogin]);

    const logout = useCallback(async () => {
        await sessionKit.logout();
        clearAuthToken();
        setSession(null);
        setProfile(null);
        setError(null);
        navigate('/', { replace: true });
    }, [navigate]);

    const handleLanguageChange = useCallback(async (locale: string) => {
        i18n.changeLanguage(locale);
        if (session) {
            try { await updateUserLocale(locale); } catch { /* silencioso */ }
        }
    }, [i18n, session]);

    // Props compartilhadas entre páginas autenticadas
    const pageProps: PageProps = {
        session:          session!,
        profile:          profile!,
        isAdmin,
        theme,
        onToggleTheme:    toggleTheme,
        onLanguageChange: handleLanguageChange,
        onLogout:         logout,
    };

    // ── activeTab derivado da URL (ADR-015) ───────────────────────────────────
    const activeTab = location.pathname.startsWith('/wallet')  ? 'wallet'
                    : location.pathname.startsWith('/history') ? 'my_history'
                    : 'lobby';

    const NAV_TABS = [
        { id: 'lobby',      path: '/lobby',   label: t('nav.lobby')      ?? 'Salas'    },
        { id: 'my_history', path: '/history', label: t('nav.my_history') ?? 'Histórico' },
        { id: 'wallet',     path: '/wallet',  label: t('nav.wallet')     ?? 'Carteira' },
    ];

    // Shell do jogador — nav + conteúdo (Lobby / History / Wallet)
    const PlayerShell = () => (
        <div className="site-shell mode-player" style={{ minHeight: '100dvh' }}>
            <header className="site-nav">
                <div className="site-nav-left">
                    <Logo
                        variant="horizontal"
                        height={64}
                        onClick={() => navigate('/lobby')}
                    />
                    <nav className="site-tabs" aria-label={t('nav.lobby') ?? 'Salas de Jogo'}>
                        {NAV_TABS.map(tab => (
                            <a
                                key={tab.id}
                                href={tab.path}
                                className={`site-tab${activeTab === tab.id ? ' is-active' : ''}`}
                                aria-current={activeTab === tab.id ? 'page' : undefined}
                                onClick={(e) => { e.preventDefault(); navigate(tab.path); }}
                            >
                                {tab.label}
                            </a>
                        ))}
                    </nav>
                </div>

                <div className="site-nav-right">
                    <span className="cb-wallet-chip">
                        <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.75rem' }}>
                            {profile?.wallet_address}
                        </span>
                    </span>

                    {profile && (
                        <span className={`cb-tier-${profile.progression.tier.toLowerCase() as 'bronze' | 'silver' | 'gold' | 'diamond'}`}>
                            {profile.progression.tier}
                        </span>
                    )}

                    {isAdmin && (
                        <button
                            className="cb-btn cb-btn-outline cb-btn-sm"
                            onClick={() => navigate('/admin/dashboard')}
                        >
                            Admin
                        </button>
                    )}
                    {isSponsor && (
                        <button
                            className="cb-btn cb-btn-outline cb-btn-sm"
                            onClick={() => navigate('/sponsor/rooms')}
                        >
                            ▲ {t('sponsor.panel_title')}
                        </button>
                    )}

                    <select
                        value={i18n.language}
                        onChange={(e) => handleLanguageChange(e.target.value)}
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
                        onClick={toggleTheme}
                        aria-label="Alternar tema"
                        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                    >
                        {theme === 'dark' ? '☾' : '☀'}
                    </button>

                    <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={logout}>
                        {t('nav.logout') ?? 'Desconectar'}
                    </button>
                </div>
            </header>

            <div className="site-content">
                <main className="site-main">
                    {error && (
                        <div className="cb-alert cb-alert-error" style={{ margin: '1rem 1.5rem 0' }}>
                            {error}
                        </div>
                    )}
                    {import.meta.env.DEV && createDevSession && activeTab === 'lobby' && (
                        <div style={{ padding: '0.5rem 1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--cb-border-subtle)', background: 'var(--cb-bg-sunken)', fontSize: '0.7rem' }}>
                            <span style={{ color: 'var(--cb-text-tertiary)', alignSelf: 'center' }}>DEV:</span>
                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={loginDev}>
                                🧪 Dev Login
                            </button>
                        </div>
                    )}
                    <Outlet />
                </main>
            </div>
        </div>
    );

    const isLoading = loading || isAuthenticating;

    return (
        <Routes>
            {/* ── Raiz: redireciona autenticado → /lobby, else Landing ── */}
            <Route
                path="/"
                element={
                    restoringSession ? (
                        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
                            <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
                        </div>
                    ) : session && profile ? (
                        <Navigate to="/lobby" replace />
                    ) : (
                        <LandingPage
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onConnect={login}
                            devAccounts={import.meta.env.DEV ? devAccounts : null}
                            onDevLogin={import.meta.env.DEV ? ((actor, key) => {
                                if (createCustomSession) handleLogin(createCustomSession(actor, key));
                            }) : null}
                        />
                    )
                }
            />

            {/* ── Rota pública: histórico de sala (sem auth — ADR-015) ── */}
            <Route path="/room/:roomId/history" element={<RoomHistoryPage session={session} />} />

            {/* ── Rotas protegidas por autenticação ── */}
            <Route element={
                <AuthGuard
                    session={session}
                    profile={profile}
                    restoringSession={restoringSession}
                />
            }>
                {/* ── Shell do jogador (Lobby / History / Wallet) ── */}
                <Route element={<PlayerShell />}>
                    <Route path="/lobby" element={
                        <Lobby
                            session={session!}
                            onEnterRoom={(roomId, gameId) => navigate(`/room/${roomId}/${gameId}`)}
                            onReplayGame={(gameId) => navigate(`/replay/${gameId}`)}
                        />
                    } />
                    <Route path="/history" element={
                        <MyHistoryPage
                            session={session!}
                            onViewReplay={(gameId) => navigate(`/replay/${gameId}`)}
                        />
                    } />
                    <Route path="/wallet" element={<WalletPage session={session!} />} />
                </Route>

                {/* ── Telas full-screen ── */}
                <Route path="/room/:roomId/:gameId" element={<GameRoomPage {...pageProps} />} />
                <Route path="/replay/:gameId"       element={<ReplayPage session={session!} />} />

                {/* ── Admin (requer role admin) ── */}
                <Route element={<AdminGuard isAdmin={isAdmin} />}>
                    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="/admin/:section" element={
                        <AdminLayout
                            profile={profile!}
                            session={session!}
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onLogout={logout}
                        />
                    } />
                </Route>

                {/* ── Sponsor (requer role sponsor) ── */}
                <Route element={<SponsorGuard isSponsor={isSponsor} />}>
                    <Route element={
                        <SponsorLayout
                            session={session!}
                            profile={profile!}
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onLogout={logout}
                        />
                    }>
                        <Route path="/sponsor" element={<Navigate to="/sponsor/rooms" replace />} />
                        <Route path="/sponsor/rooms" element={<SponsorRooms />} />
                        <Route path="/sponsor/vault" element={<SponsorVault />} />
                    </Route>
                </Route>
            </Route>

            {/* ── Loading global (perfil ainda carregando) ── */}
            {isLoading && !restoringSession && (
                <Route path="*" element={
                    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                            <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
                            <p style={{ color: 'var(--cb-text-secondary)', fontSize: '0.875rem' }}>
                                {t('common.loading') ?? 'Carregando...'}
                            </p>
                            {(error ?? authError) && (
                                <p style={{ color: 'var(--cb-danger)', fontSize: '0.875rem' }}>
                                    {error ?? authError}
                                </p>
                            )}
                        </div>
                    </div>
                } />
            )}

            {/* ── Fallback: qualquer rota inválida → / ── */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

// ── APP (BrowserRouter wrapper — thin) ───────────────────────────────────────

export default function App() {
    return (
        <BrowserRouter>
            <AppRoot />
        </BrowserRouter>
    );
}
