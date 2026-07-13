// apps/frontend/src/components/replayroom/ReplayControls.tsx
// Barra de controle do replay: play/pause, restart, skip, velocidade, seek.
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
const SPEEDS = [0.5, 1, 2, 4, 8];
export default function ReplayControls({ revealedBalls, totalBalls, isPlaying, isComplete, speed, setSpeed, togglePlay, skipToEnd, restart, onSeek, }) {
    const { t } = useTranslation();
    const progressPct = totalBalls > 0 ? (revealedBalls.length / totalBalls) * 100 : 0;
    return (<div className="gr-replay-bar">
      <div className="gr-replay-btn-group">
        <button className="cb-btn cb-btn-primary cb-btn-sm" data-testid="replay-play-btn" onClick={isComplete ? restart : togglePlay} aria-label={isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')} title={isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')}>
          {isPlaying ? t('replay.btn_pause') : isComplete ? t('replay.btn_restart') : t('replay.btn_play')}
        </button>

        {!isComplete && (<button className="cb-btn cb-btn-ghost cb-btn-sm" data-testid="replay-restart-btn" onClick={restart} disabled={revealedBalls.length === 0} title={t('replay.btn_restart')} aria-label={t('replay.btn_restart')}>
            {t('replay.btn_restart')}
          </button>)}

        <button className="cb-btn cb-btn-ghost cb-btn-sm" data-testid="replay-end-btn" onClick={skipToEnd} disabled={isComplete} title={t('replay.btn_end')} aria-label={t('replay.btn_end')}>
          {t('replay.btn_end')}
        </button>
      </div>

      <div className="gr-replay-speed">
        <span className="gr-replay-speed-label">{t('replay.speed')}</span>
        <div className="gr-replay-speed-btns">
          {SPEEDS.map(s => (<button key={s} className={`cb-btn ${speed === s ? 'cb-btn-primary' : 'cb-btn-ghost'} cb-btn-sm gr-replay-speed-btn`} onClick={() => setSpeed(s)} aria-pressed={speed === s} data-testid={`replay-speed-${s}`}>
              {s}×
            </button>))}
        </div>
      </div>

      <div className="gr-replay-counter">
        <span>{revealedBalls.length}/{totalBalls}</span>
        {isComplete && <span className="done"><Check className="size-3 shrink-0"/> {t('replay.complete')}</span>}
      </div>

      {totalBalls > 0 && (<div className="gr-replay-seek">
          <div className="gr-replay-seek-track" data-testid="replay-seek" role="slider" aria-label={t('replay.seek_aria')} aria-valuenow={revealedBalls.length} aria-valuemin={0} aria-valuemax={totalBalls} onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const target = Math.round(ratio * totalBalls);
                if (target === 0)
                    restart();
                else if (target >= totalBalls)
                    skipToEnd();
                else
                    onSeek?.(target);
            }}>
            <div className="gr-replay-seek-fill" style={{ width: `${progressPct}%` }}/>
          </div>
          <span className="gr-replay-seek-label">{Math.round(progressPct)}%</span>
        </div>)}
    </div>);
}
//# sourceMappingURL=ReplayControls.js.map