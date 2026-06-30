// apps/frontend/src/components/replayroom/ReplaySummary.tsx
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Pattern } from '../../components/ticketUtils';
import type { AggregateStats } from '../../hooks/useReplay';
import EventFeed from '../gameroom/EventFeed';
import type { EventFeedWinner } from '../gameroom/EventFeed';
import { fetchGamePrizeTransactions } from '../../services/api';

export interface ReplaySummaryProps {
  show: boolean;
  isComplete: boolean;
  totalBalls: number;
  winners: Array<{ ticket_id: string; patterns: Pattern[] }>;
  winnerMap: Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>;
  currencySymbol: string;
  aggregate: AggregateStats;
  totalWagered?: string;
  sponsorPool?: Array<{ quantity: string }>;
  goldenBall?: { ballNum: number; multiplier: number } | null;
  gameEnded?: boolean;
  gameId?: string;
  onRestart: () => void;
  onLeave: () => void;
  onClose: () => void;
}

export default function ReplaySummary({
  show, isComplete, totalBalls, winners, winnerMap, currencySymbol,
  aggregate, totalWagered, sponsorPool, goldenBall, gameEnded, gameId,
  onRestart, onLeave, onClose,
}: ReplaySummaryProps) {
  const { t } = useTranslation();

  const [prizeWinners, setPrizeWinners] = useState<EventFeedWinner[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(false);

  useEffect(() => {
    if (!gameId || !show) return;
    setPrizesLoading(true);
    fetchGamePrizeTransactions(gameId)
      .then(data => {
        setPrizeWinners(data.items.map(p => ({
          account: p.account,
          pattern_name: p.winLabel,
          status: 'confirmed' as const,
          tx_id: p.transactionId,
          amount: p.amount,
        })));
      })
      .catch(() => { /* silent */ })
      .finally(() => setPrizesLoading(false));
  }, [gameId, show]);

  const myWinning = winnerMap.size > 0;
  const hasBanners = !!goldenBall || gameEnded;

  return (
    <>
      {/* ── Banners (sempre renderizam, independente de show/isComplete) ── */}
      {hasBanners && (
        <div className="gr-banners-row">
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

      {/* ── Summary panel (só aparece quando show e isComplete) ── */}
      {show && isComplete && (
      <div className="gr-replay-summary" data-testid="replay-summary">
        <div className="gr-replay-summary-head">
          <span className={`gr-replay-summary-icon${myWinning ? ' gr-replay-summary-icon--win' : ' gr-replay-summary-icon--end'}`} />
          <div>
            <div className="gr-replay-summary-title">
              {myWinning ? t('replay.replay_summary_won') : t('replay.replay_summary_title')}
            </div>
            <div className="gr-replay-summary-sub">
              {t('replay.replay_summary_balls', { count: totalBalls })}
              {' · '}
              {winners.length > 0
                ? t('replay.replay_summary_winners', { count: winners.length, plural: winners.length !== 1 ? 's' : '' })
                : t('replay.replay_summary_no_winners')}
            </div>
          </div>
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onClose} aria-label="Fechar resumo" style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <X className="size-4 shrink-0" />
          </button>
        </div>

        {/* Stats agregadas da partida */}
        {aggregate.totalTicketsCount > 0 && (
          <div className="gr-replay-summary-stats gr-replay-summary-stats--aggregate">
            <div className="gr-replay-summary-stat">
              <span className="label">{t('replay.total_players', 'Jogadores')}</span>
              <span className="value">{aggregate.totalPlayers}</span>
            </div>
            <div className="gr-replay-summary-stat">
              <span className="label">{t('replay.total_tickets', 'Cartelas')}</span>
              <span className="value">{aggregate.totalTicketsCount}</span>
            </div>
            {totalWagered && (
              <div className="gr-replay-summary-stat">
                <span className="label">{t('replay.total_pot', 'Pote total')}</span>
                <span className="value">{totalWagered}</span>
              </div>
            )}
          </div>
        )}

        {/* Créditos do jogador */}
        {winnerMap.size > 0 && (
          <div className="gr-replay-summary-stats gr-replay-summary-stats--player">
            {[...winnerMap.entries()].slice(0, 5).map(([ticketId, info]) => (
              <div key={ticketId} className="gr-replay-summary-stat">
                <span className="label">{t('game_room.ticket_label', { id: ticketId })}</span>
                <span className="value won">
                  {info.totalPrize.toFixed(4)} {currencySymbol}
                  {info.patternCount > 1 && (
                    <span style={{ fontSize: '0.65rem', marginLeft: '0.25rem', opacity: 0.7 }}>
                      ({info.patternCount} {t('replay.patterns_count', 'padrões')})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="gr-replay-summary-actions">
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onRestart}>
            {t('replay.btn_restart')}
          </button>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={onLeave}>
            {t('replay.back_to_lobby')}
          </button>
        </div>

        {/* ── Prize History ──────────────────────────────────────────── */}
        {gameId && (
          <div style={{ marginTop: '0.5rem' }}>
            <EventFeed
              loading={prizesLoading}
              winners={prizeWinners}
              error={null}
            />
          </div>
        )}
      </div>
      )}
    </>
  );
}
