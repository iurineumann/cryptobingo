// apps/frontend/src/components/ReplayRoom.tsx
// Orquestrador do replay de partidas encerradas.
// Reusa DrawStage, MatchStats, TicketsGrid da GameRoom + subcomponentes replayroom/.
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useReplay } from '../hooks/useReplay';
import { getCol, BINGO_COLORS, sortTickets, sortPatterns, groupTicketsByCategory } from './ticketUtils';
import type { Pattern } from './ticketUtils';
import DrawStage from './gameroom/DrawStage';
import MatchStats from './gameroom/MatchStats';
import TicketsGrid from './gameroom/TicketsGrid';
import ReplayControls from './replayroom/ReplayControls';
import ReplayPatternsPanel from './replayroom/ReplayPatternsPanel';
import ReplaySummary from './replayroom/ReplaySummary';

interface ReplayRoomProps {
  gameId: string;
  session: Session;
  onLeave: () => void;
}

function formatDateShort(endTime: number): string {
  if (!endTime || endTime <= 0) return '';
  return new Date(endTime * 1000).toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ReplayRoom({ gameId, session, onLeave }: ReplayRoomProps) {
  const { t } = useTranslation();
  const {
    game, tickets, aggregate, revealedBalls, totalBalls,
    isPlaying, isComplete, isLoading, speed, patterns, combinations,
    patternWinCount, combinationWinCount, winners, goldenBall, gameEnded,
    setSpeed, togglePlay, skipToEnd, restart,
  } = useReplay(gameId, session);

  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);

  const [showPatterns, setShowPatterns] = useState(true);
  const [showSummary,  setShowSummary]  = useState(false);
  const density = 'comfortable' as const;

  const lastDrawn = revealedBalls.length > 0 ? revealedBalls[revealedBalls.length - 1] : null;
  const revealedSet = useMemo(() => new Set(revealedBalls), [revealedBalls]);
  const col   = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];
  const currencySymbol = game?.ticket_price?.quantity?.trim().split(' ').pop() ?? 'WAX';

  useEffect(() => {
    if (isComplete && gameEnded) setShowSummary(true);
  }, [isComplete, gameEnded]);

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

  const effectiveBalls = useMemo(
    () => revealedBalls.map((n, i) => ({ order: i + 1, number: n, timestamp: '' })),
    [revealedBalls],
  );

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

  const groupedTickets = useMemo(
    () => groupTicketsByCategory(tickets, revealedSet, patterns, winnerMap, t),
    [tickets, revealedSet, patterns, winnerMap],
  );

  const sortedPatterns = useMemo(
    () => sortPatterns(patterns, tickets, revealedSet, patternWinCount),
    [patterns, tickets, revealedSet, patternWinCount],
  );

  const handleSeek = useCallback((target: number) => {
    restart();
  }, [restart]);

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
        <MatchStats
          totalWagered={game?.total_wagered?.quantity ?? ''}
          sponsorPool={game?.sponsor_pool ?? []}
          drawnCount={revealedBalls.length}
          maxBalls={totalBalls}
        />

        <div className="gr-top-row">
          <DrawStage
            wsStatus="connected"
            drawnNumbers={revealedBalls}
            effectiveBalls={effectiveBalls}
            lastDrawn={lastDrawn}
            col={col}
            color={color}
            maxBalls={totalBalls}
            isDrawing={false}
            stageRef={stageRef}
          />

          <ReplayPatternsPanel
            show={showPatterns}
            patterns={patterns}
            sortedPatterns={sortedPatterns}
            combinations={combinations}
            winners={winners}
            patternWinCount={patternWinCount}
            combinationWinCount={combinationWinCount}
            currencySymbol={currencySymbol}
            onClose={() => setShowPatterns(false)}
            patternsRef={patternsRef}
          />
        </div>

        <ReplayControls
          revealedBalls={revealedBalls}
          totalBalls={totalBalls}
          isPlaying={isPlaying}
          isComplete={isComplete}
          speed={speed}
          setSpeed={setSpeed}
          togglePlay={togglePlay}
          skipToEnd={skipToEnd}
          restart={restart}
          onSeek={handleSeek}
        />

        <ReplaySummary
          show={showSummary}
          isComplete={isComplete}
          totalBalls={totalBalls}
          winners={winners}
          winnerMap={winnerMap}
          currencySymbol={currencySymbol}
          aggregate={aggregate}
          totalWagered={game?.total_wagered?.quantity}
          sponsorPool={game?.sponsor_pool}
          goldenBall={goldenBall}
          gameEnded={gameEnded}
          gameId={gameId}
          onRestart={restart}
          onLeave={onLeave}
          onClose={() => setShowSummary(false)}
        />

        <TicketsGrid
          playerTickets={tickets}
          groupedTickets={groupedTickets}
          loadingGame={isLoading}
          gameStatus={game?.status}
          canBuyMore={false}
          winnerMap={winnerMap}
          patternByName={patternByName}
          drawnSet={revealedSet}
          lastDrawn={lastDrawn}
          roomPatterns={patterns}
          completedCombinationsPerTicket={new Map()}
          goldenBallNum={goldenBall?.ballNum}
          effectiveMultiplier={goldenBall?.multiplier}
          onBuyMore={() => {}}
        />
      </div>
    </div>
  );
}
