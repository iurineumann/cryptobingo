// apps/frontend/src/components/ReplayRoom.tsx
// Replay de partidas encerradas com slow reveal simulado.
// Reutiliza o mesmo shell visual do GameRoom (gr-*).
// Design: classes gr-* + gr-replay-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useReplay } from '../hooks/useReplay';
import { TicketCard } from './TicketCard';
import {
  BINGO_COLORS, getCol, type Pattern,
  sortTickets, sortPatterns, groupTicketsByCategory,
} from './ticketUtils';
import { Check, X } from 'lucide-react';

interface ReplayRoomProps {
  gameId: string;
  session: Session;
  onLeave: () => void;
}

const SPEEDS = [0.5, 1, 2, 4, 8];

function formatDateShort(endTime: number): string {
  if (!endTime || endTime <= 0) return '';
  return new Date(endTime * 1000).toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function parseAmount(str: string): number {
  if (!str || str === '—') return 0;
  return parseFloat(str.split(' ')[0]) || 0;
}

export default function ReplayRoom({ gameId, session, onLeave }: ReplayRoomProps) {
  const { t } = useTranslation();
  const {
    game, tickets, revealedBalls, totalBalls,
    isPlaying, isComplete, isLoading, speed,
    patterns, combinations, patternWinCount, combinationWinCount, winners,
    goldenBall, gameEnded,
    setSpeed, togglePlay, skipToEnd, restart,
  } = useReplay(gameId, session);

  const heroRef     = useRef<HTMLDivElement>(null);
  const seqRef      = useRef<HTMLDivElement>(null);
  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);
  const prevCount   = useRef(0);

  const [showPatterns,  setShowPatterns]  = useState(true);
  const [showSummary,   setShowSummary]   = useState(false);
  const density = 'comfortable' as const;

  const lastDrawn    = revealedBalls.length > 0 ? revealedBalls[revealedBalls.length - 1] : null;
  const revealedSet  = useMemo(() => new Set(revealedBalls), [revealedBalls]);
  const col          = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color        = BINGO_COLORS[col];
  const currencySymbol = game?.ticket_price?.quantity?.trim().split(' ').pop() ?? 'WAX';

  // Mostra o painel de resumo assim que o replay termina
  useEffect(() => {
    if (isComplete && gameEnded) setShowSummary(true);
  }, [isComplete, gameEnded]);

  // Sincroniza altura do painel de padrões com o stage
  useEffect(() => {
    const stage = stageRef.current;
    const pnl   = patternsRef.current;
    if (!stage || !pnl) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        pnl.style.maxHeight = `${entry.contentBoxSize[0].blockSize}px`;
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Animação da bola hero
  useEffect(() => {
    if (!heroRef.current || revealedBalls.length === prevCount.current) return;
    prevCount.current = revealedBalls.length;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [revealedBalls.length]);

  // ── Seek bar ─────────────────────────────────────────────────────────────
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.round(ratio * totalBalls);
    // useReplay não expõe seekTo — controlamos via skipToEnd/restart e revealedCount
    // Solução: restart e imediatamente avançamos chamando skipToEnd se target = total,
    // ou deixamos o usuário usar os botões. Para seek real precisaríamos expor setRevealedCount.
    // Como workaround, se clicou na metade esquerda: restart; direita: skipToEnd.
    if (target === 0) { restart(); }
    else if (target >= totalBalls) { skipToEnd(); }
    // Para seek intermediário, expomos a função via hook (ver abaixo).
    else { (e.currentTarget as any).__seekTo?.(target); }
  }, [totalBalls, restart, skipToEnd]);

  // ── Mapa winner ───────────────────────────────────────────────────────────
  const winnerMap = useMemo(() => {
    const map = new Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>();
    for (const w of winners) {
      for (const p of w.patterns) {
        const existing = map.get(w.ticket_id);
        const prizeVal = parseFloat(p.prize) || 0;
        if (existing) {
          existing.patternCount++;
          existing.totalPrize += prizeVal;
        } else {
          map.set(w.ticket_id, { prize: p.prize, patternName: p.name, totalPrize: prizeVal, patternCount: 1 });
        }
      }
    }
    return map;
  }, [winners]);

  const patternByName = useMemo(() => {
    const map = new Map<string, Pattern>();
    for (const p of patterns) map.set(p.name, p);
    return map;
  }, [patterns]);

  // ── Sort/group ────────────────────────────────────────────────────────────
  const groupedTickets = useMemo(
    () => groupTicketsByCategory(tickets, revealedSet, patterns, winnerMap),
    [tickets, revealedSet, patterns, winnerMap],
  );
  const sortedPatterns = useMemo(
    () => sortPatterns(patterns, tickets, revealedSet, patternWinCount),
    [patterns, tickets, revealedSet, patternWinCount],
  );

  // ── Stats do resumo ───────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    let totalWon = 0;
    for (const [, info] of winnerMap) totalWon += info.totalPrize;
    const myWinning = winnerMap.size > 0;
    return { winnerCount: winners.length, myWinning, totalWon };
  }, [winners, winnerMap]);

  // ── Banners ───────────────────────────────────────────────────────────────
  const hasBanners = !!goldenBall || gameEnded;
  const progressPct = totalBalls > 0 ? (revealedBalls.length / totalBalls) * 100 : 0;

  // ── Loading / not found ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div data-testid="replay-loading" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
          <p style={{ color: 'var(--cb-text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div data-testid="replay-not-found" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
        <div style={{ textAlign: 'center', color: 'var(--cb-text-tertiary)' }}>
          <p>{t('replay.game_not_found')}</p>
          <button className="cb-btn cb-btn-outline cb-btn-sm mt-4" onClick={onLeave}>{t('common.back')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gr-shell" data-testid="replay-page">

      {/* ── Navbar ── */}
      <header className="gr-navbar">
        <div className="gr-nav-left">
          <button className="cb-btn cb-btn-ghost cb-btn-sm" data-testid="replay-back-btn" onClick={onLeave}>
            {t('replay.back_to_lobby')}
          </button>
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)' }}>{t('replay.breadcrumb_replay')}</span>
            <span className="room">#{gameId}</span>
            <span className="cb-badge cb-badge-neutral">{game.status}</span>
            {game.end_time > 0 && (
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-family-mono)', color: 'var(--cb-text-tertiary)' }}>
                {formatDateShort(game.end_time)}
              </span>
            )}
          </div>
        </div>
        {!showPatterns && patterns.length > 0 && (
          <button
            className="cb-btn cb-btn-ghost cb-btn-sm"
            onClick={() => setShowPatterns(true)}
            title={t('replay.show_patterns')}
          >
            ◈ {t('replay.show_patterns')}
          </button>
        )}
      </header>

      <div className={`gr-main gr-${density}`}>

        {/* ── Top row: stage + patterns ── */}
        <div className="gr-top-row">

          {/* ── Stage ── */}
          <section
            ref={stageRef}
            className="gr-stage"
            data-stage-style="spotlight"
            aria-label={t('replay.replay_aria')}
          >
            <div className="gr-stage-header">
              <span className="gr-stage-label">{t('replay.last_ball_heading')}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
                {t('replay.ball_count', { count: revealedBalls.length, total: totalBalls })}
              </span>
            </div>

            <div className="gr-stage-body">
              <div className="gr-stage-spot" style={{ '--ball-color': color } as React.CSSProperties}>
                <div className="gr-ball-halo" aria-hidden="true" />
                <div
                  ref={heroRef}
                  className="gr-ball-hero"
                  data-testid="replay-hero"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={lastDrawn != null ? t('replay.hero_ball_aria', { number: lastDrawn, count: revealedBalls.length }) : t('replay.waiting_start')}
                >
                  <div className="ball-surface" aria-hidden="true" />
                  <span className="ball-letter">{col}</span>
                  <span className="ball-number" data-testid="replay-hero-number">{lastDrawn ?? '—'}</span>
                  {lastDrawn != null && (
                    <span className="ball-order">{t('replay.ball_order', { ordem: revealedBalls.length })}</span>
                  )}
                </div>
                {lastDrawn != null && (
                  <div className="gr-call" aria-hidden="true">
                    <span className="col-tag">{col}</span>
                    <span>{lastDrawn}</span>
                  </div>
                )}
              </div>

              <div className="gr-stage-footer">
                <div ref={seqRef} className="gr-sequence" data-testid="replay-sequence" aria-label={t('replay.history_aria')}>
                  {[...revealedBalls].reverse().map((ball, idx) => {
                    const c = getCol(ball);
                    return (
                      <div
                        key={idx}
                        className={`gr-mini-ball${idx === 0 ? ' latest' : ''}`}
                        style={{ '--ball-color': BINGO_COLORS[c] } as React.CSSProperties}
                        title={`${c}${ball}`}
                      >
                        {ball}
                      </div>
                    );
                  })}
                </div>
                <div className="gr-progress">
                  <div className="gr-progress-row">
                    <span>{t('replay.progress_label')}</span>
                    <span className="count">{revealedBalls.length}/{totalBalls}</span>
                  </div>
                  <div className="cb-progress-track" role="progressbar" aria-valuenow={revealedBalls.length} aria-valuemin={0} aria-valuemax={totalBalls}>
                    <div className="cb-progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Painel de Padrões ── */}
          {showPatterns && (
            <aside ref={patternsRef} className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
              <div className="gr-patterns-head">
                <span className="title">{t('game_room.patterns_heading')}</span>
                <button
                  className="cb-btn cb-btn-ghost cb-btn-sm"
                  onClick={() => setShowPatterns(false)}
                  aria-label={t('game_room.patterns_hide_aria')}
                ><X className="size-4 shrink-0" /></button>
              </div>
              <div className="gr-patterns-list">
                {patterns.length === 0 ? (
                  <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                    {t('game_room.patterns_empty')}
                  </div>
                ) : (
                  sortedPatterns.map(p => {
                    const patternWon = winners.some(w => w.patterns.some(wp => wp.name === p.name));
                    const winCount   = patternWinCount.get(p.name) || 0;
                    return (
                      <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                        <div className="gr-pattern-mini">
                          {p.cells.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                        </div>
                        <div className="gr-pattern-info">
                          <span className="name">{p.name}</span>
                          <div className="mini-progress">
                            <i style={{ width: patternWon ? '100%' : '0%' }} />
                          </div>
                          <span className="meta">
                            {patternWon
                              ? `${t('game_room.pattern_completed')} (${winCount})`
                              : `${p.cells.filter(Boolean).length} cells`}
                          </span>
                        </div>
                        <div className="gr-pattern-prize">
                          <span className="amt">{p.prize}</span>
                          <span className="hits">{currencySymbol}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                {combinations.length > 0 && (
                  <div className="gr-patterns-combos">
                    <span className="gr-patterns-combos-head">Combinações</span>
                    {combinations.map(c => {
                      const won = combinationWinCount.get(c.name);
                      return (
                        <div key={c.name} className={`gr-pattern-combo${won ? ' is-close' : ''}`}>
                          <span className="name">{c.name}</span>
                          <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                          {won
                            ? <span className="cnt"><Check className="size-3 shrink-0" /> {won} cartela{won > 1 ? 's' : ''}</span>
                            : <span className="cnt">—</span>
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* ── Barra de controles do replay ── */}
        <div className="gr-replay-bar">
          {/* Botões principais */}
          <div className="gr-replay-btn-group">
            <button
              className="cb-btn cb-btn-primary cb-btn-sm"
              data-testid="replay-play-btn"
              onClick={isComplete ? restart : togglePlay}
              aria-label={isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')}
              title={isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')}
            >
              {isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')}
            </button>

            {!isComplete && (
              <button
                className="cb-btn cb-btn-ghost cb-btn-sm"
                data-testid="replay-restart-btn"
                onClick={restart}
                disabled={revealedBalls.length === 0}
                title={t('replay.btn_restart')}
                aria-label={t('replay.btn_restart')}
              >
                {t('replay.btn_restart')}
              </button>
            )}

            <button
              className="cb-btn cb-btn-ghost cb-btn-sm"
              data-testid="replay-end-btn"
              onClick={skipToEnd}
              disabled={isComplete}
              title={t('replay.btn_end')}
              aria-label={t('replay.btn_end')}
              >
                {t('replay.btn_end')}
              </button>
          </div>

          {/* Velocidade */}
          <div className="gr-replay-speed">
            <span className="gr-replay-speed-label">{t('replay.speed')}</span>
            <div className="gr-replay-speed-btns">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  className={`cb-btn ${speed === s ? 'cb-btn-primary' : 'cb-btn-ghost'} cb-btn-sm`}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', minWidth: '2.2rem' }}
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  data-testid={`replay-speed-${s}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Contador */}
          <div className="gr-replay-counter">
            <span>{revealedBalls.length}/{totalBalls}</span>
            {isComplete && <span className="done"><Check className="size-3 shrink-0" /> {t('replay.complete')}</span>}
          </div>

          {/* Seek bar — linha completa abaixo */}
          {totalBalls > 0 && (
            <div className="gr-replay-seek">
              <div
                className="gr-replay-seek-track"
                data-testid="replay-seek"
                role="slider"
                aria-label={t('replay.seek_aria')}
                aria-valuenow={revealedBalls.length}
                aria-valuemin={0}
                aria-valuemax={totalBalls}
                onClick={e => {
                  const rect  = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const target = Math.round(ratio * totalBalls);
                  if (target === 0) restart();
                  else if (target >= totalBalls) skipToEnd();
                }}
              >
                <div className="gr-replay-seek-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="gr-replay-seek-label">{Math.round(progressPct)}%</span>
            </div>
          )}
        </div>

        {/* ── Banners (golden ball, game ended) ── */}
        {hasBanners && (
          <div className="gr-banners-row" style={{ gridColumn: '1 / -1' }}>
            {goldenBall && (
              <div className="gr-golden-banner" data-testid="replay-golden-banner" role="status" aria-live="assertive">
                <span className="gr-golden-icon" />
                <div className="gr-golden-text">
                  <strong>{t('game_room.golden_ball_title')}</strong>
                  <span>{t('game_room.golden_ball_desc', { ball: goldenBall.ballNum, multiplier: goldenBall.multiplier })}</span>
                </div>
                <span className="gr-golden-mult">×{goldenBall.multiplier}</span>
              </div>
            )}
            {gameEnded && (
              <div className="gr-ended-banner" data-testid="replay-ended-banner" role="status" aria-live="polite">
                <span className="gr-ended-icon" />
                <div className="gr-ended-text">
                  <strong>{t('game_room.game_ended_title')}</strong>
                  <span>
                    {winners.length > 0
                      ? t('game_room.game_ended_winners', { count: winners.length })
                      : t('game_room.game_ended_no_winners')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Painel de resumo — aparece quando o replay termina ── */}
        {showSummary && isComplete && (
          <div className="gr-replay-summary" data-testid="replay-summary">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div className="gr-replay-summary-head">
                <span className={`gr-replay-summary-icon${summaryStats.myWinning ? ' gr-replay-summary-icon--win' : ' gr-replay-summary-icon--end'}`} />
                <div>
                  <div className="gr-replay-summary-title">
                    {summaryStats.myWinning
                      ? t('replay.replay_summary_won')
                      : t('replay.replay_summary_title')}
                  </div>
                  <div className="gr-replay-summary-sub">
                    {t('replay.replay_summary_balls', { count: totalBalls })}
                    {' · '}
                    {summaryStats.winnerCount > 0
                      ? t('replay.replay_summary_winners', { count: summaryStats.winnerCount, plural: summaryStats.winnerCount !== 1 ? 'es' : '' })
                      : t('replay.replay_summary_no_winners')}
                  </div>
                </div>
              </div>
              <button
                className="cb-btn cb-btn-ghost cb-btn-sm"
                onClick={() => setShowSummary(false)}
                aria-label="Fechar resumo"
              ><X className="size-4 shrink-0" /></button>
            </div>

            {winnerMap.size > 0 && (
              <div className="gr-replay-summary-stats">
                {[...winnerMap.entries()].slice(0, 5).map(([ticketId, info]) => (
                  <div key={ticketId} className="gr-replay-summary-stat">
                    <span className="label">Cartela #{ticketId}</span>
                    <span className="value won">
                      {info.totalPrize.toFixed(4)} {currencySymbol}
                      {info.patternCount > 1 && (
                        <span style={{ fontSize: '0.65rem', marginLeft: '0.25rem', opacity: 0.7 }}>
                          ({info.patternCount} padrões)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={restart}>
                {t('replay.btn_restart')}
              </button>
              <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={onLeave}>
                {t('replay.back_to_lobby')}
              </button>
            </div>
          </div>
        )}

        {/* ── Cartelas ── */}
        <div className="gr-tickets-section">
          <div className="gr-tickets-head">
            <span className="title">
              {t('replay.my_tickets_heading')}
              <span className="count">{tickets.length}</span>
            </span>
          </div>

          {tickets.length === 0 ? (
            <div className="gr-summary-empty">{t('replay.no_tickets')}</div>
          ) : (
            groupedTickets.map(group => (
              <div key={group.category} className="gr-tickets-group">
                <div className="gr-tickets-group-label">
                  <span className="gr-tickets-group-title">{group.label}</span>
                  <span className="gr-tickets-group-count">{group.tickets.length}</span>
                </div>
                <div className="gr-tickets-grid">
                  {group.tickets.map(ticket => {
                    const w = winnerMap.get(ticket.id);
                    const pat = w ? patternByName.get(w.patternName) : undefined;
                    const winPatternSet = pat
                      ? new Set(pat.cells.map((req, i) => req ? i : -1).filter(i => i !== -1))
                      : null;
                    return (
                      <TicketCard
                        key={ticket.id}
                        ticketId={ticket.id}
                        matrix={ticket.matrix}
                        drawnSet={revealedSet}
                        lastDrawn={lastDrawn}
                        winPattern={winPatternSet}
                        prize={w?.prize ?? null}
                        density={density}
                        patterns={patterns}
                        pricePaid={ticket.pricePaid}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
