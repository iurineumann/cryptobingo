import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useReplay } from '../hooks/useReplay';
import TicketGrid from './TicketGrid';

interface ReplayRoomProps {
  gameId: string;
  session: Session;
  onLeave: () => void;
}

const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)',
  I: 'var(--color-bingo-i)',
  N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)',
  O: 'var(--color-bingo-o)',
};

function getCol(n: number): string {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

const SPEEDS = [0.5, 1, 2, 4, 8];

export default function ReplayRoom({ gameId, session, onLeave }: ReplayRoomProps) {
  const { t } = useTranslation();
  const {
    game, tickets, revealedBalls, totalBalls,
    isPlaying, isComplete, isLoading, speed,
    setSpeed, togglePlay, skipToEnd, restart,
  } = useReplay(gameId, session);

  const heroRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const lastDrawn = revealedBalls.length > 0 ? revealedBalls[revealedBalls.length - 1] : null;
  const revealedSet = useMemo(() => new Set(revealedBalls), [revealedBalls]);

  const col = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];

  const sortedTickets = useMemo(() => {
    if (tickets.length === 0) return tickets;
    return [...tickets].sort((a, b) => {
      const marksA = a.matrix.filter(n => revealedSet.has(n)).length + 1;
      const marksB = b.matrix.filter(n => revealedSet.has(n)).length + 1;
      return marksB - marksA;
    });
  }, [tickets, revealedSet]);

  useEffect(() => {
    if (!heroRef.current || revealedBalls.length === prevCount.current) return;
    prevCount.current = revealedBalls.length;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [revealedBalls.length]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="cb-spinner" style={{ width: '2rem', height: '2rem', borderWidth: '3px' }} />
          <p style={{ color: 'var(--cb-text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg-base)' }}>
        <div style={{ textAlign: 'center', color: 'var(--cb-text-tertiary)' }}>
          <p>{t('replay.game_not_found')}</p>
          <button className="cb-btn cb-btn-outline cb-btn-sm mt-4" onClick={onLeave}>{t('common.back')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gr-shell">
      <header className="gr-navbar">
        <div className="gr-nav-left">
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onLeave}>
            {t('replay.back_to_lobby')}
          </button>
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)' }}>{t('replay.breadcrumb_replay')}</span>
            <span className="room">#{gameId}</span>
            <span className="cb-badge cb-badge-neutral">{game.status}</span>
          </div>
        </div>
      </header>

      <div className="gr-main gr-comfortable">
        <section className="gr-stage" data-stage-style="spotlight" aria-label={t('replay.replay_aria')}>
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
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label={lastDrawn != null ? t('replay.hero_ball_aria', { number: lastDrawn, count: revealedBalls.length }) : t('replay.waiting_start')}
              >
                <div className="ball-surface" aria-hidden="true" />
                <span className="ball-letter">{col}</span>
                <span className="ball-number">{lastDrawn ?? '—'}</span>
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
              <div className="gr-sequence" aria-label={t('replay.history_aria')}>
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
                  <div className="cb-progress-fill" style={{ width: `${totalBalls > 0 ? (revealedBalls.length / totalBalls) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Controles do replay ─────────────────────────────────────────────── */}
        <div className="gr-replay-controls" style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem', background: 'var(--cb-bg-elevated)',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--cb-border-default)',
          flexWrap: 'wrap', gridColumn: '1 / -1',
        }}>
          <button
            className="cb-btn cb-btn-primary cb-btn-sm"
            onClick={togglePlay}
            disabled={isComplete && isPlaying}
            aria-label={isPlaying ? t('replay.pause') : t('replay.play')}
          >
            {isPlaying ? '⏸' : isComplete ? '↺' : '▶'}
          </button>

          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={restart} disabled={revealedBalls.length === 0} title={t('replay.restart')}>
            ⟲
          </button>

          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={skipToEnd} disabled={isComplete} title={t('replay.skip_to_end')}>
            ⏭
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>{t('replay.speed')}</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {SPEEDS.map(s => (
                <button
                  key={s}
                  className={`cb-btn ${speed === s ? 'cb-btn-primary' : 'cb-btn-ghost'} cb-btn-sm`}
                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', minWidth: '2.5rem' }}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--cb-text-tertiary)', marginLeft: 'auto' }}>
            {revealedBalls.length}/{totalBalls}
            {isComplete && <span style={{ color: 'var(--cb-success)', marginLeft: '0.5rem' }}>✓ {t('replay.complete')}</span>}
          </span>
        </div>

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <div className="gr-tickets-section">
          <div className="gr-tickets-head">
            <span className="title">
              {t('replay.my_tickets_heading')}
              <span className="count">{tickets.length}</span>
            </span>
          </div>

          {tickets.length === 0 ? (
            <div className="gr-summary-empty">
              {t('replay.no_tickets')}
            </div>
          ) : (
            <div className="gr-tickets-grid">
              {sortedTickets.map(ticket => (
                <div key={ticket.id}>
                  <TicketGrid
                    matrix={ticket.matrix}
                    drawnBalls={revealedSet}
                    lastDrawn={lastDrawn ?? undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
