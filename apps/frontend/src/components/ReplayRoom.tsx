// apps/frontend/src/components/ReplayRoom.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useReplay } from '../hooks/useReplay';
import { getCol, BINGO_COLORS, sortPatterns, groupTicketsByCategory } from './ticketUtils';
import type { Pattern } from './ticketUtils';
import Seo from './Seo';
import DrawStage from './gameroom/DrawStage';
import PatternsPanel from './gameroom/PatternsPanel';
import MatchStats from './gameroom/MatchStats';
import TicketsGrid from './gameroom/TicketsGrid';
import ReplayControls from './replayroom/ReplayControls';
import PrizePanels from './gameroom/PrizePanels';
import { fetchRoom } from '../services/api';
import type { EnrichedRoom } from '../services/api';

interface ReplayRoomProps {
  gameId: string;
  session?: Session | null;
  playerAccount?: string;
  onLeave: () => void;
}

function formatDateShort(endTime: number): string {
  if (!endTime || endTime <= 0) return '';
  return new Date(endTime * 1000).toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ReplayRoom({ gameId, session, playerAccount, onLeave }: ReplayRoomProps) {
  const { t } = useTranslation();
  const {
    game, tickets, aggregate, revealedBalls, totalBalls,
    isPlaying, isComplete, isLoading, speed, patterns, combinations,
    patternWinCount, combinationWinCount, winners, goldenBall, gameEnded,
    setSpeed, togglePlay, skipToEnd, restart,
  } = useReplay(gameId, session, playerAccount);

  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);

  const [showPatterns, setShowPatterns] = useState(true);
  const density = 'comfortable' as const;

  const lastDrawn = revealedBalls.length > 0 ? revealedBalls[revealedBalls.length - 1] : null;
  const revealedSet = useMemo(() => new Set(revealedBalls), [revealedBalls]);
  const col   = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];
  const currencySymbol = game?.ticket_price?.quantity?.trim().split(' ').pop() ?? 'WAX';

  // Auto-skip ao fim quando a partida esta completa (archived/drawn)
  // Assim o usuario ja ve o estado final com cartelas, padroes e premios.
  const hasSkipped = useRef(false);
  useEffect(() => {
    if (!isLoading && !hasSkipped.current && gameEnded && revealedBalls.length < totalBalls) {
      skipToEnd();
      hasSkipped.current = true;
    }
  }, [isLoading, gameEnded, revealedBalls.length, totalBalls, skipToEnd]);

  // Buscar Room da partida via game.room_id on-chain
  const [room, setRoom] = useState<EnrichedRoom | null>(null);
  useEffect(() => {
    const rid = (game as any)?.room_id;
    if (!rid) return;
    let cancelled = false;
    fetchRoom(String(rid)).then(r => { if (!cancelled) setRoom(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [game]);

  // localWinners = TODOS vencedores
  const allLocalWinners = useMemo(() => {
    const result: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }> = [];
    for (const w of winners) {
      for (const p of w.patterns) {
        result.push({
          ticket_id: w.ticket_id,
          win_pattern: p.name,
          payouts: [p.prize + ' ' + currencySymbol],
        });
      }
    }
    return result;
  }, [winners, currencySymbol]);

  // playerWinEntries = entradas POR PADRAO (nao agregado por currency)
  // PrizePanels mostra cada padrao com seu premio.
  const playerWinEntries = useMemo(() => {
    const playerTicketsSet = new Set(tickets.map(t => t.id));
    const entries: Array<{ name: string; total: number; currency: string; precision: number; isCombination: boolean; goldenMultiplier?: number }> = [];
    for (const w of winners) {
      if (!playerTicketsSet.has(w.ticket_id)) continue;
      for (const p of w.patterns) {
        const isCombo = combinations.some(c => c.name === p.name);
        entries.push({
          name: p.name,
          total: parseFloat(p.prize) || 0,
          currency: currencySymbol,
          precision: (game?.ticket_price?.quantity?.split('.')[1] ?? '').length || 4,
          isCombination: isCombo,
        });
      }
    }
    return entries;
  }, [winners, tickets, currencySymbol, game, combinations]);

  // Maps para PatternsPanel
  const patternProximityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of patterns) {
      map.set(p.name, patternWinCount.get(p.name) ?? 0 > 0 ? 1 : 0);
    }
    return map;
  }, [patterns, patternWinCount]);

  const combinationProximityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of combinations) {
      map.set(c.name, combinationWinCount.get(c.name) ?? 0 > 0 ? 1 : 0);
    }
    return map;
  }, [combinations, combinationWinCount]);

  const combinationCells = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const c of combinations) {
      const matching = patterns.find(p => p.name === c.name || c.name.includes(p.name));
      if (matching) {
        map.set(c.name, matching.cells.map(on => on ? 1 : 0));
      }
    }
    return map;
  }, [combinations, patterns]);

  const completedCombinationsPerTicket = useMemo(() => {
    const map = new Map<string, Array<{ name: string; weight: number }>>();
    for (const w of winners) {
      const combos: Array<{ name: string; weight: number }> = [];
      for (const p of w.patterns) {
        const found = combinations.find(c => c.name === p.name);
        if (found) combos.push({ name: found.name, weight: found.weight });
      }
      if (combos.length > 0) map.set(w.ticket_id, combos);
    }
    return map;
  }, [winners, combinations]);

  const adjustedPatternWinCount = patternWinCount;

  // winnerMap, patternByName, groupedTickets, sortedPatterns
  const winnerMap = useMemo(() => {
    const map = new Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>();
    for (const w of winners) {
      const patternsOnTicket = new Map<string, boolean>();
      for (const p of w.patterns) {
        const existing = map.get(w.ticket_id);
        const prizeVal = parseFloat(p.prize) || 0;
        if (existing) {
          existing.patternCount++;
          existing.totalPrize += prizeVal;
          if (!patternsOnTicket.has(p.name)) {
            patternsOnTicket.set(p.name, true);
          }
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
    () => groupTicketsByCategory(tickets, revealedSet, patterns, winnerMap, undefined, t),
    [tickets, revealedSet, patterns, winnerMap],
  );

  const sortedPatternsMemo = useMemo(
    () => sortPatterns(patterns, tickets, revealedSet, patternWinCount),
    [patterns, tickets, revealedSet, patternWinCount],
  );

  const handleSeek = useCallback((target: number) => { restart(); }, [restart]);

  const effectiveBalls = useMemo(
    () => revealedBalls.map((n, i) => ({ order: i + 1, number: n, timestamp: '' })),
    [revealedBalls],
  );

  // ResizeObserver: patternsPanel.maxHeight = DrawStage.height
  // Igual ao GameRoom — observa o stage e aplica no panelRef (patternsRef)
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
      {/* CSS especifico do replay — nao modifica componentes do GameRoom */}
      <style>{`
        [data-testid="replay-page"] .gr-patterns {
          max-height: calc(100vh - 220px);
        }
      `}</style>
      <Seo title="Replay" description="Reveja partidas de Bingo on-chain na CryptoBingo. Sorteios, padrões e resultados completos." />
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
          >◈ {t('replay.show_patterns')}</button>
        )}
      </header>

      <div className={`gr-main gr-${density}`}>
        <div className="gr-top-row">
          <DrawStage
            wsStatus="connected" drawnNumbers={revealedBalls} effectiveBalls={effectiveBalls}
            lastDrawn={lastDrawn} col={col} color={color} maxBalls={totalBalls}
            isDrawing={false} stageRef={stageRef}
          />

          {showPatterns && (
            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', minHeight: 0 }}>
              <PatternsPanel
                loadingGame={isLoading} roomPatterns={patterns} sortedPatterns={sortedPatternsMemo}
                gameCombinations={combinations} adjustedPatternWinCount={adjustedPatternWinCount}
                allGameCombinationWinCount={combinationWinCount}
                patternProximityMap={patternProximityMap} combinationProximityMap={combinationProximityMap}
                combinationCells={combinationCells}
                completedCombinationsPerTicket={completedCombinationsPerTicket}
                currencySymbol={currencySymbol} onClose={() => setShowPatterns(false)}
                panelRef={patternsRef} playerTickets={tickets} drawnSet={revealedSet}
              />
            </div>
          )}
        </div>

        <MatchStats
          totalWagered={game?.total_wagered?.quantity ?? ''}
          sponsorPool={game?.sponsor_pool ?? []}
          drawnCount={revealedBalls.length} maxBalls={totalBalls}
        />

        <ReplayControls
          revealedBalls={revealedBalls} totalBalls={totalBalls}
          isPlaying={isPlaying} isComplete={isComplete}
          speed={speed} setSpeed={setSpeed} togglePlay={togglePlay}
          skipToEnd={skipToEnd} restart={restart} onSeek={handleSeek}
        />

        {(isComplete || gameEnded) && (
          <PrizePanels
            gameId={gameId} hasBanners={!!goldenBall || gameEnded}
            goldenBall={goldenBall} goldenMultiplierProgress={null} clearedStages={[]}
            isEffectiveGameEnded={gameEnded} isStaticFinalState={isComplete}
            playerWinEntries={playerWinEntries} localWinners={allLocalWinners}
            playerTickets={tickets} nextGame={null} nextGameTimer={''}
            game={game} room={room} now={Date.now()} onLeave={onLeave}
          />
        )}

        <TicketsGrid
          playerTickets={tickets} groupedTickets={groupedTickets} loadingGame={isLoading}
          gameStatus={game?.status} canBuyMore={false}
          winnerMap={winnerMap} patternByName={patternByName} drawnSet={revealedSet}
          lastDrawn={lastDrawn} roomPatterns={patterns}
          completedCombinationsPerTicket={completedCombinationsPerTicket}
          goldenBallNum={goldenBall?.ballNum} effectiveMultiplier={goldenBall?.multiplier}
          onBuyMore={() => {}} localWinners={allLocalWinners}
        />
      </div>
    </div>
  );
}
