// apps/frontend/src/components/GameRoom.tsx
// Sala de jogo ao vivo — bola hero, histórico, cartelas do jogador, painel de padrões.
// Conecta ao WebSocket via useSlowReveal e busca o estado do jogo via RPC.
//
// Design: classes gr-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import BuyTicketModal from './BuyTicketModal';
import ChatFloating from './chat/ChatFloating';
import Logo from './Logo';
import { TicketCard } from './TicketCard';
import { BINGO_COLORS, getCol } from './ticketUtils';
import { useGameRoomState, STATUS_DOT, WS_STATUS_CLASS } from './gameroom/useGameRoomState';

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

// ==========================================
// TIPOS
// ==========================================

interface GameRoomProps {
  gameId:            string;
  roomId?:           string;
  session:           Session;
  profile:           MongoUserProfile;
  onLeave:           () => void;
  onGoToHistory?:    () => void;
  onGoToWallet?:     () => void;
  onGoToAdmin?:      () => void;
  isAdmin?:          boolean;
  onLogout?:         () => void;
  theme?:            'dark' | 'light';
  onToggleTheme?:    () => void;
  onLanguageChange?: (locale: string) => void;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function GameRoom({
  gameId, roomId, session, profile, onLeave,
  onGoToHistory, onGoToWallet, onGoToAdmin, isAdmin,
  onLogout, theme, onToggleTheme, onLanguageChange,
}: GameRoomProps) {
  const { t, i18n } = useTranslation();

  // ── Estado/efeitos/derivações vivem no hook (Fase 0 do refactor) ──────────
  const state = useGameRoomState({ gameId, roomId, session });
  const {
    game, nextGame, playerTickets, room, loadingGame, maxBalls, gamePatterns,
    gameCombinations, ingameBalances, drawnBalls, lastBall, isDrawing, isAborted,
    wsStatus, goldenBall, clearedStages, effectiveBalls, drawnNumbers, drawnSet,
    lastDrawn, isEffectiveGameEnded, effectiveDisplayStatus, gameStatusText,
    timeRemaining, nextGameTimer, localWinners, winnerMap, patternByName,
    playerWinEntries, adjustedPatternWinCount, allGameCombinationWinCount,
    completedCombinationsPerTicket, combinationCells, patternProximityMap,
    combinationProximityMap, sortedPatterns, groupedTickets, currencySymbol,
    ticketPrice, col, color, hasBanners, now, loadGame, isStaticFinalState,
  } = state;
  const roomPatterns = gamePatterns;
  const wsStatusClass = WS_STATUS_CLASS;

  // UI puramente local do orquestrador (showPatterns migra para painel na Task 4)
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const density = 'comfortable' as const;

  // ── Refs para animação ────────────────────────────────────────────────────
  const heroRef     = useRef<HTMLDivElement>(null);
  const seqRef      = useRef<HTMLDivElement>(null);
  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);
  const prevBall    = useRef<number | null>(null);

  // Sincroniza altura do patterns com a do stage
  useEffect(() => {
    const stage = stageRef.current;
    const patterns = patternsRef.current;
    if (!stage || !patterns) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        patterns.style.maxHeight = `${entry.contentBoxSize[0].blockSize}px`;
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!heroRef.current || lastDrawn === prevBall.current) return;
    prevBall.current = lastDrawn;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [lastDrawn]);

  return (
    <div className="gr-shell">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="gr-navbar" data-testid="gr-room-header">

        {/* ── Esquerda: logo + crumb ── */}
        <div className="gr-nav-left">
          <Logo variant="icon" height={28} onClick={onLeave} alt="Voltar ao Lobby" />
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)', fontSize: '0.75rem' }}>
              {room?.metadata?.name ?? (room ? `Sala ${room.room_id}` : `#${gameId}`)}
            </span>
            {game && (
              <span data-testid="gr-game-status" data-status={effectiveDisplayStatus} className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary] inline-flex items-center gap-1">
                {effectiveDisplayStatus && <span className="lobby-status-dot" style={{ background: STATUS_DOT[effectiveDisplayStatus] }} />}
                {gameStatusText}
              </span>
            )}
            {timeRemaining && (
              <span className="text-xs font-mono font-bold text-[--cb-accent] bg-[--cb-bg-elevated] px-2 py-0.5 rounded-md border border-[--cb-border-default]">
                {timeRemaining}
              </span>
            )}
            {isDrawing && <span className="gr-live">{t('game_room.badge_live')}</span>}
            {isAborted && <span className="cb-status-aborted">{t('game_room.badge_aborted')}</span>}
          </div>
        </div>

        {/* ── Direita: saldo + chat + status WS + idioma + menu ── */}
        <div className="gr-nav-right">

          {/* Saldo in-game */}
          {ingameBalances.length > 0 && (
            <span
              className="lobby-wallet-chip"
              title={t('lobby.balance_aria')}
              style={{ fontSize: '0.72rem' }}
            >
              <span className="symbol" aria-hidden="true">◆</span>
              {ingameBalances.map((b, i) => (
                <span key={i} style={i > 0 ? { borderLeft: '1px solid var(--cb-border-subtle)', paddingLeft: '0.4rem', marginLeft: '0.2rem' } : {}}>
                  {b.balance.quantity}
                </span>
              ))}
            </span>
          )}

          {/* Seletor de idioma */}
          <select
            value={i18n.language}
            onChange={e => { i18n.changeLanguage(e.target.value); onLanguageChange?.(e.target.value); }}
            className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t('common.language') ?? 'Idioma'}
          >
            <option value="pt-BR">PT</option>
            <option value="en-US">EN</option>
            <option value="zh-CN">中</option>
          </select>

          {/* Status WS */}
          <span
            className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`}
            title={t('game_room.ws_title', { status: wsStatus })}
            aria-label={t('game_room.ws_aria', { status: wsStatus })}
          />

          {/* Menu dropdown ⋮ */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
              ⋮
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="gr-nav-lobby" onClick={onLeave}>
                🏠 {t('game_room.back_to_lobby')}
              </DropdownMenuItem>
              {onGoToHistory && (
                <DropdownMenuItem data-testid="gr-nav-history" onClick={onGoToHistory}>
                  📋 {t('nav.my_history') ?? 'Histórico'}
                </DropdownMenuItem>
              )}
              {onGoToWallet && (
                <DropdownMenuItem data-testid="gr-nav-wallet" onClick={onGoToWallet}>
                  💳 {t('nav.wallet') ?? 'Carteira'}
                </DropdownMenuItem>
              )}
              {isAdmin && onGoToAdmin && (
                <DropdownMenuItem data-testid="gr-nav-admin" onClick={onGoToAdmin}>
                  ⚙ Admin
                </DropdownMenuItem>
              )}
              {onToggleTheme && (
                <DropdownMenuItem onClick={onToggleTheme}>
                  {theme === 'dark' ? '☾' : '☀'} {theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}
                </DropdownMenuItem>
              )}
              {onLogout && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onLogout}>
                    ⏻ {t('nav.logout') ?? 'Desconectar'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      {/* ── Grid principal ──────────────────────────────────────────────────── */}
      <div className={`gr-main gr-${density}`}>

        {/* ── Linha superior: stage + patterns lado a lado ───────────────────── */}
        <div className="gr-top-row">

          {/* ── Stage ────────────────────────────────────────────────────────── */}
          <section
            ref={stageRef}
            className="gr-stage"
            data-stage-style="spotlight"
            aria-label="Sorteio em tempo real"
          >
            <div className="gr-stage-header">
              <span className="gr-stage-label">{t('game_room.last_ball_heading')}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
                <span className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`} aria-hidden="true" />
                <span style={{ fontWeight: 600, color: 'var(--cb-text-secondary)' }}>
                  {t('game_room.ball_count', { count: drawnNumbers.length })}
                </span>
              </span>
            </div>

            <div className="gr-stage-body">
              <div className="gr-stage-spot" style={{ '--ball-color': color } as React.CSSProperties}>
                <div className="gr-ball-halo" aria-hidden="true" />

                <div
                  ref={heroRef}
                  data-testid="gr-ball-hero"
                  className="gr-ball-hero"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={lastDrawn != null ? t('game_room.hero_ball_aria', { number: lastDrawn, count: drawnNumbers.length }) : t('game_room.hero_ball_waiting')}
                >
                  <div className="ball-surface" aria-hidden="true" />
                  <span className="ball-letter">{col}</span>
                  <span className="ball-number" data-testid="gr-ball-hero-number">{lastDrawn ?? '⭐'}</span>
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
                <div ref={seqRef} data-testid="gr-ball-history" className="gr-sequence" aria-label={t('game_room.history_aria')}>
                  {[...effectiveBalls].reverse().map((ball, idx) => {
                    const c   = getCol(ball.number);
                    const clr = BINGO_COLORS[c];
                    return (
                      <div
                        key={ball.order}
                        className={`gr-mini-ball${idx === 0 ? ' latest' : ''}`}
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
                    <span className="count">{drawnNumbers.length}/{maxBalls}</span>
                  </div>
                  <div className="cb-progress-track">
                    <div className="cb-progress-fill" style={{ width: `${Math.min((drawnNumbers.length / maxBalls) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Painel de Padrões ──────────────────────────────────────────────── */}
          {showPatterns && (
            <aside ref={patternsRef} data-testid="gr-patterns-panel" className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
              <div className="gr-patterns-head">
                <span className="title">{t('game_room.patterns_heading')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPatterns(false)}
                  aria-label={t('game_room.patterns_hide_aria')}
                >✕</Button>
              </div>
              <div className="gr-patterns-list">
                {roomPatterns.length === 0 ? (
                  <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                    {loadingGame ? t('game_room.patterns_loading') : t('game_room.patterns_empty')}
                  </div>
                ) : (
                  <>
                    {sortedPatterns.map(p => {
                      const winCount  = adjustedPatternWinCount.get(p.name) ?? 0;
                      const patternWon = winCount > 0;
                      const proxPct   = patternProximityMap.get(p.name) ?? 0;
                      return (
                        <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                          <div className="gr-pattern-mini">
                            {p.cells.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                          </div>
                          <div className="gr-pattern-info">
                            <span className="name">{p.name}</span>
                            <div className="mini-progress">
                              <i style={{ width: patternWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                            </div>
                            <span className="meta">
                              {patternWon
                                ? `${t('game_room.pattern_completed')} (${winCount})`
                                : proxPct > 0
                                  ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                                  : `${p.cells.filter(Boolean).length} cells`}
                            </span>
                          </div>
                          <div className="gr-pattern-prize">
                            <span className="amt">{p.prize}x</span>
                            <span className="hits">{currencySymbol}</span>
                          </div>
                        </div>
                      );
                    })}
                    {gameCombinations.map(c => {
                      const winCount  = allGameCombinationWinCount.get(c.name) ?? 0;
                      const comboWon  = winCount > 0;
                      const proxPct   = combinationProximityMap.get(c.name) ?? 0;
                      const cells     = combinationCells.get(c.name) ?? new Array(25).fill(0);
                      const myCombo   = [...completedCombinationsPerTicket.values()].some(v => v.some(cc => cc.name === c.name));
                      return (
                        <div key={c.name} className={`gr-pattern gr-pattern--combo${comboWon ? ' is-close' : ''}`}>
                          <div className="gr-pattern-mini">
                            {cells.map((on: number, j: number) => <i key={j} className={on ? 'on' : ''} />)}
                          </div>
                          <div className="gr-pattern-info">
                            <span className="name">
                              {myCombo && <span title={t('game_room.my_combo_badge')}>⭐ </span>}
                              🔗 {c.name}
                            </span>
                            <div className="mini-progress">
                              <i style={{ width: comboWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                            </div>
                            <span className="meta">
                              {comboWon
                                ? `${t('game_room.pattern_completed')} (${winCount})`
                                : proxPct > 0
                                  ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                                  : t('game_room.combo_meta')}
                            </span>
                          </div>
                          <div className="gr-pattern-prize">
                            <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                            <span className="hits">{currencySymbol}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </aside>
          )}

        </div>{/* fim gr-top-row */}

        {/* ── Banners: só renderiza o wrapper quando há pelo menos um ativo ─── */}
        {hasBanners && (
          <div className="gr-banners-row">

            {/* ADR-014: Golden Ball */}
            {goldenBall && (
              <div className="gr-golden-banner" role="status" aria-live="assertive">
                <span className="gr-golden-icon">🌟</span>
                <div className="gr-golden-text">
                  <strong>{t('game_room.golden_ball_title')}</strong>
                  <span>{t('game_room.golden_ball_desc', { ball: goldenBall.ballNum, multiplier: goldenBall.multiplier })}</span>
                </div>
                <span className="gr-golden-mult">×{goldenBall.multiplier}</span>
              </div>
            )}

            {/* ADR-013: Multi-Match stages */}
            {clearedStages.length > 0 && (
              <div className="gr-stages-panel" role="status">
                <span className="gr-stages-title">{t('game_room.stages_title')}</span>
                <div className="gr-stages-list">
                  {clearedStages.map(s => (
                    <div key={s.stage} className="gr-stage-item">
                      <span className="gr-stage-badge">
                        {t('game_room.stage_label', { stage: s.stage })}
                      </span>
                      <span className="gr-stage-count">
                        {t('game_room.stage_winners', { count: s.winners.length })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ADR-014: Game Ended */}
            {isEffectiveGameEnded && (
              <div
                data-testid="gr-ended-overlay"
                className={`gr-ended-banner${playerWinEntries.length > 0 ? ' gr-ended-banner--winner' : ''}`}
                role="status"
                aria-live="polite"
              >
                <span className="gr-ended-icon">
                  {playerWinEntries.length > 0 ? '🏆' : '🏁'}
                </span>
                <div className="gr-ended-text">
                  <strong>{t('game_room.game_ended_title')}</strong>
                  <span>
                    {playerWinEntries.length > 0
                      ? t('game_room.game_ended_you_won')
                      : localWinners.length > 0
                        ? t('game_room.game_ended_winners', { count: localWinners.length })
                        : isStaticFinalState && playerTickets.length === 0
                          ? t('game_room.game_ended_archived')
                          : t('game_room.game_ended_no_winners')}
                  </span>

                  {playerWinEntries.length > 0 && (
                    <div className="gr-ended-breakdown" data-testid="gr-prize-breakdown">
                      {playerWinEntries.map(({ name, total, currency, isCombination }) => (
                        <div key={name} className="gr-ended-breakdown-row" data-testid="gr-prize-breakdown-row">
                          <span className="gr-ended-breakdown-pattern">
                            {isCombination && '🔗 '}{name}
                          </span>
                          <span className="gr-ended-breakdown-prize">
                            {total.toFixed(4)} {currency}
                          </span>
                        </div>
                      ))}
                      {playerWinEntries.length > 1 && (
                        <div className="gr-ended-breakdown-row gr-ended-breakdown-total">
                          <span>{t('game_room.game_ended_total')}</span>
                          <span>
                            {playerWinEntries.reduce((s, e) => s + e.total, 0).toFixed(4)}{' '}
                            {playerWinEntries[0]?.currency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {nextGame && nextGame.status === 'funding' ? (
                    <span className="gr-ended-next">
                      {t('game_room.next_game_funding', { time: nextGameTimer })}
                    </span>
                  ) : (() => {
                    const endMs   = (game?.end_time ?? 0) * 1000;
                    const delayMs = ((room?.metadata as any)?.auto_start_delay_sec ?? 30) * 1000;
                    const estMs   = endMs > 0 ? endMs + delayMs - now : 0;
                    if (estMs > 0) {
                      return (
                        <span className="gr-ended-next">
                          {t('game_room.next_game_soon', { time: fmtCountdown(estMs) })}
                        </span>
                      );
                    }
                    return (
                      <span className="gr-ended-next">{t('game_room.game_ended_next')}</span>
                    );
                  })()}
                </div>
                {nextGame && nextGame.status === 'funding' && (
                  <Button
                    variant="default"
                    size="sm"
                    data-testid="gr-next-game-btn"
                    onClick={onLeave}
                  >
                    {t('game_room.go_to_next')}
                  </Button>
                )}
                {onGoToHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="gr-view-history"
                    onClick={onGoToHistory}
                  >
                    {t('nav.my_history') ?? 'Histórico'}
                  </Button>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <div className="gr-tickets-section" data-testid="gr-my-tickets">
          <div className="gr-tickets-head">
            <span className="title">
              {t('game_room.my_tickets_heading')}
              <span className="count">{playerTickets.length}</span>
            </span>
            {game?.status === 'funding' && ticketPrice && (
              <Button
                variant="default"
                size="sm"
                data-testid="gr-buy-more"
                onClick={() => setShowBuyModal(true)}
              >
                {t('game_room.buy_more')}
              </Button>
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
                      ? new Set(pat.cells.map((req, i) => (req ? i : -1)).filter(i => i !== -1))
                      : null;
                    return (
                      <TicketCard
                        key={ticket.id}
                        ticketId={ticket.id}
                        matrix={ticket.matrix}
                        drawnSet={drawnSet}
                        lastDrawn={lastDrawn}
                        winPattern={winPatternSet}
                        prize={w?.prize ?? null}
                        density={density}
                        patterns={roomPatterns}
                        completedCombinations={completedCombinationsPerTicket.get(ticket.id)}
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

      {/* ── Confetti de vitória ────────────────────────────────────────────── */}
      {isEffectiveGameEnded && playerWinEntries.length > 0 && (
        <div className="gr-confetti-overlay" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="gr-confetti"
              style={{
                left:             `${(i * 4.17) % 100}%`,
                '--dx':           `${Math.round(Math.sin(i * 2.399) * 70)}px`,
                animationDelay:   `${((i * 0.37) % 2.8).toFixed(2)}s`,
                background:       ['#f59e0b','#8b5cf6','#06b6d4','#10b981','#ef4444','#ec4899'][i % 6],
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* ── Chat Floating ──────────────────────────────────────────────────── */}
      {room && (
        <ChatFloating
          roomId={room.room_id}
          roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
          walletAddress={profile.wallet_address}
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
          maxTicketsPerPlayer={room?.max_tickets_per_player}
          roomPriceMin={room?.ticket_price_min}
          roomPriceMax={room?.ticket_price_max}
          roomPriceDefault={room?.ticket_price_default}
          nftTemplateAllowlist={room?.nft_template_allowlist}
        />
      )}
    </div>
  );
}
