// apps/frontend/src/components/gameroom/DrawStage.tsx
// Palco do sorteio: bola hero, histórico e barra de progresso.
// Extraído de GameRoom.tsx (Fase 0 refactor, Task 4) — zero mudança de comportamento.
//
// stageRef vem por prop porque o orquestrador precisa dele para o ResizeObserver
// que sincroniza a altura do PatternsPanel com a do stage.

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DrawnBall } from '../../hooks/useSlowReveal';
import { getCol, BINGO_COLORS } from '../ticketUtils';
import { WS_STATUS_CLASS } from './useGameRoomState';

export interface DrawStageProps {
  wsStatus: string;
  drawnNumbers: number[];
  effectiveBalls: DrawnBall[];
  lastDrawn: number | null;
  col: string;
  color: string;
  maxBalls: number;
  /** ref encaminhada para o ResizeObserver que sincroniza altura com o PatternsPanel */
  stageRef: React.RefObject<HTMLElement | null>;
}

export default function DrawStage({
  wsStatus, drawnNumbers, effectiveBalls, lastDrawn,
  col, color, maxBalls, stageRef,
}: DrawStageProps) {
  const { t } = useTranslation();

  // Refs internos ao palco — controlam a animação de drop da bola hero
  const heroRef  = useRef<HTMLDivElement>(null);
  const prevBall = useRef<number | null>(null);

  // Dispara animação gr-drop quando a bola hero muda.
  // O padrão remove→void offsetWidth→add força o browser a reiniciar o keyframe.
  useEffect(() => {
    if (!heroRef.current || lastDrawn === prevBall.current) return;
    prevBall.current = lastDrawn;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [lastDrawn]);

  return (
    <section
      ref={stageRef}
      className="gr-stage"
      data-stage-style="spotlight"
      aria-label="Sorteio em tempo real"
    >
      <div className="gr-stage-header">
        <span className="gr-stage-label">{t('game_room.last_ball_heading')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
          <span className={`cb-status-dot ${WS_STATUS_CLASS[wsStatus] ?? 'cb-status-dot-offline'}`} aria-hidden="true" />
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
          <div data-testid="gr-ball-history" className="gr-sequence" aria-label={t('game_room.history_aria')}>
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
  );
}
