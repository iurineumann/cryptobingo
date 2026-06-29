import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

const NAV_LINKS = [
    { path: '/how-it-works', key: 'nav.how_it_works', testId: 'nav-how-it-works' },
    { path: '/sponsors',     key: 'nav.sponsors',      testId: 'nav-sponsors' },
    { path: '/tutorials',    key: 'nav.tutorials',     testId: 'nav-tutorials' },
    { path: '/faq',          key: 'nav.faq',           testId: 'nav-faq' },
    { path: '/news',         key: 'nav.news',          testId: 'nav-news' },
];

export default function PublicLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="site-shell mode-public" data-testid="public-layout" style={{ minHeight: '100dvh' }}>
            <header className="public-nav">
                <div className="cb-container flex items-center justify-between gap-4" style={{ height: '4rem' }}>
                    <Logo variant="horizontal" height={56} onClick={() => navigate('/')} />

                    <nav className="flex gap-6 text-sm" aria-label={t('nav.explore')}>
                        {NAV_LINKS.map(link => (
                            <a
                                key={link.path}
                                href={link.path}
                                data-testid={link.testId}
                                className={`public-nav-link${location.pathname === link.path ? ' is-active' : ''}`}
                                onClick={(e) => { e.preventDefault(); navigate(link.path); }}
                            >
                                {t(link.key)}
                            </a>
                        ))}
                    </nav>

                    <a
                        href="/"
                        data-testid="nav-home"
                        className="cb-btn cb-btn-outline cb-btn-sm"
                        onClick={(e) => { e.preventDefault(); navigate('/'); }}
                    >
                        ◆ {t('nav.lobby')}
                    </a>
                </div>
            </header>

            <div className="site-content">
                <main className="site-main">
                    <Outlet />
                </main>
            </div>

            <footer className="public-footer">
                <div className="cb-container flex justify-between items-center flex-wrap gap-4 text-xs">
                    <span>CryptoBingo</span>
                    <span>{t('landing.footer_copyright', { year: new Date().getFullYear() })}</span>
                </div>
            </footer>
        </div>
    );
}
