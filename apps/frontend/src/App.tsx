// apps/frontend/src/App.tsx
// Componente raiz — roteamento state-based, sessão Web3, autenticação JWT.
//
// Rotas:
//   landing  → LandingPage (visitantes não autenticados)
//   lobby    → Lobby (listagem de salas — ADR-010)
//   game     → GameRoom (sala ao vivo, identificada por roomId + gameId)
//   wallet   → WalletPage
//   admin    → AdminLayout (painel administrativo — ADR-009)
//
// Ref: ADR-006 (JWT), ADR-007 (WebSocket), ADR-009 (Admin), ADR-010 (Rooms)

import { useEffect, useState, useCallback } from 'react';
import { useTranslation }                   from 'react-i18next';
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
import WalletPage        from './components/WalletPage';
import AdminLayout       from './components/admin/AdminLayout';

// ── DEV LOGIN (tree-shaken em produção) ──────────────────────────────────────
interface DevAccount {
    actor: string;
    key:   string;
    label: string;
}

let   createDevSession: (() => Promise<Session>) | null = null;
let   createCustomSession: ((actor: string, key: string) => Promise<Session>) | null = null;
const devAccounts: DevAccount[] = [];

if (import.meta.env.DEV) {
    const { WalletPluginPrivateKey } = await import('@wharfkit/wallet-plugin-privatekey');
    const devChainId = import.meta.env.VITE_CHAIN_ID;
    const devRpcUrl  = import.meta.env.VITE_RPC_URL;
    const devActor   = import.meta.env.VITE_DEV_ACTOR;
    const devKey     = import.meta.env.VITE_DEV_PRIVATE_KEY;
    if (devActor && devKey && devChainId && devRpcUrl) {
        devAccounts.push({ actor: devActor, key: devKey, label: 'Admin' });
    }
    if (devChainId && devRpcUrl) {
        createDevSession = async () => {
            const a = devAccounts[0];
            if (!a) throw new Error('No dev account configured');
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

// ── TIPOS DE ROTA ─────────────────────────────────────────────────────────────
type Route =
    | { page: 'landing' }
    | { page: 'lobby' }
    | { page: 'game';   roomId: string; gameId: string }
    | { page: 'wallet' }
    | { page: 'admin';  section?: string };

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function App() {
    const { t, i18n }                                          = useTranslation();
    const { isAuthenticating, authError, authenticateSession } = useAuth();
    const { theme, toggleTheme }                               = useTheme();

    const [session,  setSession]  = useState<Session | null>(null);
    const [profile,  setProfile]  = useState<MongoUserProfile | null>(null);
    const [route,    setRoute]    = useState<Route>({ page: 'landing' });
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    // Restaura sessão ao recarregar página
    useEffect(() => {
        sessionKit.restore().then(async (restored) => {
            if (restored && getAuthToken()) {
                setSession(restored);
                await loadProfile();
                setRoute({ page: 'lobby' });
            }
        });
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
            setRoute({ page: 'lobby' });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('errors.generic') ?? 'Erro');
            clearAuthToken();
        } finally {
            setLoading(false);
        }
    }, [authenticateSession, loadProfile, t]);

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
        setRoute({ page: 'landing' });
    }, []);

    const handleLanguageChange = useCallback(async (locale: string) => {
        i18n.changeLanguage(locale);
        if (session) {
            try { await updateUserLocale(locale); } catch { /* silencioso */ }
        }
    }, [i18n, session]);

    const isLoading = loading || isAuthenticating;

    // ── Landing (não autenticado) ──────────────────────────────────────────────
    if (!session) {
        return (
            <LandingPage
                theme={theme}
                onToggleTheme={toggleTheme}
                onConnect={login}
                devAccounts={import.meta.env.DEV ? devAccounts : null}
                onDevLogin={import.meta.env.DEV ? ((actor, key) => {
                    if (createCustomSession) handleLogin(createCustomSession(actor, key));
                }) : null}
            />
        );
    }

    // ── Carregando perfil ──────────────────────────────────────────────────────
    if (isLoading || !profile) {
        return (
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
        );
    }

    // ── Game Room (tela cheia) ─────────────────────────────────────────────────
    if (route.page === 'game') {
        return (
            <GameRoom
                roomId={route.roomId}
                gameId={route.gameId}
                session={session}
                profile={profile}
                onLeave={() => setRoute({ page: 'lobby' })}
            />
        );
    }

    // ── Admin Panel ────────────────────────────────────────────────────────────
    if (route.page === 'admin') {
        return (
            <AdminLayout
                profile={profile}
                session={session}
                theme={theme}
                onToggleTheme={toggleTheme}
                section={route.section ?? 'dashboard'}
                onNavigate={(section) => setRoute({ page: 'admin', section })}
                onLogout={logout}
            />
        );
    }

    // ── Shell do Jogador (lobby / wallet) ──────────────────────────────────────
    const isAdmin  = profile.role === 'admin' || profile.role === 'contract_admin';
    const activeTab = route.page === 'wallet' ? 'wallet' : 'lobby';

    const NAV_TABS = [
        { id: 'lobby',  label: t('nav.lobby')  ?? 'Salas'    },
        { id: 'wallet', label: t('nav.wallet') ?? 'Carteira' },
    ];

    return (
        <div className="site-shell mode-player" style={{ minHeight: '100dvh' }}>

            {/* ── Navbar ── */}
            <header className="site-nav">
                <div className="site-nav-left">
                    <a
                        href="#"
                        className="cb-logo"
                        onClick={(e) => { e.preventDefault(); setRoute({ page: 'lobby' }); }}
                    >
                        Crypto<span>Bingo</span>
                    </a>

                    <nav className="site-tabs" aria-label={t('nav.lobby') ?? 'Salas de Jogo'}>
                        {NAV_TABS.map(tab => (
                            <a
                                key={tab.id}
                                href={`#${tab.id}`}
                                className={`site-tab${activeTab === tab.id ? ' is-active' : ''}`}
                                aria-current={activeTab === tab.id ? 'page' : undefined}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setRoute({ page: tab.id as 'lobby' | 'wallet' });
                                }}
                            >
                                {tab.label}
                            </a>
                        ))}
                    </nav>
                </div>

                <div className="site-nav-right">
                    {/* Wallet chip */}
                    <span className="cb-wallet-chip">
                        <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.75rem' }}>
                            {profile.wallet_address}
                        </span>
                    </span>

                    {/* Tier badge */}
                    <span className={`cb-tier-${profile.progression.tier.toLowerCase() as 'bronze' | 'silver' | 'gold' | 'diamond'}`}>
                        {profile.progression.tier}
                    </span>

                    {/* Acesso admin */}
                    {isAdmin && (
                        <button
                            className="cb-btn cb-btn-outline cb-btn-sm"
                            onClick={() => setRoute({ page: 'admin' })}
                        >
                            Admin
                        </button>
                    )}

                    {/* Seletor de idioma */}
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

                    {/* Theme toggle */}
                    <button
                        className="cb-theme-toggle"
                        onClick={toggleTheme}
                        aria-label="Alternar tema"
                        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                    >
                        {theme === 'dark' ? '☾' : '☀'}
                    </button>

                    {/* Logout */}
                    <button
                        className="cb-btn cb-btn-ghost cb-btn-sm"
                        onClick={logout}
                    >
                        {t('nav.logout') ?? 'Desconectar'}
                    </button>
                </div>
            </header>

            {/* ── Conteúdo ── */}
            <div className="site-content">
                <main className="site-main">
                    {error && (
                        <div className="cb-alert cb-alert-error" style={{ margin: '1rem 1.5rem 0' }}>
                            {error}
                        </div>
                    )}

                    {/* DEV: login rápido */}
                    {import.meta.env.DEV && createDevSession && route.page === 'lobby' && (
                        <div style={{ padding: '0.5rem 1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--cb-border-subtle)', background: 'var(--cb-bg-sunken)', fontSize: '0.7rem' }}>
                            <span style={{ color: 'var(--cb-text-tertiary)', alignSelf: 'center' }}>DEV:</span>
                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={loginDev}>
                                🧪 Dev Login
                            </button>
                        </div>
                    )}

                    {route.page === 'lobby' && (
                        <Lobby
                            session={session}
                            onEnterRoom={(roomId, gameId) => setRoute({ page: 'game', roomId, gameId })}
                        />
                    )}

                    {route.page === 'wallet' && (
                        <WalletPage session={session} />
                    )}
                </main>
            </div>
        </div>
    );
}
