// apps/frontend/src/components/gameroom/PrizePanels.tsx
// Banners de resultado (golden ball, stages, fim de jogo + breakdown de prêmios)
// e confete de vitória — extraídos da GameRoom.tsx na Fase 0 do refactor.
//
// Agrupados em fragmento para manter o gr-confetti-overlay (position:fixed) renderizando
// corretamente independente da posição no DOM.
//
// Ref: ADR-013 (Multi-Match), ADR-014 (Golden Ball / Game Ended)

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockchainGameState } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../../services/api';
import type { GoldenBallInfo, GoldenMultiplierProgress, ClearedStage } from '../../hooks/useSlowReveal';
import { Button } from '@/components/ui/button';
import { sumPayoutsByCurrency, countWinners } from './prizeFormat';
import { ShareWinButton } from './ShareWinButton';

// Helper puro — formata ms para contagem regressiva legível (ex: "2m 30s")
function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const secPart = s % 60 > 0 ? `${s % 60}s` : '';
  return `${Math.floor(s / 60)}m ${secPart}`.trim();
}

/** Traduz nome de estágio raw (stage_N) para i18n. Fallback p/ nome original. */
function fmtStageName(t: ReturnType<typeof useTranslation>['t'], name: string): string {
  const m = name.match(/^stage_(\d+)$/);
  if (m) return t('game_room.stage_label', { stage: parseInt(m[1], 10) });
  return name;
}

// S3358: extrair nested ternary para função legível
function getEndedStatusText(
  playerWinEntries: { length: number },
  localWinners: { length: number },
  isStaticFinalState: boolean,
  playerTickets: { length: number },
  t: (key: string, opts?: any) => string,
): string {
  if (playerWinEntries.length > 0) return t('game_room.game_ended_you_won');
  if (localWinners.length > 0) return t('game_room.game_ended_winners', { count: localWinners.length });
  if (isStaticFinalState && playerTickets.length === 0) return t('game_room.game_ended_archived');
  return t('game_room.game_ended_no_winners');
}

export interface PrizePanelsProps {
  readonly gameId: string;
  readonly hasBanners: boolean;
  readonly goldenBall: GoldenBallInfo | null;
  readonly goldenMultiplierProgress: GoldenMultiplierProgress | null;
  readonly clearedStages: ClearedStage[];
  readonly isEffectiveGameEnded: boolean;
  readonly isStaticFinalState: boolean;
  readonly playerWinEntries: Array<{ name: string; total: number; currency: string; isCombination: boolean; goldenMultiplier?: number }>;
  readonly localWinners: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }>;
  readonly playerTickets: Array<{ id: string; matrix: number[] }>;
  readonly nextGame: BlockchainGameState | null;
  readonly nextGameTimer: string;
  readonly game: BlockchainGameState | null;
  readonly room: EnrichedRoom | null;
  readonly now: number;
  readonly onLeave: () => void;
  readonly onGoToHistory?: () => void;
}

export default function PrizePanels({
  gameId, hasBanners, goldenBall, goldenMultiplierProgress, clearedStages,
  isEffectiveGameEnded, isStaticFinalState,
  playerWinEntries, localWinners, playerTickets,
  nextGame, nextGameTimer, game, room, now,
  onLeave, onGoToHistory,
}: PrizePanelsProps): React.JSX.Element | null {
  const { t } = useTranslation();

  const hasConfetti = isEffectiveGameEnded && playerWinEntries.length > 0;

  // Soma dos prêmios pagos pela sala (todos os vencedores), derivado de localWinners
  const roomPrize = (() => {
    const all = localWinners.flatMap(w => w.payouts);
    const sums = sumPayoutsByCurrency(all);
    if (sums.length === 0) return null;
    const total = sums.map(s => `${s.total.toFixed(4)} ${s.symbol}`).join(' + ');
    return { total, count: countWinners(localWinners) };
  })();

  // Nada a renderizar: sem banners nem confete
  if (!hasBanners && !hasConfetti) return null;

  return (
    <>
      {/* ── Banners: só renderiza o wrapper quando há pelo menos um ativo ─── */}
      {hasBanners && (
        <div className="gr-banners-row">

          {/* ADR-014: Golden Ball */}
          {goldenBall && (
            <output className="gr-golden-banner" aria-live="assertive">
              <span className="gr-golden-icon">🌟</span>
              <div className="gr-golden-text">
                <strong>{t('game_room.golden_ball_title')}</strong>
                <span>{t('game_room.golden_ball_desc', { ball: goldenBall.ballNum, multiplier: goldenBall.multiplier })}</span>
              </div>
              <span className="gr-golden-mult">×{goldenBall.multiplier}</span>
            </output>
          )}

          {/* ADR-014: Golden Ball multiplier progress (animação) */}
          {goldenBall && goldenMultiplierProgress && !goldenMultiplierProgress.isFinal && (
            <output className="gr-multiplier-progress" aria-live="polite">
              <span className="gr-multiplier-icon">✨</span>
              <div className="gr-multiplier-text">
                <strong>{t('game_room.multiplier_title')}</strong>
                <span>{t('game_room.multiplier_progress', { multiplier: goldenMultiplierProgress.multiplier })}</span>
              </div>
            </output>
          )}

          {/* ADR-013: Multi-Match stages */}
          {clearedStages.length > 0 && (
            <output className="gr-stages-panel">
              <span className="gr-stages-title">{t('game_room.stages_title')}</span>
              <div className="gr-stages-list">
                {clearedStages.map(s => (
                  <div key={s.stage} className="gr-stage-item">
                    <span className="gr-stage-badge">
                      {t('game_room.stage_label', { stage: s.stage })}
                    </span>
                    {s.winningBall && (
                      <span className="gr-stage-ball">
                        🎱 {s.winningBall}
                      </span>
                    )}
                    <span className="gr-stage-count">
                      {t('game_room.stage_winners', { count: s.winners.length })}
                    </span>
                  </div>
                ))}
              </div>
            </output>
          )}

          {/* ADR-014: Game Ended */}
          {isEffectiveGameEnded && (
            <output
              data-testid="gr-ended-overlay"
              className={`gr-ended-banner${playerWinEntries.length > 0 ? ' gr-ended-banner--winner' : ''}`}
              aria-live="polite"
            >
              <span className="gr-ended-icon">
                {playerWinEntries.length > 0 ? '🏆' : '🏁'}
              </span>
              <div className="gr-ended-text">
                <strong>{t('game_room.game_ended_title')}</strong>
                <span>
                  {getEndedStatusText(playerWinEntries, localWinners, isStaticFinalState, playerTickets, t)}
                </span>

                {playerWinEntries.length > 0 && (
                  <div className="gr-ended-breakdown" data-testid="gr-prize-breakdown">
                    <div className="gr-ended-breakdown-title">{t('game_room.player_prizes_title')}</div>
                    {playerWinEntries.map(({ name, total, currency, isCombination, goldenMultiplier }) => (
                      <div key={`${name}${goldenMultiplier !== undefined ? '-gld' : ''}`} className="gr-ended-breakdown-row" data-testid="gr-prize-breakdown-row">
                        <span className="gr-ended-breakdown-pattern">
                          {isCombination && '🔗 '}{fmtStageName(t, name)}
                          {goldenMultiplier !== undefined && (
                            <span className="gr-golden-badge-inline" data-testid="gr-golden-badge-inline">
                              ×{goldenMultiplier}
                            </span>
                          )}
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

                {playerWinEntries.length > 0 && (
                  <ShareWinButton
                    amount={playerWinEntries.reduce((s, e) => s + e.total, 0)}
                    gameId={gameId}
                    gameUrl={`${window.location.origin}/game/${gameId}`}
                  />
                )}

                {roomPrize && (
                  <div className="gr-room-prizes" data-testid="gr-room-prizes">
                    <span>{t('game_room.room_prizes_summary', { total: roomPrize.total, count: roomPrize.count })}</span>
                  </div>
                )}

                {nextGame?.status === 'funding' ? (
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
              {nextGame?.status === 'funding' && (
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
            </output>
          )}

        </div>
      )}

      {/* ── Confetti de vitória ─────────────────────────────────────────────
          position:fixed — a posição no DOM não afeta o layout visual        */}
      {hasConfetti && (
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
    </>
  );
}
