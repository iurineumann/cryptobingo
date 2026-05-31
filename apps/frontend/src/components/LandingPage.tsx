import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRooms, fetchRtpReport, fetchGamesHistory } from '../services/api';
import type { EnrichedRoom, RtpReport, GameHistoryEntry } from '../services/api';
import Logo from './Logo';

interface DevAccount {
  actor: string;
  key:   string;
  label: string;
}

interface LandingPageProps {
  onConnect:    () => void;
  devAccounts:  DevAccount[] | null;
  onDevLogin:   ((actor: string, key: string) => void) | null;
  theme:        string;
  onToggleTheme: () => void;
}

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
      <div className="gr-ball-halo" />
      <div ref={ballRef} className="gr-ball-hero gr-drop">
        <div className="ball-surface" />
        <span className="ball-letter">{col}</span>
        <span className="ball-number">{n}</span>
      </div>
    </div>
  );
}

const ROOM_STATUS_CLASS: Record<string, string> = {
  inactive: 'cb-status-archived',
  active:   'cb-status-funding',
  paused:   'cb-status-drawing',
  closed:   'cb-status-aborted',
};

const ROOM_STATUS_LABEL: Record<string, string> = {
  inactive: 'Inativa',
  active:   'Ativa',
  paused:   'Pausada',
  closed:   'Fechada',
};

function fmtQuantity(qty: string) {
  const parts = qty.split(' ');
  if (parts.length !== 2) return qty;
  const num = parseFloat(parts[0]);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M ${parts[1]}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K ${parts[1]}`;
  return qty;
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.', ',')}`;
  return n.toLocaleString('pt-BR');
}

export default function LandingPage({ onConnect, devAccounts, onDevLogin, theme, onToggleTheme }: LandingPageProps) {
  const { t, i18n } = useTranslation();

  const [rooms, setRooms] = useState<EnrichedRoom[]>([]);
  const [rtpReport, setRtpReport] = useState<RtpReport | null>(null);
  const [gamesHistory, setGamesHistory] = useState<GameHistoryEntry[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);

  const activeRoomsCount = rooms.filter(r => r.status === 'active').length;

  useEffect(() => {
    fetchRooms()
      .then(data => setRooms(data.rooms))
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, []);

  useEffect(() => {
    Promise.all([
      fetchRtpReport(30).catch(() => null),
      fetchGamesHistory(5).catch(() => ({ games: [] })),
    ])
      .then(([rtp, games]) => {
        if (rtp) setRtpReport(rtp);
        setGamesHistory(games.games);
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, []);

  const totalPrizes = rtpReport?.total_paid_out ?? 0;
  const avgRtp      = rtpReport?.avg_rtp_display ?? null;
  const gamesCount  = gamesHistory.length > 0 ? gamesHistory.length : null;

  const STATS = [
    {
      value: totalPrizes > 0 ? formatLargeNumber(totalPrizes) : loadingStats ? '…' : '0',
      unit:  rtpReport?.currency ?? '',
      label: t('landing.stats_prizes'),
      hint:  t('landing.stats_prizes_hint'),
    },
    {
      value: avgRtp ?? (loadingStats ? '…' : '—'),
      unit:  '%',
      label: t('landing.stats_rtp'),
      hint:  t('landing.stats_rtp_hint'),
    },
    {
      value: gamesCount !== null ? `${gamesCount}` : loadingStats ? '…' : '—',
      unit:  '',
      label: t('landing.stats_compliance'),
      hint:  t('landing.stats_compliance_hint'),
    },
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
    <div className="bg-[--cb-bg-base] text-[--cb-text-primary]" style={{ minHeight: '100dvh' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50" style={{ background: 'color-mix(in srgb, var(--cb-bg-base) 90%, transparent)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container flex items-center justify-between gap-4" style={{ height: '4rem' }}>
          <Logo
            variant="horizontal"
            height={64}            
          />

          <nav className="flex gap-6 text-sm text-[--cb-text-secondary]" aria-label={t('landing.nav_aria')}>
            <a href="#rooms" className="no-underline text-inherit">{t('nav.lobby')}</a>
            <a href="#stats" className="no-underline text-inherit">{t('nav.audit')}</a>
            <a href="#sponsors" className="no-underline text-inherit">{t('nav.sponsors')}</a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['pt-BR', 'en-US', 'zh-CN'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`cb-btn cb-btn-ghost cb-btn-sm ${i18n.language === lang ? 'font-bold text-[--cb-brand]' : 'text-[--cb-text-tertiary]'}`}
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

            <button className="cb-btn cb-btn-primary cb-btn-sm cb-btn-pill" onClick={onConnect}>
              ◆ {t('auth.connect_wallet')}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="py-20 lg:py-24">
        <div className="cb-container">
          <div className="grid lg:grid-cols-[1fr_auto] gap-16 items-center">
            <div className="max-w-[36rem]">
              <div className="inline-flex items-center gap-2 mb-6 text-sm text-[--cb-text-secondary]">
                <span className="cb-status-dot cb-status-dot-live" />
                {activeRoomsCount > 0
                  ? `${activeRoomsCount} ${t('room.players_online')}`
                  : t('landing.online_count')}
              </div>

              <h1 className="font-display font-extrabold leading-tight tracking-tight mb-6 text-[clamp(2rem,5vw,3.5rem)]">
                {t('landing.hero_title')}{' '}
                <span className="bg-gradient-to-r from-[--color-accent-300] to-[--color-accent-500] bg-clip-text text-transparent">
                  {t('landing.hero_highlight')}
                </span>
              </h1>

              <p className="text-lg text-[--cb-text-secondary] leading-relaxed mb-10">
                {t('landing.hero_desc')}
              </p>

              <div className="flex gap-4 flex-wrap">
                <button className="cb-btn cb-btn-primary cb-btn-xl cb-btn-pill" onClick={onConnect}>
                  ◆ {t('landing.hero_cta')}
                </button>
                <a href="#como" className="cb-btn cb-btn-ghost cb-btn-lg no-underline">
                  {t('landing.hero_how_it_works')}
                </a>
              </div>

              <div className="flex gap-6 flex-wrap mt-8 text-xs text-[--cb-text-tertiary]">
                {([
                  ['⚡', t('landing.trust_instant')],
                  ['🛡', t('landing.trust_fair')],
                  ['◆', t('landing.trust_wax')],
                  ['⚖', t('landing.trust_compliance')],
                ] as const).map(([icon, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <span>{icon}</span>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              <HeroBall />
            </div>
          </div>
        </div>
      </section>

      {/* ── Salas ao Vivo ── */}
      <section id="rooms" className="py-16 bg-[--cb-bg-elevated] border-t border-b border-[--cb-border-subtle]">
        <div className="cb-container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold">
                🎮 {t('landing_lobby')}
              </h2>
              {activeRoomsCount > 0 && (
                <p className="text-sm text-[--cb-text-tertiary] mt-1">
                  {activeRoomsCount} sala{activeRoomsCount !== 1 ? 's' : ''} ativa{activeRoomsCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button className="cb-btn cb-btn-primary cb-btn-sm cb-btn-pill" onClick={onConnect}>
              ◆ {t('auth.connect_wallet')}
            </button>
          </div>

          {loadingRooms ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[--cb-text-tertiary]">
              <span className="cb-spinner" style={{ width: '2.5rem', height: '2.5rem', borderWidth: '3px' }} />
              <p className="text-sm">{t('common.loading')}</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[--cb-text-tertiary]">
              <span className="text-5xl">🎱</span>
              <p className="text-base font-medium">{t('game.waiting')}</p>
              <p className="text-sm">{t('game_room.tickets_empty_default')}</p>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' }}>
              {rooms.map(room => {
                const statusCls = ROOM_STATUS_CLASS[room.status] ?? 'cb-badge cb-badge-neutral';
                const statusLbl = ROOM_STATUS_LABEL[room.status] ?? room.status;
                const meta      = room.metadata;

                return (
                  <article key={room.room_id} className="cb-card flex flex-col gap-3" aria-label={`Sala ${meta?.name ?? room.room_id}`}>
                    <header className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-[--cb-text-primary] font-display">
                        {meta?.name ?? `Sala #${room.room_id}`}
                      </h3>
                      <span className={statusCls}>{statusLbl}</span>
                    </header>

                    {meta?.description && (
                      <p className="text-xs text-[--cb-text-tertiary] leading-relaxed line-clamp-2">
                        {meta.description}
                      </p>
                    )}

                    <dl className="space-y-1.5 text-sm mt-auto">
                      <div className="flex justify-between">
                        <dt className="text-[--cb-text-tertiary]">{t('game.ticket_price')}</dt>
                        <dd className="font-mono font-medium text-[--cb-text-primary]">
                          {fmtQuantity(room.ticket_price_default?.quantity ?? room.ticket_price_min?.quantity ?? '')}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[--cb-text-tertiary]">{t('room.sponsor_room')}</dt>
                        <dd className="font-mono text-xs text-[--cb-text-secondary]">
                          {room.sponsor_room ? room.sponsor : t('room.system_room')}
                        </dd>
                      </div>
                    </dl>

                    <button
                      className="cb-btn cb-btn-outline mt-2 text-sm"
                      onClick={onConnect}
                    >
                      ◆ {t('room.enter')}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section id="stats" className="py-12 bg-[--cb-bg-elevated] border-t border-b border-[--cb-border-subtle]">
        <div className="cb-container">
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
            {STATS.map(stat => (
              <div key={stat.label} className="text-center">
                <div className="font-display font-extrabold tracking-tight text-[--cb-accent] leading-none text-[clamp(1.8rem,3vw,2.5rem)]">
                  {stat.value}
                  {stat.unit && <span className="text-base font-bold ml-1 text-[--cb-text-secondary]">{stat.unit}</span>}
                </div>
                <div className="text-sm font-semibold text-[--cb-text-primary] mt-2">{stat.label}</div>
                <div className="text-[0.7rem] text-[--cb-text-tertiary] mt-1">{stat.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Por que CryptoBingo ── */}
      <section id="como" className="py-20">
        <div className="cb-container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12 tracking-tight">
            {t('landing.why_title')}
          </h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
            {WHY_ITEMS.map(item => (
              <div key={item.title} className="cb-card p-7">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-display text-lg font-bold mb-3 text-[--cb-text-primary]">{item.title}</h3>
                <p className="text-sm text-[--cb-text-secondary] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sponsors ── */}
      <section id="sponsors" className="py-16 bg-[--cb-bg-elevated] border-t border-[--cb-border-subtle]">
        <div className="cb-container text-center">
          <span className="cb-badge-brand inline-block mb-4">{t('landing.b2b_badge')}</span>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4 tracking-tight">{t('landing.b2b_title')}</h2>
          <p className="text-[--cb-text-secondary] max-w-[32rem] mx-auto mb-8 leading-relaxed">
            {t('landing.b2b_desc')}
          </p>
          <button className="cb-btn cb-btn-outline cb-btn-lg" onClick={onConnect}>
            {t('landing.b2b_cta')}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-[--cb-border-subtle]">
        <div className="cb-container flex justify-between items-center flex-wrap gap-4 text-xs text-[--cb-text-tertiary]">
          <span className="cb-logo text-base">Crypto<span>Bingo</span></span>
          <span>{t('landing.footer_copyright', { year: new Date().getFullYear() })}</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[0.65rem]">{t('landing.footer_tagline')}</span>
            {import.meta.env.DEV && devAccounts && onDevLogin && (
              <div ref={devRef} className="relative">
                <button
                  className="cb-btn cb-btn-ghost cb-btn-sm"
                  onClick={() => setDevOpen(o => !o)}
                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', color: 'var(--cb-text-tertiary)' }}
                >
                  🧪 {t('auth.dev_login')} ▾
                </button>
                {devOpen && (
                  <div className="absolute bottom-full right-0 mb-1 bg-[--cb-bg-elevated] border border-[--cb-border-subtle] rounded-lg p-1 min-w-[11rem] shadow-lg z-50">
                    {devAccounts.map(acc => (
                      <button
                        key={acc.actor}
                        className="cb-btn cb-btn-ghost block w-full text-left text-[0.7rem] px-2.5 py-1.5 whitespace-nowrap"
                        onClick={() => { setDevOpen(false); onDevLogin(acc.actor, acc.key); }}
                      >
                        <span className="font-mono text-[--cb-brand] mr-1.5">◆</span>
                        <strong>{acc.label}</strong>
                        <span className="text-[0.6rem] text-[--cb-text-tertiary] ml-1.5">{acc.actor}</span>
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
