import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchRooms, fetchRtpReport, fetchGamesHistory } from '../services/api';
import type { EnrichedRoom, RtpReport, GameHistoryEntry } from '../services/api';
import type { BlockchainGameState } from '@cryptobingo/shared-types';
import { fetchTableRows } from '../utils/rpc';
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

const CONTRACT       = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';
const AUTO_LOCK_SEC  = 60;
const REVEAL_INTERVAL_MS = 3000;
const SLOW_REVEAL_WINDOW = AUTO_LOCK_SEC * 1000 + 75 * REVEAL_INTERVAL_MS;

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

function isWithinSlowReveal(gameId: string): boolean {
  return Date.now() - Number(gameId) < SLOW_REVEAL_WINDOW;
}

function resolveDisplayStatus(g: BlockchainGameState): string {
  if (g.status === 'drawn' || (g.status === 'archived' && isWithinSlowReveal(g.game_id))) return 'drawing';
  return g.status;
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

const STATUS_EMOJI: Record<string, string> = {
  funding: '🟢', locked: '🔒', drawing: '🎲', drawn: '✅', archived: '📁', aborted: '❌', created: '🕐',
};
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

export default function LandingPage({ onConnect, devAccounts, onDevLogin, theme, onToggleTheme }: LandingPageProps) {
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
    const closeAt = Number(g.game_id) + AUTO_LOCK_SEC * 1000;
    const diff    = closeAt - now;
    if (diff <= 0) return '';
    return fmtCountdown(diff);
  }

  return (
    <div className="bg-[--cb-bg-base] text-[--cb-text-primary]" style={{ minHeight: '100dvh' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50" style={{ background: 'color-mix(in srgb, var(--cb-bg-base) 90%, transparent)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--cb-border-subtle)' }}>
        <div className="cb-container flex items-center justify-between gap-4" style={{ height: '4rem' }}>
          <Logo variant="horizontal" height={64} />
          <nav className="flex gap-6 text-sm text-[--cb-text-secondary]" aria-label={t('landing.nav_aria')}>
            <a href="#rooms" className="no-underline text-inherit">{t('nav.lobby')}</a>
            <a href="#stats" className="no-underline text-inherit">{t('nav.audit')}</a>
            <a href="#sponsors" className="no-underline text-inherit">{t('nav.sponsors')}</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" data-testid="lang-select">
              {(['pt-BR', 'en-US', 'zh-CN'] as const).map(lang => (
                <button key={lang} onClick={() => i18n.changeLanguage(lang)}
                  data-testid={`lang-opt-${lang === 'pt-BR' ? 'pt' : lang === 'en-US' ? 'en' : 'zh'}`}
                  className={`cb-btn cb-btn-ghost cb-btn-sm ${i18n.language === lang ? 'font-bold text-[--cb-brand]' : 'text-[--cb-text-tertiary]'}`}
                  aria-pressed={i18n.language === lang} aria-label={`${t('common.language')} ${lang}`}>
                  {lang === 'pt-BR' ? 'PT' : lang === 'en-US' ? 'EN' : '中'}
                </button>
              ))}
            </div>
            <button className="cb-theme-toggle" onClick={onToggleTheme}
              aria-label={theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}>
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
              <p className="text-lg text-[--cb-text-secondary] leading-relaxed mb-10">{t('landing.hero_desc')}</p>
              <div className="flex gap-4 flex-wrap">
                <button className="cb-btn cb-btn-primary cb-btn-xl cb-btn-pill" onClick={onConnect} data-testid="landing-connect">
                  ◆ {t('landing.hero_cta')}
                </button>
                <a href="#como" className="cb-btn cb-btn-ghost cb-btn-lg no-underline">
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
                            {STATUS_EMOJI[gameStatus] ?? ''} {gameStatus}
                          </span>
                        )}
                        {/* Badge LIVE animado */}
                        {isDrawing && (
                          <span className="gr-live" style={{ fontSize: '0.62rem' }}>{t('game_room.badge_live')}</span>
                        )}
                        {/* Countdown de fechamento */}
                        {isFunding && countdown && (
                          <span className="text-xs font-mono font-bold text-[--cb-accent]">🔒 {countdown}</span>
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
                      <button className="cb-btn cb-btn-outline flex-1 text-sm" onClick={onConnect}>
                        ◆ {t('room.enter')}
                      </button>
                      <button
                        className="cb-btn cb-btn-ghost cb-btn-sm"
                        title={t('replay.room_history_title')}
                        aria-label={`Histórico da sala ${meta?.name ?? roomId}`}
                        onClick={() => navigate(`/room/${roomId}/history`)}
                        style={{ padding: '0 0.75rem' }}
                      >
                        📋
                      </button>
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

      {/* ── Sponsors ── */}
      <section id="sponsors" className="py-16 bg-[--cb-bg-elevated] border-t border-[--cb-border-subtle]">
        <div className="cb-container text-center">
          <span className="cb-badge-brand inline-block mb-4">{t('landing.b2b_badge')}</span>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4 tracking-tight">{t('landing.b2b_title')}</h2>
          <p className="text-[--cb-text-secondary] max-w-[32rem] mx-auto mb-8 leading-relaxed">{t('landing.b2b_desc')}</p>
          <button className="cb-btn cb-btn-outline cb-btn-lg" onClick={onConnect}>{t('landing.b2b_cta')}</button>
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
                <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => setDevOpen(o => !o)}
                  data-testid="dev-login-toggle"
                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', color: 'var(--cb-text-tertiary)' }}>
                  🧪 {t('auth.dev_login')} ▾
                </button>
                {devOpen && (
                  <div className="absolute bottom-full right-0 mb-1 bg-[--cb-bg-elevated] border border-[--cb-border-subtle] rounded-lg p-1 min-w-[11rem] shadow-lg z-50">
                    {devAccounts.map(acc => (
                      <button key={acc.actor} className="cb-btn cb-btn-ghost block w-full text-left text-[0.7rem] px-2.5 py-1.5 whitespace-nowrap"
                        data-testid={`dev-login-${devRoleFromLabel(acc.label)}`}
                        onClick={() => { setDevOpen(false); onDevLogin(acc.actor, acc.key); }}>
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
