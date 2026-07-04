import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavLinkItem =
  | { type: 'internal'; label: string; href: string }
  | { type: 'external'; label: string; href: string }
  | { type: 'disabled'; label: string };

const locales = [
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
  { code: 'zh', label: '中文' },
];

function useSegmentLocale(path: string): string | null {
  const match = path.match(/^\/(en|pt|zh)(\/|$)/);
  return match?.[1] ?? null;
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const currentLocale = useSegmentLocale(location.pathname) || 'en';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    if (mobileOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Fecha drawer ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function switchLocale(code: string) {
    i18n.changeLanguage(code);
    setLangOpen(false);
    const path = location.pathname.replace(/^\/(en|pt|zh)/, `/${code}`);
    navigate(path);
  }

  const navLinks: NavLinkItem[] = [
    { type: 'external', label: t('nav.testnet'), href: 'https://test.cryptobingo.bet' },
    { type: 'internal', label: t('nav.ideas'), href: '/ideas' },
    { type: 'external', label: t('nav.github'), href: 'https://github.com/iurineumann/cryptobingo' },
    { type: 'external', label: t('nav.telegram'), href: 'https://t.me/cryptobingo_bet' },
    { type: 'external', label: t('nav.twitter'), href: 'https://x.com/CryptoBingo_Bet' },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-surface-900/80 border-b border-surface-700/50">
      <div className="max-w-7xl mx-auto flex justify-between items-center h-16 px-4">
        <a href={`/${currentLocale}`} className="flex items-center gap-0.5 text-xl font-bold text-white">
          <span>CryptoBingo</span>
          <span className="text-accent-400">●</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6" data-testid="desktop-nav">
          {navLinks.map((link) => {
            if (link.type === 'internal') {
              return (
                <NavLink
                  key={link.label}
                  to={link.href}
                  className={({ isActive }) =>
                    cn(
                      'text-sm text-slate-400 hover:text-white transition-colors',
                      isActive && 'text-white'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              );
            }
            if (link.type === 'disabled') {
              return (
                <span
                  key={link.label}
                  className="text-sm text-slate-400 opacity-50 cursor-not-allowed"
                >
                  {link.label}
                </span>
              );
            }
            return (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            );
          })}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="text-sm text-slate-400 hover:text-white transition-colors uppercase"
            >
              {locales.find((l) => l.code === currentLocale)?.label || 'EN'}
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-2 bg-surface-800 border border-surface-600 rounded-lg overflow-hidden shadow-lg min-w-[80px]">
                {locales.map((loc) => (
                  <button
                    key={loc.code}
                    onClick={() => switchLocale(loc.code)}
                    className={cn(
                      'block w-full text-left px-3 py-2 text-sm hover:bg-surface-700 transition-colors',
                      loc.code === currentLocale ? 'text-white' : 'text-slate-400'
                    )}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <a
            href="https://test.cryptobingo.bet"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="mobile-cta"
            className="bg-accent-400 text-surface-900 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-accent-300 transition whitespace-nowrap"
          >
            {t('hero.cta_text')}
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          data-testid="mobile-menu-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-slate-400 hover:text-white transition-colors"
          aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          ref={drawerRef}
          data-testid="mobile-drawer"
          className="md:hidden fixed inset-0 top-16 z-40 bg-surface-950/95 backdrop-blur-sm"
        >
          <nav className="flex flex-col gap-4 p-6">
            {navLinks.map((link) => {
              if (link.type === 'internal') {
                return (
                  <NavLink
                    key={link.label}
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'text-base text-slate-400 hover:text-white transition-colors py-2',
                        isActive && 'text-white'
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                );
              }
              if (link.type === 'disabled') {
                return (
                  <span
                    key={link.label}
                    className="text-base text-slate-400 opacity-50 cursor-not-allowed py-2"
                  >
                    {link.label}
                  </span>
                );
              }
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-slate-400 hover:text-white transition-colors py-2"
                >
                  {link.label}
                </a>
              );
            })}

            {/* Locale switcher mobile */}
            <div className="flex gap-2 pt-4 border-t border-surface-700">
              {locales.map((loc) => (
                <button
                  key={loc.code}
                  onClick={() => switchLocale(loc.code)}
                  className={cn(
                    'flex-1 text-sm py-2 rounded-lg transition-colors',
                    loc.code === currentLocale
                      ? 'bg-brand-500/20 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-surface-800'
                  )}
                >
                  {loc.label}
                </button>
              ))}
            </div>

            {/* CTA fixo no drawer */}
            <a
              href="https://test.cryptobingo.bet"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mobile-cta-drawer"
              className="mt-4 bg-accent-400 text-surface-900 font-semibold text-center px-6 py-3 rounded-xl hover:bg-accent-300 transition"
            >
              {t('hero.cta_text')}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
