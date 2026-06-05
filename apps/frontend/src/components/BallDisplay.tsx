// apps/frontend/src/components/BallDisplay.tsx
// Painel de Slow Reveal — migrado para Tailwind v4 + Design System cb-*.
// Ref: ADR-007, asyncapi.yaml v1.1.0

import { useEffect, useRef } from 'react';
import { useTranslation }   from 'react-i18next';
import type { DrawnBall }    from '../hooks/useSlowReveal';
import type { WinnerPayload } from '../types/events';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface BallDisplayProps {
    gameId:      string;
    drawnBalls:  DrawnBall[];
    lastBall:    DrawnBall | null;
    isDrawing:   boolean;
    winners:     WinnerPayload[];
    isAborted:   boolean;
    abortReason: string | null;
    wsStatus:    'connecting' | 'connected' | 'disconnected' | 'error';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBingoCol(n: number) {
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
}

const COL_BG_VAR: Record<string, string> = {
    B: 'var(--color-bingo-b)',
    I: 'var(--color-bingo-i)',
    N: 'var(--color-bingo-n)',
    G: 'var(--color-bingo-g)',
    O: 'var(--color-bingo-o)',
};

const WS_DOT: Record<string, string> = {
    connecting:   'cb-status-dot cb-status-dot-pending',
    connected:    'cb-status-dot cb-status-dot-live',
    disconnected: 'cb-status-dot cb-status-dot-offline',
    error:        'cb-status-dot cb-status-dot-error',
};

const WS_LABEL_KEY: Record<string, string> = {
    connecting:   'game_room.ws_connecting',
    connected:    'game_room.ws_connected',
    disconnected: 'game_room.ws_disconnected',
    error:        'game_room.ws_error',
};

const PATTERN_LABELS: Record<string, string> = {
    ROW_0: 'Linha 1',       ROW_1: 'Linha 2',
    ROW_2: 'Linha Central', ROW_3: 'Linha 4',
    ROW_4: 'Linha 5',       COL_B: 'Coluna B',
    COL_I: 'Coluna I',      COL_N: 'Coluna N',
    COL_G: 'Coluna G',      COL_O: 'Coluna O',
    DIAG_TL_BR: 'Diagonal ↘', DIAG_TR_BL: 'Diagonal ↙',
};

// ── Componente ───────────────────────────────────────────────────────────────

export default function BallDisplay({
    gameId, drawnBalls, lastBall, isDrawing,
    winners, isAborted, abortReason, wsStatus,
}: BallDisplayProps) {

    const { t }             = useTranslation();
    const ballsEndRef    = useRef<HTMLDivElement>(null);
    const lastBallRef    = useRef<HTMLDivElement>(null);
    const prevLastOrder  = useRef<number | null>(null);

    // Auto-scroll da sequência
    useEffect(() => {
        ballsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [drawnBalls.length]);

    // Anima a bola principal a cada nova bola
    useEffect(() => {
        if (lastBall && lastBall.order !== prevLastOrder.current && lastBallRef.current) {
            prevLastOrder.current = lastBall.order;
            const el = lastBallRef.current;
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
        }
    }, [lastBall?.order]);

    const wsDot  = WS_DOT[wsStatus];
    const wsLabel = t(WS_LABEL_KEY[wsStatus]);

    // ── Estado vazio ─────────────────────────────────────────────────────────
    if (!isDrawing && drawnBalls.length === 0 && winners.length === 0 && !isAborted) {
        return (
            <div className="cb-card mt-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 mb-3 border-b border-[--cb-border-default]">
                    <span className="font-bold text-[--cb-text-primary]">
                        🎱 {t('game_room.real_time_drawing')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[--cb-text-secondary]">
                        <span className={wsDot} aria-hidden="true" />
                        {wsLabel}
                    </span>
                </div>
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-[--cb-text-tertiary]">
                    <span className="text-4xl" aria-hidden="true">⏳</span>
                    <p className="text-sm">{t('game_room.waiting_start')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="cb-card mt-4 space-y-4">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[--cb-border-default]">
                <span className="flex items-center gap-2 font-bold text-[--cb-text-primary]">
                    🎱 {t('game_room.real_time_drawing')} — {t('game_room.breadcrumb_room')} #{gameId}
                    {isDrawing && (
                        <span className="cb-status-dot cb-status-dot-live text-xs font-bold text-[--cb-danger] uppercase tracking-wide"
                              aria-label={t('game_room.badge_live')} />
                    )}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[--cb-text-secondary]">
                    <span className={wsDot} aria-hidden="true" />
                    {wsLabel}
                </span>
            </div>

            {/* ── Banner de Abort ── */}
            {isAborted && (
                <div className="cb-alert cb-alert-error" role="alert" aria-live="assertive">
                    <span className="text-lg" aria-hidden="true">❌</span>
                    <div>
                        <p className="font-bold">{t('game_room.draw_cancelled')}</p>
                        <p className="text-sm mt-0.5 opacity-90">
                            {t('game_room.abort_reason', { reason: abortReason ?? t('common.unknown') })}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Banner de Vencedores ── */}
            {winners.length > 0 && (
                <div
                    className="rounded-xl p-5 text-center border-2 border-[--color-accent-400]"
                    style={{
                        background: 'linear-gradient(135deg, var(--color-accent-900), var(--color-accent-800))',
                        animation: 'cb-winner-glow 2s ease-in-out infinite',
                    }}
                    role="status"
                    aria-live="polite"
                    aria-label="Vencedor encontrado"
                >
                    <p className="text-3xl mb-2" aria-hidden="true">🏆</p>
                    <p className="text-xl font-black text-[--color-accent-300] tracking-wide mb-3">
                        {t('game_room.bingo')}
                    </p>
                    <div className="space-y-2">
                        {winners.map((w, i) => (
                            <div
                                key={i}
                                className="flex flex-wrap items-center justify-center gap-2 bg-black/20 rounded-lg p-2"
                            >
                                <span className="font-bold text-[--color-accent-200] font-mono text-sm">
                                    {w.account}
                                </span>
                                <span className="cb-badge cb-badge-accent text-xs">
                                    {PATTERN_LABELS[w.win_pattern] ?? w.win_pattern}
                                </span>
                                <span className="font-bold text-[--cb-success] text-sm">
                                    {w.payouts.join(' + ')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Bola principal em destaque ── */}
            {lastBall && (
                <div className="flex flex-col items-center gap-2" aria-live="polite" aria-atomic="true">
                    <p className="text-xs text-[--cb-text-tertiary] uppercase tracking-widest">
                        {t('game_room.last_ball_heading')}
                    </p>
                    <div
                        ref={lastBallRef}
                        className="cb-ball cb-ball-lg flex-col relative"
                        style={{
                            background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${COL_BG_VAR[getBingoCol(lastBall.number)]} 80%, white), ${COL_BG_VAR[getBingoCol(lastBall.number)]})`,
                            boxShadow: `0 8px 32px ${COL_BG_VAR[getBingoCol(lastBall.number)]}66, 0 0 0 4px ${COL_BG_VAR[getBingoCol(lastBall.number)]}22`,
                            animation: 'cb-ball-drop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
                        }}
                        aria-label={`Bola ${lastBall.number}, coluna ${getBingoCol(lastBall.number)}, número ${lastBall.order} de 75`}
                    >
                        <span className="text-white/80 text-xs font-bold tracking-widest leading-none">
                            {getBingoCol(lastBall.number)}
                        </span>
                        <span className="text-white font-black leading-none" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)' }}>
                            {lastBall.number}
                        </span>
                        <span className="text-white/60 text-[10px] leading-none mt-0.5">
                            #{lastBall.order}/75
                        </span>
                    </div>
                </div>
            )}

            {/* ── Barra de progresso ── */}
            {drawnBalls.length > 0 && (
                <div>
                    <div className="flex justify-between text-xs text-[--cb-text-tertiary] mb-1.5">
                        <span>{t('game_room.progress_label')}</span>
                        <span className="font-bold text-[--cb-text-primary]">
                            {drawnBalls.length}<span className="font-normal">/75</span>
                        </span>
                    </div>
                    <div
                        className="cb-progress-track"
                        role="progressbar"
                        aria-valuenow={drawnBalls.length}
                        aria-valuemin={0}
                        aria-valuemax={75}
                        aria-label="Progresso do sorteio"
                    >
                        <div
                            className="cb-progress-fill"
                            style={{ width: `${(drawnBalls.length / 75) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Sequência de bolas (mais recente à esquerda, com wrap) ── */}
            {drawnBalls.length > 0 && (
                <div>
                    <p className="text-xs text-[--cb-text-tertiary] mb-2 uppercase tracking-wide">
                        {t('game_room.ball_order')}
                    </p>
                    <div
                        className="flex flex-row-reverse flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1"
                        style={{ scrollbarWidth: 'thin', justifyContent: 'flex-end' }}
                        aria-label="Bolas já sorteadas"
                    >
                        <div ref={ballsEndRef} />
                        {[...drawnBalls].reverse().map((ball) => {
                            const col    = getBingoCol(ball.number);
                            const isLast = ball.order === lastBall?.order;
                            const color  = COL_BG_VAR[col];

                            return (
                                <div
                                    key={ball.order}
                                    className={[
                                        'cb-ball cb-ball-sm transition-all duration-300',
                                        isLast ? 'scale-110 z-10' : 'scale-100',
                                    ].join(' ')}
                                    style={{
                                        background:  isLast ? color : `color-mix(in srgb, ${color} 20%, transparent)`,
                                        color:       isLast ? 'white' : color,
                                        border:      `1.5px solid ${color}`,
                                        boxShadow:   isLast ? `0 0 10px ${color}88` : 'none',
                                        animation:   isLast ? 'cb-ball-drop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
                                    }}
                                    title={`${col}${ball.number} — bola #${ball.order}`}
                                    aria-label={`Bola ${ball.number}`}
                                >
                                    {ball.number}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
