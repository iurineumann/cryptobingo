// apps/frontend/src/App.tsx
// Componente raiz. Gerencia:
//   - Sessão Web3 (Wharfkit SessionKit)
//   - Autenticação JWT via useAuth (ADR-006)
//   - Perfil do usuário (MongoDB via api-gateway)
//   - Seletor de idioma (i18next)
//
// Fluxo de login:
//   1. Usuário clica em "Conectar Carteira"
//   2. Wharfkit abre o plugin selecionado (Anchor / Cloud Wallet)
//   3. Após sessão criada, useAuth assina o nonce do servidor
//   4. JWT armazenado em sessionStorage via setAuthToken()
//   5. fetchUserProfile() lê o perfil via JWT
//
// Ref: ADR-006, Hardening-5 (chave privada removida do bundle)

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchUserProfile, updateUserLocale, clearAuthToken, getAuthToken } from './services/api';
import { sessionKit } from './services/wharfkit';
import { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { useAuth } from './hooks/useAuth';
import Lobby from './components/Lobby';

// ============================================================
// DEV LOGIN — Guard de ambiente
//
// Eliminado completamente pelo Vite no build de produção
// via tree-shaking (import.meta.env.DEV === false).
// Ref: Hardening-5
// ============================================================
let createDevSession: (() => Promise<Session>) | null = null;

if (import.meta.env.DEV) {
    const { WalletPluginPrivateKey } = await import('@wharfkit/wallet-plugin-privatekey');

    const devActor   = import.meta.env.VITE_DEV_ACTOR;
    const devKey     = import.meta.env.VITE_DEV_PRIVATE_KEY;
    const devChainId = import.meta.env.VITE_CHAIN_ID;
    const devRpcUrl  = import.meta.env.VITE_RPC_URL;

    if (!devActor || !devKey || !devChainId || !devRpcUrl) {
        console.warn(
            '[DEV] Login rápido desabilitado: defina VITE_DEV_ACTOR, VITE_DEV_PRIVATE_KEY, ' +
            'VITE_CHAIN_ID e VITE_RPC_URL no .env local.'
        );
    } else {
        createDevSession = async () =>
            new Session({
                actor:        devActor,
                permission:   'active',
                chain:        { id: devChainId, url: devRpcUrl },
                walletPlugin: new WalletPluginPrivateKey(devKey),
            });
    }
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function App() {
    const { t, i18n }   = useTranslation();
    const { isAuthenticating, authError, authenticateSession } = useAuth();

    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<MongoUserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);

    // Restaura sessão Wharfkit ao recarregar a página.
    // Se há token JWT em sessionStorage e sessão restaurada, carrega o perfil.
    useEffect(() => {
        sessionKit.restore().then(async (restoredSession) => {
            if (restoredSession && getAuthToken()) {
                setSession(restoredSession);
                await loadUserProfile();
            }
        });
    }, []);

    // Carrega o perfil via JWT (wallet lido pelo servidor a partir do token)
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
            const msg = err instanceof Error ? err.message : 'Falha ao carregar perfil.';
            console.error('[App] Falha ao carregar perfil:', err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // Fluxo de login Web3 + autenticação JWT
    const handleLogin = async (sessionPromise: Promise<Session>) => {
        setLoading(true);
        setError(null);
        try {
            const newSession = await sessionPromise;

            // Autentica a sessão contra o api-gateway (ADR-006)
            const authenticated = await authenticateSession(newSession);
            if (!authenticated) {
                throw new Error('Falha na autenticação JWT. Tente novamente.');
            }

            setSession(newSession);
            await loadUserProfile();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Falha no login.';
            console.error('[App] Erro no login:', err);
            setError(msg);
            clearAuthToken();
        } finally {
            setLoading(false);
        }
    };

    const login = () =>
        handleLogin(sessionKit.login().then(({ session: s }) => s));

    const loginDev = () => {
        if (!createDevSession) return;
        handleLogin(createDevSession());
    };

    const logout = async () => {
        await sessionKit.logout();
        clearAuthToken();
        setSession(null);
        setProfile(null);
        setError(null);
    };

    const handleLanguageChange = async (newLocale: string) => {
        i18n.changeLanguage(newLocale);
        if (session) {
            try {
                await updateUserLocale(newLocale);
            } catch (err) {
                console.error('[App] Falha ao atualizar locale:', err);
            }
        }
    };

    const isLoading = loading || isAuthenticating;

    // ── Tela: Deslogado ───────────────────────────────────────────────────────
    if (!session) {
        return (
            <div style={styles.centerPage}>
                <div style={styles.loginCard}>
                    <h1 style={styles.title}>🎲 CryptoBingo</h1>
                    <p style={styles.subtitle}>Conecte sua carteira para começar a jogar.</p>

                    {isLoading && (
                        <p style={styles.loadingText}>⏳ Autenticando...</p>
                    )}

                    {(error || authError) && (
                        <div style={styles.errorBox}>
                            ⚠️ {error ?? authError}
                        </div>
                    )}

                    <div style={styles.btnGroup}>
                        <button
                            style={styles.btnPrimary}
                            onClick={login}
                            disabled={isLoading}
                        >
                            Conectar Carteira Web3
                        </button>

                        {import.meta.env.DEV && createDevSession && (
                            <button
                                style={styles.btnDev}
                                onClick={loginDev}
                                disabled={isLoading}
                            >
                                🧪 Login Rápido (Dev)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Tela: Carregando perfil ───────────────────────────────────────────────
    if (isLoading || !profile) {
        return (
            <div style={styles.centerPage}>
                <h2>{t('loading')}</h2>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>
        );
    }

    // ── Tela: Dashboard ───────────────────────────────────────────────────────
    return (
        <div style={styles.page}>
            {/* Top bar */}
            <div style={styles.topBar}>
                <h1 style={{ margin: 0, fontSize: '22px' }}>🎲 {t('welcome')}</h1>
                <div style={styles.topRight}>
                    <div style={styles.walletBadge}>
                        🔗 {profile.wallet_address}
                        <span style={styles.tierBadge}>{profile.progression.tier}</span>
                    </div>
                    <button style={styles.btnLogout} onClick={logout}>
                        Desconectar
                    </button>
                </div>
            </div>

            {/* Seletor de idioma */}
            <div style={{ marginTop: '12px' }}>
                <label style={{ marginRight: '8px', fontWeight: 'bold' }}>{t('language')}:</label>
                <select
                    value={i18n.language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                    <option value="pt-BR">Português (BR)</option>
                    <option value="en-US">English (US)</option>
                    <option value="zh-CN">中文 (Mandarim)</option>
                </select>
            </div>

            {/* Lobby principal */}
            <Lobby session={session} />
        </div>
    );
}

// ==========================================
// ESTILOS
// ==========================================

const styles: Record<string, React.CSSProperties> = {
    centerPage: {
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'sans-serif',
        background:     '#f8fafc',
        padding:        '20px',
    },
    loginCard: {
        background:   '#ffffff',
        borderRadius: '20px',
        padding:      '48px 40px',
        boxShadow:    '0 20px 40px rgba(0,0,0,0.1)',
        textAlign:    'center',
        maxWidth:     '400px',
        width:        '100%',
    },
    title: {
        margin:     '0 0 8px 0',
        fontSize:   '36px',
        fontWeight: 'bold',
        color:      '#0f172a',
    },
    subtitle: {
        color:        '#64748b',
        marginBottom: '24px',
        fontSize:     '15px',
    },
    loadingText: {
        color:        '#2563eb',
        marginBottom: '12px',
    },
    errorBox: {
        background:   '#fef2f2',
        border:       '1px solid #fecaca',
        borderRadius: '8px',
        padding:      '12px',
        color:        '#dc2626',
        fontSize:     '14px',
        marginBottom: '16px',
        textAlign:    'left',
    },
    btnGroup: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },
    btnPrimary: {
        padding:      '14px 24px',
        fontSize:     '16px',
        fontWeight:   'bold',
        background:   '#2563eb',
        color:        '#ffffff',
        border:       'none',
        borderRadius: '50px',
        cursor:       'pointer',
    },
    btnDev: {
        padding:      '14px 24px',
        fontSize:     '16px',
        background:   '#f1f5f9',
        color:        '#374151',
        border:       '1px solid #cbd5e1',
        borderRadius: '50px',
        cursor:       'pointer',
    },
    page: {
        maxWidth:   '1200px',
        margin:     '0 auto',
        padding:    '24px 20px',
        fontFamily: 'sans-serif',
    },
    topBar: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        flexWrap:       'wrap',
        gap:            '12px',
    },
    topRight: {
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
        flexWrap:   'wrap',
    },
    walletBadge: {
        background:   '#f1f5f9',
        border:       '1px solid #e2e8f0',
        borderRadius: '50px',
        padding:      '8px 16px',
        fontSize:     '14px',
        color:        '#374151',
        display:      'flex',
        alignItems:   'center',
        gap:          '8px',
    },
    tierBadge: {
        background:   '#2563eb',
        color:        '#fff',
        borderRadius: '50px',
        padding:      '2px 10px',
        fontSize:     '12px',
        fontWeight:   'bold',
    },
    btnLogout: {
        padding:      '8px 16px',
        background:   '#fef2f2',
        color:        '#dc2626',
        border:       '1px solid #fecaca',
        borderRadius: '8px',
        cursor:       'pointer',
        fontSize:     '14px',
    },
};
