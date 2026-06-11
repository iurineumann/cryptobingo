// apps/swap-ui/src/components/Navbar.tsx
// Navbar do bingogameswp: logo, navegação, wallet button, seletor de idioma.
// Link bidirecional: "← Jogar Bingo" aponta para VITE_GAME_URL (ADR-022).

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../hooks/useWallet';

const GAME_URL = import.meta.env.VITE_GAME_URL || 'http://localhost:5173';

const LOCALES = [
    { code: 'pt-BR', label: 'PT' },
    { code: 'en-US', label: 'EN' },
    { code: 'zh-CN', label: '中' },
];

export default function Navbar() {
    const { t, i18n } = useTranslation();
    const { session, isLoading, connect, disconnect } = useWallet();

    return (
        <nav className="cb-navbar" data-testid="swap-navbar">
            <div className="cb-container cb-navbar-inner">

                {/* Logo + navegação */}
                <div className="flex items-center gap-6">
                    <a href="/" className="cb-logo" data-testid="swap-logo">
                        bingo.<span>swap</span>
                    </a>

                    <div className="hidden sm:flex items-center gap-1">
                        <NavLink
                            to="/swap"
                            className={({ isActive }) =>
                                `cb-btn cb-btn-sm cb-btn-ghost ${isActive ? 'text-[--cb-brand]' : ''}`}
                            data-testid="nav-swap"
                        >
                            {t('nav.swap')}
                        </NavLink>
                        <NavLink
                            to="/pool"
                            className={({ isActive }) =>
                                `cb-btn cb-btn-sm cb-btn-ghost ${isActive ? 'text-[--cb-brand]' : ''}`}
                            data-testid="nav-pool"
                        >
                            {t('nav.pool')}
                        </NavLink>
                        <NavLink
                            to="/analytics"
                            className={({ isActive }) =>
                                `cb-btn cb-btn-sm cb-btn-ghost ${isActive ? 'text-[--cb-brand]' : ''}`}
                            data-testid="nav-analytics"
                        >
                            {t('nav.analytics')}
                        </NavLink>
                    </div>
                </div>

                {/* Direita: link para o jogo + idioma + carteira */}
                <div className="flex items-center gap-2">
                    <a
                        href={GAME_URL}
                        className="cb-btn cb-btn-sm cb-btn-ghost hidden sm:inline-flex"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="nav-play-bingo"
                    >
                        {t('common.play_bingo')}
                    </a>

                    {/* Seletor de idioma */}
                    <div className="flex items-center gap-0.5">
                        {LOCALES.map(loc => (
                            <button
                                key={loc.code}
                                className={[
                                    'cb-btn cb-btn-sm rounded-lg',
                                    i18n.language === loc.code ? 'cb-btn-outline' : 'cb-btn-ghost',
                                ].join(' ')}
                                onClick={() => i18n.changeLanguage(loc.code)}
                                data-testid={`lang-${loc.code}`}
                                style={{ minWidth: '2.25rem', padding: '0.25rem 0.5rem' }}
                            >
                                {loc.label}
                            </button>
                        ))}
                    </div>

                    {/* Wallet */}
                    {session ? (
                        <div className="flex items-center gap-2">
                            <div className="cb-wallet-chip" data-testid="wallet-chip">
                                <span className="cb-status-dot cb-status-dot-live" />
                                {String(session.actor).slice(0, 12)}
                            </div>
                            <button
                                className="cb-btn cb-btn-sm cb-btn-danger"
                                onClick={disconnect}
                                data-testid="wallet-disconnect"
                            >
                                {t('common.disconnect')}
                            </button>
                        </div>
                    ) : (
                        <button
                            className="cb-btn cb-btn-sm cb-btn-primary"
                            onClick={connect}
                            disabled={isLoading}
                            aria-busy={isLoading}
                            data-testid="wallet-connect"
                        >
                            {isLoading ? t('common.loading') : t('common.connect_wallet')}
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}
