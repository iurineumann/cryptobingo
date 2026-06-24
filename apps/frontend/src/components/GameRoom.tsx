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
import BuyTicketModal from './BuyTicketModal';
import ChatFloating from './chat/ChatFloating';
import GameRoomHeader from './gameroom/GameRoomHeader';
import DrawStage from './gameroom/DrawStage';
import { useGameRoomState } from './gameroom/useGameRoomState';
import PatternsPanel from './gameroom/PatternsPanel';
import PrizePanels from './gameroom/PrizePanels';
import TicketsGrid from './gameroom/TicketsGrid';

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
  const { t } = useTranslation();

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

  // UI puramente local do orquestrador (showPatterns migra para painel na Task 4)
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const density = 'comfortable' as const;

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

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <GameRoomHeader
        gameId={gameId} room={room} game={game}
        effectiveDisplayStatus={effectiveDisplayStatus} gameStatusText={gameStatusText}
        timeRemaining={timeRemaining} isDrawing={isDrawing} isAborted={isAborted}
        ingameBalances={ingameBalances} wsStatus={wsStatus}
        isAdmin={isAdmin} theme={theme}
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
            />
          )}

        </div>{/* fim gr-top-row */}

        {/* ── Banners (golden ball, stages, fim) + confete — extraídos em PrizePanels ── */}
        <PrizePanels
          hasBanners={hasBanners} goldenBall={goldenBall} clearedStages={clearedStages}
          isEffectiveGameEnded={isEffectiveGameEnded} isStaticFinalState={isStaticFinalState}
          playerWinEntries={playerWinEntries} localWinners={localWinners} playerTickets={playerTickets}
          nextGame={nextGame} nextGameTimer={nextGameTimer} game={game} room={room} now={now}
          onLeave={onLeave} onGoToHistory={onGoToHistory}
        />

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <TicketsGrid
          playerTickets={playerTickets} groupedTickets={groupedTickets} loadingGame={loadingGame}
          gameStatus={game?.status} canBuyMore={game?.status === 'funding' && !!ticketPrice}
          winnerMap={winnerMap} patternByName={patternByName} drawnSet={drawnSet} lastDrawn={lastDrawn}
          roomPatterns={roomPatterns} completedCombinationsPerTicket={completedCombinationsPerTicket}
          onBuyMore={() => setShowBuyModal(true)}
        />

      </div>

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
