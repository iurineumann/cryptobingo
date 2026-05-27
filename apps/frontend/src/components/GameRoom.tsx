// apps/frontend/src/components/GameRoom.tsx
// Sala de jogo ao vivo — bola hero, histórico, cartelas do jogador, painel de padrões.
// Conecta ao WebSocket via useSlowReveal e busca o estado do jogo via RPC.
//
// Design: classes gr-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import type { MongoUserProfile, BlockchainGameState, ExtendedAsset } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../services/api';
import { useSlowReveal } from '../hooks/useSlowReveal';
import BuyTicketModal from './BuyTicketModal';
import ChatPanel from './chat/ChatPanel';

// ==========================================
// TIPOS
// ==========================================

interface GameRoomProps {
  gameId:  string;
  roomId?: string;
  session: Session;
  profile: MongoUserProfile;
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

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
const COLS     = ['B', 'I', 'N', 'G', 'O'];

// ==========================================
// SUB-COMPONENTE: Cartela 5×5
// ==========================================

interface TicketCardProps {
  ticketId:    string;
  matrix:      number[];
  drawnSet:    Set<number>;
  lastDrawn:   number | null;
  winPattern:  Set<number> | null;
  prize:       string | null;
  density:     'comfortable' | 'compact';
}

function TicketCard({ ticketId, matrix, drawnSet, lastDrawn, winPattern, prize, density }: TicketCardProps) {
  const { t } = useTranslation();
  // Constrói grid 5×5 coluna-maior → linha-maior (layout: bits 0-24, bit12=FREE)
  const grid = useMemo(() => {
    const B    = matrix.slice(0, 5);
    const I    = matrix.slice(5, 10);
    const Nraw = matrix.slice(10, 14);
    const G    = matrix.slice(14, 19);
    const O    = matrix.slice(19, 24);
    const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
    return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
  }, [matrix]);

  const markedCount = useMemo(
    () => matrix.filter(n => drawnSet.has(n)).length + 1, // +1 FREE
    [matrix, drawnSet],
  );

  const isWinner = winPattern !== null;
  const isClose  = !isWinner && markedCount >= (density === 'compact' ? 20 : 18);

  return (
    <article
      className={[
        'gr-ticket',
        isWinner ? 'is-winner' : '',
        !isWinner && markedCount < 3 ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
      aria-label={isWinner ? t('game_room.ticket_winner_aria', { ticketId }) : t('game_room.ticket_aria', { ticketId })}
    >
      <div className="gr-ticket-header">
        <div className="gr-ticket-id">
          <span className="label">{t('game_room.ticket_label')}</span>
          <span className="id">#{ticketId}</span>
        </div>
        <span className={`gr-ticket-marks${isWinner ? ' is-winner' : isClose ? ' is-close' : ''}`}>
          {isWinner ? t('game_room.winner_badge') : `${markedCount}/25`}
        </span>
      </div>

      <div className="gr-bingo-grid" role="grid" aria-label={t('game_room.ticket_aria', { ticketId })}>
        <div className="gr-bingo-grid-head" role="row">
          {COLS.map(c => (
            <div key={c} className="gr-bingo-head" role="columnheader" style={{ background: BINGO_COLORS[c] }}>
              {c}
            </div>
          ))}
        </div>
        <div className="gr-bingo-grid-body">
          {grid.map((row, ri) => (
            <div key={ri} className="gr-bingo-row" role="row">
              {row.map((val, ci) => {
                const gridIdx   = ri * 5 + ci;
                const isFree    = val === null;
                const isMarked  = isFree || drawnSet.has(val as number);
                const isJustHit = !isFree && val === lastDrawn;
                const inWin     = winPattern?.has(gridIdx) ?? false;
                const color     = BINGO_COLORS[COLS[ci]];

                return (
                  <div
                    key={ci}
                    role="gridcell"
                    aria-selected={isMarked}
                    aria-label={isFree ? t('game_room.free_space_aria') : isMarked ? t('game_room.cell_marked_aria', { col: COLS[ci], val }) : t('game_room.cell_aria', { col: COLS[ci], val })}
                    className={[
                      'gr-bingo-cell',
                      isFree     ? 'is-free'            : '',
                      isMarked && !isFree ? 'is-marked' : '',
                      isJustHit  ? 'is-just-hit'        : '',
                      inWin      ? 'in-winning-pattern' : '',
                    ].filter(Boolean).join(' ')}
                    style={isMarked && !isFree ? { '--cell-color': color } as React.CSSProperties : {}}
                  >
                    {isFree ? '⭐' : val}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="gr-ticket-foot">
        <span className="best">
          {isWinner ? t('game_room.ticket_footer_pattern') : t('game_room.ticket_footer_marked', { count: markedCount })}
        </span>
        {prize && <span className={`prize${isWinner ? ' is-paid' : ''}`}>{prize}</span>}
      </div>
    </article>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function GameRoom({ gameId, roomId, session, profile, onLeave }: GameRoomProps) {
  const { t } = useTranslation();

  // ── Estado local ──────────────────────────────────────────────────────────
  const [game,         setGame]         = useState<BlockchainGameState | null>(null);
  const [playerTickets,setPlayerTickets]= useState<Array<{ id: string; matrix: number[] }>>([]);
  const [room,         setRoom]         = useState<EnrichedRoom | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showChat,     setShowChat]     = useState(false);
  const [loadingGame,  setLoadingGame]  = useState(true);
  const density                         = 'comfortable' as const;

  // ── WebSocket (Slow Reveal) ───────────────────────────────────────────────
  const { drawnBalls, lastBall, isDrawing, winners, isAborted, abortReason, wsStatus } =
    useSlowReveal(gameId);

  // drawnBalls é DrawnBall[] → extraímos os números
  const drawnNumbers = useMemo(
    () => drawnBalls.map(b => b.number),
    [drawnBalls],
  );
  const drawnSet   = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const lastDrawn  = lastBall?.number ?? null;

  // ── Refs para animação ────────────────────────────────────────────────────
  const heroRef   = useRef<HTMLDivElement>(null);
  const seqRef    = useRef<HTMLDivElement>(null);
  const prevBall  = useRef<number | null>(null);

  useEffect(() => {
    if (!heroRef.current || lastDrawn === prevBall.current) return;
    prevBall.current = lastDrawn;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [lastDrawn]);

  useEffect(() => {
    if (seqRef.current) seqRef.current.scrollLeft = seqRef.current.scrollWidth;
  }, [drawnBalls.length]);

  // ── Carrega jogo + cartelas + room (se aplicável) ─────────────────────────
  const loadGame = useCallback(async () => {
    setLoadingGame(true);
    try {
      const [gameRes, ticketsRes] = await Promise.all([
        session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          lower_bound: UInt64.from(gameId), upper_bound: UInt64.from(gameId), limit: 1, json: true,
        }),
        session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: gameId, table: 'tickets', limit: 50, json: true,
        }),
      ]);
      if (gameRes.rows.length) setGame(gameRes.rows[0] as BlockchainGameState);

      const loadedGame = gameRes.rows[0] as BlockchainGameState | undefined;
      if (loadedGame && loadedGame.room_id && loadedGame.room_id !== '0') {
        try {
          const { fetchRoom } = await import('../services/api');
          const roomData = await fetchRoom(loadedGame.room_id);
          setRoom(roomData);
        } catch { /* silencioso */ }
      } else if (roomId) {
        try {
          const { fetchRoom } = await import('../services/api');
          const roomData = await fetchRoom(roomId);
          setRoom(roomData);
        } catch { /* silencioso */ }
      }

      setPlayerTickets(
        (ticketsRes.rows as Array<{ ticket_id: string; matrix: number[] }>).map(r => ({
          id:     r.ticket_id,
          matrix: r.matrix,
        }))
      );
    } catch (err) {
      console.error('[GameRoom] Erro ao carregar jogo:', err);
    } finally {
      setLoadingGame(false);
    }
  }, [session, gameId, roomId]);

  useEffect(() => {
    loadGame();
    const interval = setInterval(loadGame, 15_000);
    return () => clearInterval(interval);
  }, [loadGame]);

  // ── Derivações visuais ────────────────────────────────────────────────────
  const col   = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];

  const wsStatusClass: Record<string, string> = {
    connected:    'cb-status-dot-live',
    connecting:   'cb-status-dot-pending',
    disconnected: 'cb-status-dot-offline',
    error:        'cb-status-dot-error',
  };

  const ticketPrice = game?.ticket_price as ExtendedAsset | undefined;

  return (
    <div className="gr-shell">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="gr-navbar">
        <div className="gr-nav-left">
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onLeave}>
            {t('game_room.back_to_lobby')}
          </button>
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)' }}>{t('game_room.breadcrumb_room')}</span>
            <span className="room">
              {room?.metadata?.name ?? `#${gameId}`}
              {room && <span className="text-[--cb-text-tertiary] text-xs ml-1">(Sala {room.room_id})</span>}
            </span>
            {isDrawing && <span className="gr-live">{t('game_room.badge_live')}</span>}
            {isAborted && <span className="cb-status-aborted">{t('game_room.badge_aborted')}</span>}
          </div>
        </div>
        <div className="gr-nav-right">
          {room?.metadata?.chat_enabled !== false && (
            <button
              className={`cb-btn cb-btn-sm ${showChat ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
              onClick={() => setShowChat(s => !s)}
              aria-label="Chat da sala"
            >
              💬 Chat
            </button>
          )}
          <span className="cb-wallet-chip">
            <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.7rem' }}>
              {profile.wallet_address}
            </span>
          </span>
          <span
            className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`}
            title={t('game_room.ws_title', { status: wsStatus })}
            aria-label={t('game_room.ws_aria', { status: wsStatus })}
          />
        </div>
      </header>

      {/* ── Grid principal ──────────────────────────────────────────────────── */}
      <div className={`gr-main gr-${density}`}>

        {/* ── Stage ──────────────────────────────────────────────────────────── */}
        <section
          className="gr-stage"
          data-stage-style="spotlight"
          aria-label="Sorteio em tempo real"
        >
          <div className="gr-stage-header">
            <span className="gr-stage-label">{t('game_room.last_ball_heading')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
              <span className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`} aria-hidden="true" />
              <span style={{ fontWeight: 600, color: 'var(--cb-text-secondary)' }}>
                {t('game_room.ball_count', { drawn: drawnNumbers.length })}
              </span>
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
                aria-label={lastDrawn != null ? t('game_room.hero_ball_aria', { col, num: lastDrawn, count: drawnNumbers.length }) : t('game_room.hero_ball_waiting')}
              >
                <div className="ball-surface" aria-hidden="true" />
                <span className="ball-letter">{col}</span>
                <span className="ball-number">{lastDrawn ?? '—'}</span>
                {lastDrawn != null && (
                  <span className="ball-order">{t('game_room.ball_order', { ordem: drawnNumbers.length })}</span>
                )}
              </div>

              {lastDrawn != null && (
                <div className="gr-call" aria-hidden="true">
                  <span className="col-tag">{col}</span>
                  <span>{lastDrawn}</span>
                </div>
              )}
            </div>

            {/* Footer: histórico + progress */}
            <div className="gr-stage-footer">
              <div ref={seqRef} className="gr-sequence" aria-label={t('game_room.history_aria')}>
                {drawnBalls.map((ball, idx) => {
                  const c   = getCol(ball.number);
                  const clr = BINGO_COLORS[c];
                  return (
                    <div
                      key={ball.order}
                      className={`gr-mini-ball${idx === drawnBalls.length - 1 ? ' latest' : ''}`}
                      style={{ '--ball-color': clr } as React.CSSProperties}
                      title={`${c}${ball.number}`}
                    >
                      {ball.number}
                    </div>
                  );
                })}
              </div>
              <div className="gr-progress">
                <div className="gr-progress-row">
                  <span>{t('game_room.progress_label')}</span>
                  <span className="count">{drawnNumbers.length}/75</span>
                </div>
                <div className="cb-progress-track">
                  <div className="cb-progress-fill" style={{ width: `${(drawnNumbers.length / 75) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Painel de Padrões ──────────────────────────────────────────────── */}
        {showPatterns && (
          <aside className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
            <div className="gr-patterns-head">
              <span className="title">{t('game_room.patterns_heading')}</span>
              <button
                className="cb-btn cb-btn-ghost cb-btn-sm"
                onClick={() => setShowPatterns(false)}
                aria-label={t('game_room.patterns_hide_aria')}
              >✕</button>
            </div>
            <div className="gr-patterns-list">
              <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                {loadingGame ? t('game_room.patterns_loading') : t('game_room.patterns_empty')}
              </div>
            </div>
          </aside>
        )}

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <div className="gr-tickets-section">
          <div className="gr-tickets-head">
            <span className="title">
              {t('game_room.my_tickets_heading')}
              <span className="count">{playerTickets.length}</span>
            </span>
            {game?.status === 'funding' && ticketPrice && (
              <button
                className="cb-btn cb-btn-primary cb-btn-sm"
                onClick={() => setShowBuyModal(true)}
              >
                {t('game_room.buy_more')}
              </button>
            )}
          </div>

          {playerTickets.length === 0 ? (
            <div className="gr-summary-empty">
              {loadingGame
                ? t('game_room.tickets_loading')
                : game?.status === 'funding'
                  ? t('game_room.tickets_empty_funding')
                  : t('game_room.tickets_empty_default')}
            </div>
          ) : (
            <div className="gr-tickets-grid">
              {playerTickets.map(ticket => (
                <TicketCard
                  key={ticket.id}
                  ticketId={ticket.id}
                  matrix={ticket.matrix}
                  drawnSet={drawnSet}
                  lastDrawn={lastDrawn}
                  winPattern={null}
                  prize={null}
                  density={density}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat Panel ─────────────────────────────────────────────────────── */}
      {showChat && room && (
        <ChatPanel
          roomId={room.room_id}
          roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
          session={session}
          walletAddress={profile.wallet_address}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* ── Modal de compra ────────────────────────────────────────────────── */}
      {showBuyModal && ticketPrice && (
        <BuyTicketModal
          gameId={gameId}
          ticketPrice={ticketPrice}
          session={session}
          onClose={() => setShowBuyModal(false)}
          onSuccess={() => { setShowBuyModal(false); loadGame(); }}
        />
      )}
    </div>
  );
}
