import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchRooms, fetchRtpReport, fetchGamesHistory } from '../services/api';
import { PaletteSelector } from './ui/PaletteSelector';
import type { EnrichedRoom, RtpReport, GameHistoryEntry } from '../services/api';
import { FUNDING_WINDOW_SEC, type BlockchainGameState } from '@cryptobingo/shared-types';
import { fetchTableRows } from '../utils/rpc';
import { isWithinSlowReveal, resolveDisplayStatus } from '../utils/gameStatus';
import Logo from './Logo';
import { Button } from '@/components/ui/button';
import Seo from './Seo';
import { organizationSchema, webApplicationSchema } from '../lib/jsonld';

interface DevAccount {
  actor: string;
  key:   string;
  label: string;
}

interface LandingPageProps {
  onConnect:     () => void;
  devAccounts:   DevAccount[] | null;
  onDevLogin:    ((actor: string, key: string) => void) | null;
  theme:         string;
  onToggleTheme: () => void;
  authError?:    string | null;
  loading?:      boolean;
  onRetryLogin?: () => void;
}

const CONTRACT       = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';
const AUTO_LOCK_SEC  = FUNDING_WINDOW_SEC;

const DEMO_SEQ = [42, 17, 64, 8, 33, 71, 51, 22];

const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)', I: 'var(--color-bingo-i)', N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)', O: 'var(--color-bingo-o)',
};

function getCol(n: number) {
  if (n <= 15) return 'B'; if (n <= 30) return 'I'; if (n <= 45) return 'N';
  if (n <= 60) return 'G'; return 'O';
}

// Mapeia o label do perfil dev → role canônica de E2E (ADR-017). A ordem dos
// devAccounts em App.tsx é estável; o label é a chave de mapeamento confiável.
function devRoleFromLabel(label: string): string {
  switch (label) {
    case 'Jogador 1':       return 'player';
    case 'Jogador 2':       return 'player2';
    case 'Game Admin':      return 'admin';
    case 'Contract Admin':  return 'contract-admin';
    case 'Sponsor':         return 'sponsor';
    default:                return label.toLowerCase().replace(/\s+/g, '-');
  }
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function HeroBall() {
  const [idx, setIdx] = useState(0);
  const ballRef       = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => setIdx(x => (x + 1) % DEMO_SEQ.length), 2200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!ballRef.current) return;
    const el = ballRef.current;
    el.classList.remove('gr-drop'); void el.offsetWidth; el.classList.add('gr-drop');
  }, [idx]);
  const n = DEMO_SEQ[idx], col = getCol(n), color = BINGO_COLORS[col];
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

const STATUS_LABEL: Record<string, string> = {
  inactive: 'Inativa', active: 'Ativa', paused: 'Pausada', closed: 'Fechada',
};

function fmtQuantity(qty: string) {
  const parts = qty.split(' '); if (parts.length !== 2) return qty;
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

export default function LandingPage({ onConnect, devAccounts, onDevLogin, theme, onToggleTheme, authError, loading, onRetryLogin }: Readonly<LandingPageProps>) {
  const { t, i18n } = useTranslation();
  const navigate    = useNavigate();

  const [rooms,        setRooms]        = useState<EnrichedRoom[]>([]);
  const [currentGames, setCurrentGames] = useState<Record<string, BlockchainGameState>>({});
  const [rtpReport,    setRtpReport]    = useState<RtpReport | null>(null);
  const [gamesHistory, setGamesHistory] = useState<GameHistoryEntry[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [now,          setNow]          = useState(Date.now());

  const activeRoomsCount = rooms.filter(r => r.status === 'active').length;

  // Tick 1s para countdowns ao vivo
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Carrega salas
  useEffect(() => {
    fetchRooms()
      .then(data => setRooms(data.rooms))
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, []);

  // Carrega estado ao vivo das partidas ativas (após rooms carregadas)
  useEffect(() => {
    const activeWithGame = rooms.filter(
      r => r.status === 'active' && r.current_game_id && String(r.current_game_id) !== '0'
    );
    if (activeWithGame.length === 0) return;

    Promise.allSettled(
      activeWithGame.map(r =>
        fetchTableRows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          lower_bound: String(r.current_game_id),
          upper_bound: String(r.current_game_id),
          limit: 1,
        }, null)
      )
    ).then(results => {
      const map: Record<string, BlockchainGameState> = {};
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value.rows.length > 0) {
          const g = res.value.rows[0] as BlockchainGameState;
          map[String(activeWithGame[i].room_id)] = g;
        }
      });
      setCurrentGames(map);
    }).catch(() => {});
  }, [rooms]);

  // Stats de compliance
  useEffect(() => {
    Promise.all([
      fetchRtpReport(30).catch(() => null),
      fetchGamesHistory(5).catch(() => ({ games: [] })),
    ]).then(([rtp, games]) => {
      if (rtp) setRtpReport(rtp);
      setGamesHistory(games.games);
    }).catch(() => {}).finally(() => setLoadingStats(false));
  }, []);

  const totalPrizes = rtpReport?.total_paid_out ?? 0;
  const avgRtp      = rtpReport?.avg_rtp_display ?? null;
  const gamesCount  = gamesHistory.length > 0 ? gamesHistory.length : null;

  const STATS = [
    { value: totalPrizes > 0 ? formatLargeNumber(totalPrizes) : loadingStats ? '…' : '0', unit: rtpReport?.currency ?? '', label: t('landing.stats_prizes'), hint: t('landing.stats_prizes_hint') },
    { value: avgRtp ?? (loadingStats ? '…' : '—'), unit: '%', label: t('landing.stats_rtp'), hint: t('landing.stats_rtp_hint') },
    { value: gamesCount !== null ? `${gamesCount}` : loadingStats ? '…' : '—', unit: '', label: t('landing.stats_compliance'), hint: t('landing.stats_compliance_hint') },
  ];

  const WHY_ITEMS = [
    { icon: '⚡', title: t('landing.why_instant_title'), desc: t('landing.why_instant_desc') },
    { icon: '🛡', title: t('landing.why_fair_title'), desc: t('landing.why_fair_desc') },
    { icon: '◆', title: t('landing.why_multitoken_title'), desc: t('landing.why_multitoken_desc') },
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

  // ── Helpers de status por sala ──────────────────────────────────────────────
  const gameDisplayStatus = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [roomId, g] of Object.entries(currentGames)) {
      map[roomId] = resolveDisplayStatus(g);
    }
    return map;
  }, [currentGames]);

  function getTicketsSold(roomId: string): number | null {
    const g = currentGames[String(roomId)];
    if (!g) return null;
    const pool  = parseFloat(g.total_wagered?.quantity?.split(' ')[0] ?? '0');
    const price = parseFloat(g.ticket_price?.quantity?.split(' ')[0] ?? '0');
    if (pool <= 0 || price <= 0) return null;
    return Math.round(pool / price);
  }

  function getCountdown(roomId: string): string {
    const g = currentGames[String(roomId)];
    if (!g || g.status !== 'funding') return '';
    // ADR-056: funded_at do contrato é em SEGUNDOS; converter para ms.
    // Fallback: game_id é Date.now() em ms (timestamp de criação).
    const t0 = (g.funded_at && g.funded_at > 0 ? g.funded_at * 1000 : Number(g.game_id));
    const closeAt = t0 + AUTO_LOCK_SEC * 1000;
    const diff    = closeAt - now;
    if (diff <= 0) return '';
    return fmtCountdown(diff);
  }

  const SOCIAL_ICONS: Record<string, React.JSX.Element> = {
    telegram: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
    discord: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>,
    x: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
    github: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>,
  };

  const SOCIALS = [
    { key: 'Telegram', url: 'https://t.me/cryptobingo_bet', icon: 'telegram' },
    { key: 'Discord', url: 'https://discord.gg/EYYhdRWUnm', icon: 'discord' },
    { key: 'X/Twitter', url: 'https://x.com/CryptoBingo_Bet', icon: 'x' },
    { key: 'GitHub', url: 'https://github.com/iurineumann/cryptobingo', icon: 'github' },
  ] as const;

  return (
    <>
    <Seo
      jsonLd={[organizationSchema(), webApplicationSchema()]}
    />
    <div className="bg-[--cb-bg-base] text-[--cb-text-primary]" style={{ minHeight: '100dvh' }}>

      {authError && (
        <div className="cb-alert cb-alert-error" style={{ margin: '0 auto', maxWidth: '48rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{authError}</span>
          {onRetryLogin && (
            <Button variant="outline" size="sm" onClick={onRetryLogin} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t('auth.retry') ?? 'Tentar novamente'}
            </Button>
          )}
        </div>
      )}

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50" style={{ background: 'color-mix(in srgb, var(--cb-bg-base) 90%, transparent)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container flex items-center justify-between gap-4" style={{ height: '4rem' }}>
          <Logo variant="horizontal" height={64} />
          <nav className="flex gap-6 text-sm text-[--cb-text-secondary]" aria-label={t('landing.nav_aria')} data-testid="landing-nav">
            <a href="#rooms" className="no-underline text-inherit">{t('nav.lobby')}</a>
            <a href="#stats" className="no-underline text-inherit">{t('nav.audit')}</a>
            <div className="site-tab-dropdown" style={{ display: 'inline-flex' }}>
              <button
                className="no-underline text-inherit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit', padding: 0 }}
                data-testid="nav-explore-landing"
                aria-haspopup="true"
              >
                {t('nav.explore') ?? 'Explorar'} ▾
              </button>
              <div className="site-dropdown-menu" data-testid="nav-explore-menu-landing">
                <a href="/how-it-works" className="site-dropdown-item" onClick={(e) => { e.preventDefault(); navigate('/how-it-works'); }}>{t('nav.how_it_works')}</a>
                <a href="/sponsors"     className="site-dropdown-item" onClick={(e) => { e.preventDefault(); navigate('/sponsors'); }}>{t('nav.sponsors')}</a>
                <a href="/tutorials"    className="site-dropdown-item" onClick={(e) => { e.preventDefault(); navigate('/tutorials'); }}>{t('nav.tutorials')}</a>
                <a href="/faq"          className="site-dropdown-item" onClick={(e) => { e.preventDefault(); navigate('/faq'); }}>{t('nav.faq')}</a>
                <a href="/news"         className="site-dropdown-item" onClick={(e) => { e.preventDefault(); navigate('/news'); }}>{t('nav.news')}</a>
              </div>
            </div>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" data-testid="lang-select">
              {(['pt-BR', 'en-US', 'zh-CN'] as const).map(lang => (
                <Button key={lang} variant="ghost" size="sm" onClick={() => i18n.changeLanguage(lang)}
                  data-testid={`lang-opt-${lang === 'pt-BR' ? 'pt' : lang === 'en-US' ? 'en' : 'zh'}`}
                  className={i18n.language === lang ? 'font-bold text-[--cb-brand]' : 'text-[--cb-text-tertiary]'}
                  aria-pressed={i18n.language === lang} aria-label={`${t('common.language')} ${lang}`}>
                  {lang === 'pt-BR' ? 'PT' : lang === 'en-US' ? 'EN' : '中'}
                </Button>
              ))}
            </div>
            <PaletteSelector />
            <button className="cb-theme-toggle" onClick={onToggleTheme}
              aria-label={theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}>
              {theme === 'dark' ? '☾' : '☀'}
            </button>
            <Button variant="default" size="sm" className="rounded-full" onClick={onConnect}>
              ◆ {t('auth.connect_wallet')}
            </Button>
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
              <p className="text-lg text-[--cb-text-secondary] leading-relaxed mb-10">{t('landing.hero_desc')}</p>
              <div className="flex gap-4 flex-wrap">
                <Button variant="default" size="lg" className="rounded-full" onClick={onConnect} data-testid="landing-connect" disabled={loading}>
                  {loading ? <><span className="cb-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> {t('common.loading')}</> : <>◆ {t('landing.hero_cta')}</>}
                </Button>
                <a href="#como" className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-md text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground no-underline">
                  {t('landing.hero_how_it_works')}
                </a>
              </div>
              <div className="flex gap-6 flex-wrap mt-8 text-xs text-[--cb-text-tertiary]">
                {(['⚡', '🛡', '◆', '⚖'] as const).map((icon, i) => {
                  const label = [t('landing.trust_instant'), t('landing.trust_fair'), t('landing.trust_wax'), t('landing.trust_compliance')][i];
                  return <span key={i} className="inline-flex items-center gap-1.5"><span>{icon}</span>{label}</span>;
                })}
              </div>
            </div>
            <div className="hidden lg:block"><HeroBall /></div>
          </div>
        </div>
      </section>

      {/* ── Salas ao Vivo ── */}
      <section id="rooms" className="py-16 bg-[--cb-bg-elevated] border-t border-b border-[--cb-border-subtle]">
        <div className="cb-container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold">🎮 {t('landing_lobby')}</h2>
              {activeRoomsCount > 0 && (
                <p className="text-sm text-[--cb-text-tertiary] mt-1">
                  {activeRoomsCount} sala{activeRoomsCount !== 1 ? 's' : ''} ativa{activeRoomsCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <Button variant="default" size="sm" className="rounded-full" onClick={onConnect}>
              ◆ {t('auth.connect_wallet')}
            </Button>
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
                const meta         = room.metadata;
                const roomId       = String(room.room_id);
                const gameStatus   = gameDisplayStatus[roomId];
                const ticketsSold  = getTicketsSold(roomId);
                const countdown    = getCountdown(roomId);
                const isDrawing    = gameStatus === 'drawing';
                const isFunding    = gameStatus === 'funding';
                const hasNftDrop   = meta?.drops?.some(d => d.template_id != null) ?? false;
                const hasTokenDrop = meta?.drops?.some(d => d.amount != null)       ?? false;

                return (
                  <article key={roomId} className="cb-card flex flex-col gap-3" aria-label={`Sala ${meta?.name ?? roomId}`}>
                    <header className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-[--cb-text-primary] font-display">
                        {meta?.name ?? `Sala #${roomId}`}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* Status da partida atual (slow-reveal aware) */}
                        {gameStatus && (
                          <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary]">
                            {gameStatus}
                          </span>
                        )}
                        {/* Badge LIVE animado */}
                        {isDrawing && (
                          <span className="gr-live" style={{ fontSize: '0.62rem' }}>{t('game_room.badge_live')}</span>
                        )}
                        {/* Countdown de fechamento */}
                        {isFunding && countdown && (
                          <span className="text-xs font-mono font-bold text-[--cb-accent]">{countdown}</span>
                        )}
                        {/* Status da sala se não há partida ativa */}
                        {!gameStatus && (
                          <span className="text-xs text-[--cb-text-tertiary]">{STATUS_LABEL[room.status] ?? room.status}</span>
                        )}
                        {/* Badges de drop */}
                        {hasNftDrop && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgb(147 51 234 / 0.12)', color: 'rgb(167 139 250)', border: '1px solid rgb(147 51 234 / 0.3)' }}>
                            🎁 NFT
                          </span>
                        )}
                        {hasTokenDrop && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgb(234 179 8 / 0.12)', color: 'rgb(253 224 71)', border: '1px solid rgb(234 179 8 / 0.3)' }}>
                            💰 Token
                          </span>
                        )}
                      </div>
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
                      {/* Cartelas vendidas na partida atual */}
                      {ticketsSold != null && ticketsSold > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-[--cb-text-tertiary]">🎫 {t('replay.col_tickets_sold')}</dt>
                          <dd className="font-mono font-medium text-[--cb-text-primary]">{ticketsSold}</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-[--cb-text-tertiary]">{t('room.sponsor_room')}</dt>
                        <dd className="font-mono text-xs text-[--cb-text-secondary]">
                          {room.sponsor_room ? room.sponsor : t('room.system_room')}
                        </dd>
                      </div>
                    </dl>

                    {/* CTAs: Entrar (abre auth) + Histórico (público) */}
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" className="flex-1 text-sm" onClick={onConnect}>
                        ◆ {t('room.enter')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t('replay.room_history_title')}
                        aria-label={`Histórico da sala ${meta?.name ?? roomId}`}
                        onClick={() => navigate(`/room/${roomId}/history`)}
                        className="px-3"
                      >
                        📋
                      </Button>
                    </div>
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
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12 tracking-tight">{t('landing.why_title')}</h2>
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

      {/* ── Join the Community ── */}
      <section id="community" className="py-16 border-t border-[--cb-border-subtle]">
        <div className="cb-container text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4 tracking-tight">{t('landing.community_title') ?? 'Join the Community'}</h2>
          <p className="text-[--cb-text-secondary] max-w-[32rem] mx-auto mb-8 leading-relaxed">{t('landing.community_desc') ?? 'Stay updated, report bugs, and connect with fellow Bingo players.'}</p>
          <div className="flex justify-center gap-4 flex-wrap">
            {SOCIALS.map(s => (
              <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 cb-btn cb-btn-outline cb-btn-sm"
                title={s.key}>
                {SOCIAL_ICONS[s.icon]}
                <span>{s.key}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sponsors ── */}
      <section id="sponsors" className="py-16 bg-[--cb-bg-elevated] border-t border-[--cb-border-subtle]">
        <div className="cb-container text-center">
          <span className="cb-badge-brand inline-block mb-4">{t('landing.b2b_badge')}</span>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4 tracking-tight">{t('landing.b2b_title')}</h2>
          <p className="text-[--cb-text-secondary] max-w-[32rem] mx-auto mb-8 leading-relaxed">{t('landing.b2b_desc')}</p>
          <Button variant="outline" size="lg" onClick={onConnect}>{t('landing.b2b_cta')}</Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-[--cb-border-subtle]">
        <div className="cb-container flex justify-between items-center flex-wrap gap-4 text-xs text-[--cb-text-tertiary]">
          <div className="flex items-center gap-4">
            <span className="cb-logo text-base">Crypto<span>Bingo</span></span>
            <span className="font-mono text-[0.65rem]">{t('landing.footer_tagline')}</span>
          </div>
          <div className="flex items-center gap-3">
            {SOCIALS.map(s => (
              <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                className="text-[--cb-text-tertiary] hover:text-[--cb-accent] transition-colors"
                title={s.key}>
                {SOCIAL_ICONS[s.icon]}
              </a>
            ))}
          </div>
          <span>{t('landing.footer_copyright', { year: new Date().getFullYear() })}</span>
            {import.meta.env.DEV && devAccounts && onDevLogin && (
              <div ref={devRef} className="relative">
                <Button variant="ghost" size="sm" onClick={() => setDevOpen(o => !o)}
                  data-testid="dev-login-toggle"
                  className="text-[0.65rem] text-[--cb-text-tertiary] px-2 py-1 h-auto">
                  🧪 {t('auth.dev_login')} ▾
                </Button>
                {devOpen && (
                  <div className="absolute bottom-full right-0 mb-1 bg-[--cb-bg-elevated] border border-[--cb-border-subtle] rounded-lg p-1 min-w-[11rem] shadow-lg z-50">
                    {devAccounts.map(acc => (
                      <Button key={acc.actor} variant="ghost" className="block w-full text-left text-[0.7rem] h-auto px-2.5 py-1.5 whitespace-nowrap justify-start"
                        data-testid={`dev-login-${devRoleFromLabel(acc.label)}`}
                        onClick={() => { setDevOpen(false); onDevLogin(acc.actor, acc.key); }}>
                        <span className="font-mono text-[--cb-brand] mr-1.5">◆</span>
                        <strong>{acc.label}</strong>
                        <span className="text-[0.6rem] text-[--cb-text-tertiary] ml-1.5">{acc.actor}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      </footer>

    </div>
    </>
  );
}
