// apps/frontend/src/components/GameRoom.tsx
// Sala de jogo ao vivo — bola hero, histórico, cartelas do jogador, painel de padrões.
// Conecta ao WebSocket via useSlowReveal e busca o estado do jogo via RPC.
//
// Design: classes gr-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import BuyTicketModal from './BuyTicketModal';
import RoomSocial from './gameroom/RoomSocial';
import Seo from './Seo';

import GameRoomHeader from './gameroom/GameRoomHeader';
import DrawStage from './gameroom/DrawStage';
import { useGameRoomState } from './gameroom/useGameRoomState';
import { useRoomSocial } from '../hooks/useRoomSocial';
import PatternsPanel from './gameroom/PatternsPanel';
import PrizePanels from './gameroom/PrizePanels';
import TicketsGrid from './gameroom/TicketsGrid';
import MatchStats from './gameroom/MatchStats';
import { sumPayoutsByCurrency, countWinners } from './gameroom/prizeFormat';
import { getEffectiveExplorerUrl } from '../utils/explorerStore';
import { trackEvent } from '~/services/analytics';

// ==========================================
// TIPOS
// ==========================================

interface GameRoomProps {
  readonly gameId:            string;
  readonly roomId?:           string;
  readonly session:           Session;
  readonly profile:           MongoUserProfile;
  readonly onLeave:           () => void;
  readonly onGoToHistory?:    () => void;
  readonly onGoToWallet?:     () => void;
  readonly onGoToAdmin?:      () => void;
  readonly isAdmin?:          boolean;
  readonly onLogout?:         () => void;
  readonly theme?:            'dark' | 'light';
  readonly onToggleTheme?:    () => void;
  readonly onLanguageChange?: (locale: string) => void;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function GameRoom({
  gameId, roomId, session, profile, onLeave,
  onGoToHistory, onGoToWallet, onGoToAdmin, isAdmin,
  onLogout, theme, onToggleTheme, onLanguageChange,
}: GameRoomProps) {
  // ── Estado/efeitos/derivações vivem no hook (Fase 0 do refactor) ──────────
  const { t } = useTranslation();
  const state = useGameRoomState({ gameId, roomId, session });
  const {
    game, nextGame, playerTickets, room, loadingGame, maxBalls, gamePatterns,
    gameCombinations, ingameBalances, isDrawing, isAborted,
    wsStatus, goldenBall, goldenMultiplierProgress, clearedStages, effectiveBalls, drawnNumbers, drawnSet,
    lastDrawn, isEffectiveGameEnded, effectiveDisplayStatus, gameStatusText,
    timeRemaining, nextGameTimer, localWinners, winnerMap, patternByName,
    playerWinEntries, adjustedPatternWinCount, allGameCombinationWinCount,
    completedCombinationsPerTicket, combinationCells, patternProximityMap,
    combinationProximityMap, sortedPatterns, groupedTickets, currencySymbol,
    ticketPrice, col, color, hasBanners, now, loadGame, isStaticFinalState,
    prizeStatuses, drawMode, gameStages,
  } = state;
  const roomPatterns = gamePatterns;

  // ── Social ao vivo: presença online, reações efêmeras (Fase 4) ────────────
  const { onlineCount, reactions, sendReaction } = useRoomSocial({
    roomId: room?.room_id ?? '',
  });

  // UI puramente local do orquestrador (showPatterns migra para painel na Task 4)
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const density = 'comfortable' as const;

  // ── Resumo global de prêmios pagos pela sala (todos vencedores) ──────────
  const roomPrize = useMemo(() => {
    const all = localWinners.flatMap(w => w.payouts);
    const sums = sumPayoutsByCurrency(all);
    if (sums.length === 0) return null;
    const total = sums.map(s => `${s.total.toFixed(4)} ${s.symbol}`).join(' + ');
    return { total, count: countWinners(localWinners) };
  }, [localWinners]);

  // ── Feed de eventos: vencedores + prizeStatuses — usa localWinners p/ cobrir
  // jogos arquivados onde WS não re-emite eventos. Para jogos ao vivo localWinners = winners.
  const feedWinners = useMemo(() =>
    (localWinners ?? []).map(w => {
      const ps = prizeStatuses?.[`${w.ticket_id}:${w.win_pattern}`];
      return {
        account: (w as any).account ?? '',
        ticket_id: w.ticket_id,
        pattern_name: w.win_pattern,
        status: ps?.status ?? 'preparing',
        tx_id: ps?.tx_id,
        amount: ps?.amount,
        currency: ps?.currency ?? '',
      };
    }),
    [localWinners, prizeStatuses],
  );

  const explorerUrl = getEffectiveExplorerUrl();
  // Agrupa winners por padrão/estágio

  // ── Analytics: win event (F0C.7) ──────────────────────────────────────────
  const winTracked = useRef(false);
  useEffect(() => {
    if (winnerMap.size > 0 && isEffectiveGameEnded && !winTracked.current) {
      winTracked.current = true;
      const totalPrize = [...winnerMap.values()].reduce((s, w) => s + (w.totalPrize ?? 0), 0);
      trackEvent('win', {
        game_id: gameId,
        amount: totalPrize,
        tickets: winnerMap.size,
      });
    }
  }, [winnerMap, isEffectiveGameEnded, gameId]);
  const groupedWinners = useMemo(() => {
    const groups = new Map<string, typeof feedWinners>();
    for (const w of feedWinners) {
      const arr = groups.get(w.pattern_name) ?? [];
      arr.push(w);
      groups.set(w.pattern_name, arr);
    }
    return [...groups.entries()];
  }, [feedWinners]);

  // ── Refs de layout ────────────────────────────────────────────────────────
  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);

  // Sincroniza altura do patterns com a do stage (ResizeObserver cruza os dois refs)
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

  return (
    <div className="gr-shell">
      <Seo title="Sala de Jogo" description="Partida ao vivo de Bingo on-chain na CryptoBingo. Acompanhe os sorteios e veja os resultados em tempo real." />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <GameRoomHeader
        gameId={gameId} room={room} game={game}
        effectiveDisplayStatus={effectiveDisplayStatus} gameStatusText={gameStatusText}
        timeRemaining={timeRemaining} isDrawing={isDrawing} isAborted={isAborted}
        ingameBalances={ingameBalances} wsStatus={wsStatus}
        isAdmin={isAdmin} theme={theme}
        onlineCount={onlineCount}
        onLeave={onLeave} onGoToHistory={onGoToHistory} onGoToWallet={onGoToWallet}
        onGoToAdmin={onGoToAdmin} onToggleTheme={onToggleTheme} onLogout={onLogout}
        onLanguageChange={onLanguageChange}
      />

      {/* ── Grid principal ──────────────────────────────────────────────────── */}
      <div className={`gr-main gr-${density}`}>

        {/* ── Linha superior: stage + patterns lado a lado ───────────────────── */}
        <div className="gr-top-row">

          {/* ── Stage ────────────────────────────────────────────────────────── */}
          <DrawStage
            wsStatus={wsStatus}
            drawnNumbers={drawnNumbers}
            effectiveBalls={effectiveBalls}
            lastDrawn={lastDrawn}
            col={col}
            color={color}
            maxBalls={maxBalls}
            isDrawing={isDrawing}
            stageRef={stageRef}
          />

          {/* ── Painel de Padrões ──────────────────────────────────────────────── */}
          {showPatterns && (
            <PatternsPanel
              loadingGame={loadingGame} roomPatterns={roomPatterns} sortedPatterns={sortedPatterns}
              gameCombinations={gameCombinations} adjustedPatternWinCount={adjustedPatternWinCount}
              allGameCombinationWinCount={allGameCombinationWinCount}
              patternProximityMap={patternProximityMap} combinationProximityMap={combinationProximityMap}
              combinationCells={combinationCells} completedCombinationsPerTicket={completedCombinationsPerTicket}
              currencySymbol={currencySymbol} onClose={() => setShowPatterns(false)} panelRef={patternsRef}
              drawMode={drawMode} gameStages={gameStages} clearedStages={clearedStages}
              playerTickets={playerTickets} drawnSet={drawnSet}
            />
          )}

        </div>{/* fim gr-top-row */}

        {/* ── Banners (golden ball, stages, fim) + confete — extraídos em PrizePanels ── */}
        <PrizePanels
          gameId={gameId} hasBanners={hasBanners} goldenBall={goldenBall} goldenMultiplierProgress={goldenMultiplierProgress}
          clearedStages={clearedStages}
          isEffectiveGameEnded={isEffectiveGameEnded} isStaticFinalState={isStaticFinalState}
          playerWinEntries={playerWinEntries} localWinners={localWinners} playerTickets={playerTickets}
          nextGame={nextGame} nextGameTimer={nextGameTimer} game={game} room={room} now={now}
          onLeave={onLeave} onGoToHistory={onGoToHistory}
        />

        {/* ── Faixa de dados: pote, bônus patrocinado e bolas ──────────────── */}
        <MatchStats
          totalWagered={game?.total_wagered?.quantity ?? ''}
          sponsorPool={game?.sponsor_pool ?? []}
          drawnCount={drawnNumbers.length}
          maxBalls={maxBalls}
        />

        {/* ── Painel de resultados globais (acima das cartelas) ─────────────── */}
        {groupedWinners.length > 0 && (
          <div className="gr-room-prizes" data-testid="gr-room-prizes">
            <span className="gr-room-prizes-summary">
              {t('game_room.room_prizes_summary', {
                total: roomPrize?.total ?? '0',
                count: roomPrize?.count ?? feedWinners.length,
              })}
            </span>
            <div className="gr-room-prizes-groups" style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {groupedWinners.map(([patternName, entries]) => {
                const stageMatch = patternName.match(/^stage_(\d+)$/);
                const dispName = stageMatch
                  ? t('game_room.stage_label', { stage: parseInt(stageMatch[1], 10) })
                  : patternName;
                return (
                  <div key={patternName} className="gr-room-prizes-group">
                    <span className="gr-room-prizes-group-title">{dispName}</span>
                    {entries.map((w, idx) => (
                      <div key={`${w.ticket_id}-${idx}`} className="gr-room-prizes-row">
                        <span className="gr-room-prizes-ticket">{w.ticket_id}</span>
                        <span className="gr-room-prizes-meta">
                          <span className="gr-room-prizes-user">{w.account}</span>
                          <span className="gr-room-prizes-sep">:</span>
                          <span className="gr-room-prizes-amount">{w.amount ?? '—'} {w.currency}</span>
                          {w.status === 'preparing' && (
                            <span className="gr-room-prizes-status" title={t('game_room.prize_preparing')}>
                              <span className="cb-spinner" style={{ width: '0.6rem', height: '0.6rem', display: 'inline-block', borderWidth: '1.5px' }} />
                            </span>
                          )}
                          {w.status === 'confirming' && (
                            <span className="gr-room-prizes-status" title={t('game_room.prize_confirming')}>
                              <span className="cb-spinner" style={{ width: '0.6rem', height: '0.6rem', display: 'inline-block', borderWidth: '1.5px' }} />
                            </span>
                          )}
                          {w.status === 'confirmed' && w.tx_id && (
                            <a
                              href={`${explorerUrl}/transaction/${w.tx_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="gr-room-prizes-link"
                              title={t('game_room.prize_confirmed')}
                            >
                              🔗
                            </a>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <TicketsGrid
          playerTickets={playerTickets} groupedTickets={groupedTickets} loadingGame={loadingGame}
          gameStatus={game?.status} canBuyMore={game?.status === 'funding' && !!ticketPrice}
          winnerMap={winnerMap} patternByName={patternByName} drawnSet={drawnSet} lastDrawn={lastDrawn}
          roomPatterns={roomPatterns} completedCombinationsPerTicket={completedCombinationsPerTicket}
          goldenBallNum={goldenBall?.ballNum ?? undefined}
          effectiveMultiplier={goldenBall?.multiplier ?? undefined}
          onBuyMore={() => setShowBuyModal(true)}
          localWinners={localWinners}
        />

      </div>

      {/* ── Social: presença, reações flutuantes e chat ── */}
      <RoomSocial
        room={room}
        walletAddress={profile.wallet_address}
        onlineCount={onlineCount}
        reactions={reactions}
        sendReaction={sendReaction}
      />

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
