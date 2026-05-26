// apps/frontend/src/App.tsx
// Ref: ADR-006, Hardening-5

import { useEffect, useState }                                 from 'react';
import { useTranslation }                                      from 'react-i18next';
import { fetchUserProfile, updateUserLocale, clearAuthToken, getAuthToken } from './services/api';
import { sessionKit }                                          from './services/wharfkit';
import { Session }                                             from '@wharfkit/session';
import type { MongoUserProfile }                               from '@cryptobingo/shared-types';
import { useAuth }                                             from './hooks/useAuth';
import { useTheme }                                            from './hooks/useTheme';
import Lobby                                                   from './components/Lobby';

// ── DEV LOGIN (tree-shaken em produção) ──────────────────────────────────────
let createDevSession: (() => Promise<Session>) | null = null;

if (import.meta.env.DEV) {
    const { WalletPluginPrivateKey } = await import('@wharfkit/wallet-plugin-privatekey');
    const devActor   = import.meta.env.VITE_DEV_ACTOR;
    const devKey     = import.meta.env.VITE_DEV_PRIVATE_KEY;
    const devChainId = import.meta.env.VITE_CHAIN_ID;
    const devRpcUrl  = import.meta.env.VITE_RPC_URL;

    if (devActor && devKey && devChainId && devRpcUrl) {
        createDevSession = async () => new Session({
            actor:        devActor,
            permission:   'active',
            chain:        { id: devChainId, url: devRpcUrl },
            walletPlugin: new WalletPluginPrivateKey(devKey),
        });
    }
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
    const { t, i18n }                                          = useTranslation();
    const { isAuthenticating, authError, authenticateSession } = useAuth();
    const { theme, toggleTheme, isDark }                       = useTheme();

    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<MongoUserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    // Restaura sessão ao recarregar
    useEffect(() => {
        sessionKit.restore().then(async (restoredSession) => {
            if (restoredSession && getAuthToken()) {
                setSession(restoredSession);
                await loadUserProfile();
            }
        });
    }, []);

    const loadUserProfile = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchUserProfile();
            setProfile(data);
            if (data.preferences.locale && data.preferences.locale !== i18n.language) {
                i18n.changeLanguage(data.preferences.locale);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar perfil.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (sessionPromise: Promise<Session>) => {
        setLoading(true);
        setError(null);
        try {
            const newSession      = await sessionPromise;
            const authenticated   = await authenticateSession(newSession);
            if (!authenticated) throw new Error('Falha na autenticação JWT. Tente novamente.');
            setSession(newSession);
            await loadUserProfile();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha no login.');
            clearAuthToken();
        } finally {
            setLoading(false);
        }
    };

    const login    = () => handleLogin(sessionKit.login().then(({ session: s }) => s));
    const loginDev = () => createDevSession && handleLogin(createDevSession());

    const logout = async () => {
        await sessionKit.logout();
        clearAuthToken();
        setSession(null);
        setProfile(null);
        setError(null);
    };

    const handleLanguageChange = async (locale: string) => {
        i18n.changeLanguage(locale);
        if (session) {
            try { await updateUserLocale(locale); } catch {}
        }
    };

    const isLoading = loading || isAuthenticating;

    // ── Tela de Login ─────────────────────────────────────────────────────────
    if (!session) {
        return (
            <div className="cb-page min-h-dvh flex items-center justify-center p-4">

                {/* Background decorativo */}
                <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full
                                    bg-radial-gradient opacity-[0.08]"
                         style={{ background: 'radial-gradient(circle, var(--color-brand-600), transparent 70%)' }} />
                    <div className="absolute top-1/2 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.05]"
                         style={{ background: 'radial-gradient(circle, var(--color-accent-400), transparent 70%)' }} />
                </div>

                <div className="w-full max-w-md">
                    {/* Card de login */}
                    <div className="cb-card text-center px-8 py-12">

                        {/* Logo */}
                        <div className="mb-2 flex justify-center">
                            <span className="text-6xl" role="img" aria-label="Bingo">🎲</span>
                        </div>
                        <h1 className="cb-logo text-4xl mb-2">
                            Crypto<span>Bingo</span>
                        </h1>
                        <p className="text-[--cb-text-secondary] text-sm mb-8 leading-relaxed">
                            Bingo on-chain, provably fair.<br/>Conecte sua carteira WAX para jogar.
                        </p>

                        {/* Loading */}
                        {isLoading && (
                            <div className="flex items-center justify-center gap-2 mb-6 text-[--cb-text-secondary] text-sm">
                                <span className="cb-spinner" aria-hidden="true" />
                                <span>Autenticando...</span>
                            </div>
                        )}

                        {/* Erro */}
                        {(error || authError) && (
                            <div className="cb-alert cb-alert-error mb-6" role="alert">
                                <span aria-hidden="true">⚠️</span>
                                <span>{error ?? authError}</span>
                            </div>
                        )}

                        {/* Botões */}
                        <div className="flex flex-col gap-3">
                            <button
                                className="cb-btn cb-btn-primary cb-btn-lg cb-btn-pill w-full"
                                onClick={login}
                                disabled={isLoading}
                                aria-busy={isLoading}
                            >
                                <span aria-hidden="true">🔗</span>
                                Conectar Carteira Web3
                            </button>

                            {import.meta.env.DEV && createDevSession && (
                                <button
                                    className="cb-btn cb-btn-outline cb-btn-pill w-full"
                                    onClick={loginDev}
                                    disabled={isLoading}
                                >
                                    <span aria-hidden="true">🧪</span>
                                    Login Rápido (Dev)
                                </button>
                            )}
                        </div>

                        {/* Rodapé */}
                        <p className="mt-8 text-xs text-[--cb-text-tertiary] leading-relaxed">
                            Ao conectar, você concorda com os{' '}
                            <a href="#" className="text-[--cb-brand] hover:underline">Termos de Uso</a>.
                            <br/>Sorteio verificável via oráculo{' '}
                            <span className="font-mono">orng.wax</span>.
                        </p>
                    </div>

                    {/* Theme toggle */}
                    <div className="mt-4 flex justify-center">
                        <button
                            className="cb-theme-toggle"
                            onClick={toggleTheme}
                            aria-label={`Alternar para tema ${isDark ? 'claro' : 'escuro'}`}
                            title={`Tema ${isDark ? 'Claro' : 'Escuro'}`}
                        >
                            {isDark ? '☀️' : '🌙'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Tela de Loading ───────────────────────────────────────────────────────
    if (isLoading || !profile) {
        return (
            <div className="cb-page min-h-dvh flex items-center justify-center">
                <div className="text-center">
                    <div className="cb-spinner w-12 h-12 mx-auto mb-4"
                         style={{ width: '3rem', height: '3rem', borderWidth: '3px' }} />
                    <p className="text-[--cb-text-secondary] text-sm">{t('loading')}</p>
                    {error && (
                        <p className="mt-2 text-[--cb-danger] text-sm">{error}</p>
                    )}
                </div>
            </div>
        );
    }

    // ── Dashboard Principal ───────────────────────────────────────────────────
    return (
        <div className="cb-page">

            {/* ── Navbar ── */}
            <header className="cb-navbar" role="banner">
                <div className="cb-container cb-navbar-inner">

                    {/* Logo */}
                    <a href="/" className="cb-logo" aria-label="CryptoBingo — Início">
                        <span aria-hidden="true">🎲 </span>Crypto<span>Bingo</span>
                    </a>

                    {/* Right side */}
                    <div className="flex items-center gap-2 sm:gap-3">

                        {/* Seletor de idioma */}
                        <select
                            className="cb-input cb-select hidden sm:block w-auto text-sm py-1.5"
                            value={i18n.language}
                            onChange={e => handleLanguageChange(e.target.value)}
                            aria-label="Selecionar idioma"
                        >
                            <option value="pt-BR">🇧🇷 PT</option>
                            <option value="en-US">🇺🇸 EN</option>
                            <option value="zh-CN">🇨🇳 ZH</option>
                        </select>

                        {/* Wallet badge */}
                        <div className="cb-wallet-chip hidden md:inline-flex" aria-label="Carteira conectada">
                            <span className="text-[--cb-brand]" aria-hidden="true">●</span>
                            <span>{profile.wallet_address}</span>
                            {/* Tier badge */}
                            <span className={`cb-badge cb-tier-${profile.progression.tier.toLowerCase()} ml-1`}>
                                {profile.progression.tier}
                            </span>
                        </div>

                        {/* Theme toggle */}
                        <button
                            className="cb-theme-toggle"
                            onClick={toggleTheme}
                            aria-label={`Alternar para tema ${isDark ? 'claro' : 'escuro'}`}
                        >
                            {isDark ? '☀️' : '🌙'}
                        </button>

                        {/* Logout */}
                        <button
                            className="cb-btn cb-btn-danger cb-btn-sm"
                            onClick={logout}
                            aria-label="Desconectar carteira"
                        >
                            <span className="hidden sm:inline">Sair</span>
                            <span className="sm:hidden" aria-hidden="true">↪</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main Content ── */}
            <main className="cb-container py-6 sm:py-8" role="main">

                {/* XP Progress bar */}
                <div className="mb-6 p-4 cb-card flex items-center gap-4">
                    <div className="flex-shrink-0">
                        <span className={`cb-badge cb-tier-${profile.progression.tier.toLowerCase()} text-sm px-3 py-1`}>
                            {profile.progression.tier}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs text-[--cb-text-tertiary] mb-1">
                            <span>{profile.nickname || profile.wallet_address}</span>
                            <span>{profile.progression.xp.toLocaleString()} XP</span>
                        </div>
                        <div className="cb-progress-track">
                            <div
                                className="cb-progress-fill"
                                style={{ width: `${Math.min((profile.progression.xp % 1000) / 10, 100)}%` }}
                                role="progressbar"
                                aria-valuenow={profile.progression.xp % 1000}
                                aria-valuemin={0}
                                aria-valuemax={1000}
                                aria-label="Progresso de XP"
                            />
                        </div>
                    </div>
                    <div className="flex-shrink-0 text-right hidden sm:block">
                        <p className="text-xs text-[--cb-text-tertiary]">Partidas</p>
                        <p className="text-sm font-semibold text-[--cb-text-primary]">
                            {profile.progression.games_played}
                        </p>
                    </div>
                </div>

                {/* Lobby */}
                <Lobby session={session} />
            </main>
        </div>
    );
}
