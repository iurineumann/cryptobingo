// apps/frontend/src/components/LandingPage.tsx
// Landing page pública — exibida para visitantes não autenticados.
// Seções: MarketingNav, Hero (com bola animada), Stats, Salas ao vivo,
//         Por que CryptoBingo (provably fair, etc.), Sponsors, Footer.
//
// Refatorado de landing.jsx do Claude Design.
// Classes CSS: landing-* definidas em globals.design.css
// Ref: brief.md §1 (Visão Executiva), COMPLIANCE.md §2

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// ==========================================
// TIPOS
// ==========================================

interface DevAccount {
  actor: string;
  key:   string;
  label: string;
}

interface LandingPageProps {
  onConnect:   () => void;
  devAccounts:  DevAccount[] | null;
  onDevLogin:   ((actor: string, key: string) => void) | null;
  theme:        string;
  onToggleTheme: () => void;
}

// ==========================================
// BOLA ANIMADA DO HERO
// ==========================================

const DEMO_SEQ = [42, 17, 64, 8, 33, 71, 51, 22];

const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)',
  I: 'var(--color-bingo-i)',
  N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)',
  O: 'var(--color-bingo-o)',
};

function getCol(n: number) {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

function HeroBall() {
  const [idx, setIdx]    = useState(0);
  const ballRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setIdx(x => (x + 1) % DEMO_SEQ.length), 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ballRef.current) return;
    const el = ballRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [idx]);

  const n     = DEMO_SEQ[idx];
  const col   = getCol(n);
  const color = BINGO_COLORS[col];

  return (
    <div className="landing-hero-ball-wrap" style={{ '--ball-color': color } as React.CSSProperties}>
      <div className="gr-ball-halo" aria-hidden="true" />
      <div ref={ballRef} className="gr-ball-hero gr-drop" aria-hidden="true">
        <div className="ball-surface" />
        <span className="ball-letter">{col}</span>
        <span className="ball-number">{n}</span>
      </div>
    </div>
  );
}

// ==========================================
// ESTATÍSTICAS
// ==========================================

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function LandingPage({ onConnect, devAccounts, onDevLogin, theme, onToggleTheme }: LandingPageProps) {
  const { t, i18n } = useTranslation();

  const STATS = [
    { value: '2,4M',  unit: 'WAX', label: t('landing.stats_prizes'),  hint: t('landing.stats_prizes_hint') },
    { value: '84,7',  unit: '%',   label: t('landing.stats_rtp'),    hint: t('landing.stats_rtp_hint') },
    { value: '< 3',   unit: 's',   label: t('landing.stats_payout'),    hint: t('landing.stats_payout_hint') },
    { value: '14.790',unit: '',    label: t('landing.stats_compliance'),   hint: t('landing.stats_compliance_hint') },
  ];

  const WHY_ITEMS = [
    {
      icon: '⚡',
      title: t('landing.why_instant_title'),
      desc: t('landing.why_instant_desc'),
    },
    {
      icon: '🛡',
      title: t('landing.why_fair_title'),
      desc: t('landing.why_fair_desc'),
    },
    {
      icon: '◆',
      title: t('landing.why_multitoken_title'),
      desc: t('landing.why_multitoken_desc'),
    },
  ];

  const [devOpen, setDevOpen] = useState(false);
  const devRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!devOpen) return;
    const close = (e: MouseEvent) => {
      if (devRef.current && !devRef.current.contains(e.target as Node)) setDevOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [devOpen]);

  return (
    <div className="landing-page" style={{ minHeight: '100dvh', background: 'var(--cb-bg-base)', color: 'var(--cb-text-primary)', fontFamily: 'var(--font-family-sans)' }}>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 200, background: 'color-mix(in srgb, var(--cb-bg-base) 90%, transparent)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container" style={{ height: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <span className="cb-logo">Crypto<span>Bingo</span></span>

          <nav style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem', color: 'var(--cb-text-secondary)' }} aria-label={t('landing.nav_aria')}>
            <a href="#como" style={{ textDecoration: 'none', color: 'inherit' }}>{t('nav.how_it_works')}</a>
            <a href="#stats" style={{ textDecoration: 'none', color: 'inherit' }}>{t('nav.audit')}</a>
            <a href="#sponsors" style={{ textDecoration: 'none', color: 'inherit' }}>{t('nav.sponsors')}</a>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Seletor de idioma */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['pt-BR', 'en-US', 'zh-CN'].map(lang => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`cb-btn cb-btn-ghost cb-btn-sm${i18n.language === lang ? '' : ''}`}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontWeight: i18n.language === lang ? 700 : 400,
                    color: i18n.language === lang ? 'var(--cb-brand)' : 'var(--cb-text-tertiary)',
                  }}
                  aria-pressed={i18n.language === lang}
                  aria-label={`${t('common.language')} ${lang}`}
                >
                  {lang === 'pt-BR' ? 'PT' : lang === 'en-US' ? 'EN' : '中'}
                </button>
              ))}
            </div>

            <button
              className="cb-theme-toggle"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>

            <button
              className="cb-btn cb-btn-primary cb-btn-sm cb-btn-pill"
              onClick={onConnect}
            >
              ◆ {t('auth.connect_wallet')}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section id="hero" style={{ padding: '5rem 0 4rem' }}>
        <div className="cb-container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4rem', alignItems: 'center' }}>

            {/* Conteúdo textual */}
            <div style={{ maxWidth: '36rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--cb-text-secondary)' }}>
                <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
                {t('landing.online_count')}
              </div>

              <h1 style={{ fontFamily: 'var(--font-family-display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.5rem' }}>
                {t('landing.hero_title')}{' '}
                <span style={{ background: 'linear-gradient(135deg, var(--color-accent-300), var(--color-accent-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {t('landing.hero_highlight')}
                </span>
              </h1>

              <p style={{ fontSize: '1.125rem', color: 'var(--cb-text-secondary)', lineHeight: 1.6, marginBottom: '2.5rem' }}>
                {t('landing.hero_desc')}
              </p>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  className="cb-btn cb-btn-primary cb-btn-xl cb-btn-pill"
                  onClick={onConnect}
                >
                  ◆ {t('landing.hero_cta')}
                </button>
                <a href="#como" className="cb-btn cb-btn-ghost cb-btn-lg">
                  {t('landing.hero_how_it_works')}
                </a>
              </div>

              {/* Trust badges */}
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '2rem', fontSize: '0.8rem', color: 'var(--cb-text-tertiary)' }}>
                {[
                  ['⚡', t('landing.trust_instant')],
                  ['🛡', t('landing.trust_fair')],
                  ['◆', t('landing.trust_wax')],
                  ['⚖', t('landing.trust_compliance')],
                ].map(([icon, label]) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Bola animada */}
            <div aria-hidden="true">
              <HeroBall />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section id="stats" style={{ padding: '3rem 0', background: 'var(--cb-bg-elevated)', borderTop: '1px solid var(--cb-border-subtle)', borderBottom: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '2rem' }}>
            {STATS.map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-family-display)', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--cb-accent)', lineHeight: 1 }}>
                  {stat.value}
                  {stat.unit && <span style={{ fontSize: '1rem', fontWeight: 700, marginLeft: '0.25rem', color: 'var(--cb-text-secondary)' }}>{stat.unit}</span>}
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cb-text-primary)', marginTop: '0.5rem' }}>{stat.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--cb-text-tertiary)', marginTop: '0.25rem' }}>{stat.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Por que CryptoBingo ── */}
      <section id="como" style={{ padding: '5rem 0' }}>
        <div className="cb-container">
          <h2 style={{ fontFamily: 'var(--font-family-display)', fontSize: '2rem', fontWeight: 700, textAlign: 'center', marginBottom: '3rem', letterSpacing: '-0.02em' }}>
            {t('landing.why_title')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1.5rem' }}>
            {WHY_ITEMS.map(item => (
              <div key={item.title} className="cb-card" style={{ padding: '1.75rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{item.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-family-display)', fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--cb-text-primary)' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--cb-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sponsors ── */}
      <section id="sponsors" style={{ padding: '4rem 0', background: 'var(--cb-bg-elevated)', borderTop: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container" style={{ textAlign: 'center' }}>
          <span className="cb-badge-brand" style={{ marginBottom: '1rem', display: 'inline-block' }}>
            {t('landing.b2b_badge')}
          </span>
          <h2 style={{ fontFamily: 'var(--font-family-display)', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem', letterSpacing: '-0.02em' }}>
            {t('landing.b2b_title')}
          </h2>
          <p style={{ color: 'var(--cb-text-secondary)', maxWidth: '32rem', margin: '0 auto 2rem', lineHeight: 1.6 }}>
            {t('landing.b2b_desc')}
          </p>
          <button className="cb-btn cb-btn-outline cb-btn-lg" onClick={onConnect}>
            {t('landing.b2b_cta')}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: '2rem 0', borderTop: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
          <span className="cb-logo" style={{ fontSize: '1rem' }}>Crypto<span>Bingo</span></span>
          <span>
            {t('landing.footer_copyright', { year: new Date().getFullYear() })}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.65rem' }}>
              {t('landing.footer_tagline')}
            </span>
            {import.meta.env.DEV && devAccounts && onDevLogin && (
              <div ref={devRef} style={{ position: 'relative' }}>
                <button
                  className="cb-btn cb-btn-ghost cb-btn-sm"
                  onClick={() => setDevOpen(o => !o)}
                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', color: 'var(--cb-text-tertiary)' }}
                >
                  🧪 {t('auth.dev_login')} ▾
                </button>
                {devOpen && (
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', right: 0, marginBottom: '0.25rem',
                      background: 'var(--cb-bg-elevated)', border: '1px solid var(--cb-border-subtle)',
                      borderRadius: '0.5rem', padding: '0.25rem', minWidth: '11rem',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 300,
                    }}
                  >
                    {devAccounts.map(acc => (
                      <button
                        key={acc.actor}
                        className="cb-btn cb-btn-ghost"
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', fontSize: '0.7rem',
                          padding: '0.35rem 0.6rem', whiteSpace: 'nowrap',
                        }}
                        onClick={() => { setDevOpen(false); onDevLogin(acc.actor, acc.key); }}
                      >
                        <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--cb-brand)', marginRight: '0.4rem' }}>◆</span>
                        <strong>{acc.label}</strong>
                        <span style={{ fontSize: '0.6rem', color: 'var(--cb-text-tertiary)', marginLeft: '0.4rem' }}>{acc.actor}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>

    </div>
  );
}
