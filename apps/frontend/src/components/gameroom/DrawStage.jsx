// apps/frontend/src/components/gameroom/DrawStage.tsx
// Palco do sorteio: bola hero, histórico e barra de progresso.
// Extraído de GameRoom.tsx (Fase 0 refactor, Task 4) — zero mudança de comportamento.
//
// stageRef vem por prop porque o orquestrador precisa dele para o ResizeObserver
// que sincroniza a altura do PatternsPanel com a do stage.
import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCol, BINGO_COLORS } from '../ticketUtils';
import { WS_STATUS_CLASS } from './useGameRoomState';
import { useDrawSound } from './useDrawSound';
export default function DrawStage({ wsStatus, drawnNumbers, effectiveBalls, lastDrawn, col, color, maxBalls, isDrawing, stageRef, }) {
    const { t } = useTranslation();
    const sound = useDrawSound();
    // Refs internos ao palco — controlam a animação de drop da bola hero e o pulso de coluna
    const heroRef = useRef(null);
    const spotRef = useRef(null);
    const prevBall = useRef(null);
    // Efeito unificado: dispara gr-drop no hero, gr-col-pulse no spot e som a cada nova bola.
    // Um único update de prevBall.current evita que um segundo efeito veja o guard já atualizado.
    // O padrão remove→void offsetWidth→add força o browser a reiniciar o keyframe (re-trigger).
    useEffect(() => {
        if (lastDrawn === prevBall.current)
            return;
        prevBall.current = lastDrawn;
        const hero = heroRef.current;
        if (hero) {
            hero.classList.remove('gr-drop');
            void hero.offsetWidth;
            hero.classList.add('gr-drop');
        }
        const spot = spotRef.current;
        if (spot) {
            spot.classList.remove('gr-col-pulse');
            void spot.offsetWidth;
            spot.classList.add('gr-col-pulse');
        }
        // Toca o som de chamada da bola apenas quando há uma bola nova (não no reset para null)
        if (lastDrawn != null)
            sound.playBallCall(col);
        // Depender de sound.playBallCall (estável via useCallback), não do objeto sound (novo a cada
        // render): assim o efeito só roda em mudança de bola; o guard de prevBall barra re-animação
        // quando o usuário liga/desliga o som.
    }, [lastDrawn, col, sound.playBallCall]);
    return (<section ref={stageRef} className={`gr-stage${isDrawing ? ' is-suspense' : ''}`} data-stage-style="spotlight" data-col={col} aria-label="Sorteio em tempo real">
      <div className="gr-stage-header">
        <span className="gr-stage-label">{t('game_room.last_ball_heading')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
          <span className={`cb-status-dot ${WS_STATUS_CLASS[wsStatus] ?? 'cb-status-dot-offline'}`} aria-hidden="true"/>
          <span style={{ fontWeight: 600, color: 'var(--cb-text-secondary)' }}>
            {t('game_room.ball_count', { count: drawnNumbers.length })}
          </span>
          <button type="button" className="gr-sound-toggle" data-testid="gr-sound-toggle" data-on={sound.enabled} onClick={sound.toggle} aria-pressed={sound.enabled} aria-label={t('game_room.sound_toggle_aria')} title={sound.enabled ? t('game_room.sound_on') : t('game_room.sound_off')}>
            <span aria-hidden="true">{sound.enabled ? '🔊' : '🔇'}</span>
          </button>
        </span>
      </div>

      <div className="gr-stage-body">
        <div ref={spotRef} className="gr-stage-spot" style={{ '--ball-color': color }}>
          <div className="gr-ball-halo" aria-hidden="true"/>

          <div ref={heroRef} data-testid="gr-ball-hero" className="gr-ball-hero" role="status" aria-live="polite" aria-atomic="true" aria-label={lastDrawn != null ? t('game_room.hero_ball_aria', { number: lastDrawn, count: drawnNumbers.length }) : t('game_room.hero_ball_waiting')}>
            <div className="ball-surface" aria-hidden="true"/>
            <span className="ball-letter">{col}</span>
            <span className="ball-number" data-testid="gr-ball-hero-number">{lastDrawn ?? '⭐'}</span>
            {lastDrawn != null && (<span className="ball-order">{t('game_room.ball_order', { ordem: drawnNumbers.length })}</span>)}
          </div>

          {lastDrawn != null && (<div className="gr-call" aria-hidden="true">
              <span className="col-tag">{col}</span>
              <span>{lastDrawn}</span>
            </div>)}
        </div>

        {/* Footer: histórico + progress */}
        <div className="gr-stage-footer">
          <div data-testid="gr-ball-history" className="gr-sequence" aria-label={t('game_room.history_aria')}>
            {[...effectiveBalls].reverse().map((ball, idx) => {
            const c = getCol(ball.number);
            const clr = BINGO_COLORS[c];
            return (<div key={ball.order} className={`gr-mini-ball${idx === 0 ? ' latest' : ''}`} style={{ '--ball-color': clr }} title={`${c}${ball.number}`}>
                  {ball.number}
                </div>);
        })}
          </div>
          <div className="gr-progress">
            <div className="gr-progress-row">
              <span>{t('game_room.progress_label')}</span>
              <span className="count">{drawnNumbers.length}/{maxBalls}</span>
            </div>
            <div className="cb-progress-track">
              <div className="cb-progress-fill" style={{ width: `${Math.min((drawnNumbers.length / maxBalls) * 100, 100)}%` }}/>
            </div>
          </div>
        </div>
      </div>
    </section>);
}
//# sourceMappingURL=DrawStage.js.map