// apps/frontend/src/components/TicketCard.tsx
// Componente de cartela 5×5. Apenas exporta o componente React
// para compatibilidade com o Fast Refresh do Vite.
// Utilitários, tipos e funções assíncronas estão em ticketUtils.ts

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BINGO_COLORS, COLS, type Pattern, computeTicketNearMiss } from './ticketUtils';
import { Star, Link2 } from 'lucide-react';

interface CompletedComboInfo {
  name:   string;
  weight: number; // hundredths (100 = 1.00x)
}

interface TicketCardProps {
  ticketId:               string;
  matrix:                 number[];
  drawnSet:               Set<number>;
  lastDrawn:              number | null;
  winPattern:             Set<number> | null;
  prize:                  string | null;
  density:                'comfortable' | 'compact';
  patterns:               Pattern[];
  completedCombinations?: CompletedComboInfo[];
  pricePaid?:             string;  // preço pago por esta cartela (ADR-010)
  goldenBallNum?:         number;  // nº da golden ball, se ativa
  effectiveMultiplier?:   number;  // multiplicador golden aplicado
}

export function TicketCard({
  ticketId, matrix, drawnSet, lastDrawn, winPattern,
  prize, density, patterns, completedCombinations, pricePaid,
  goldenBallNum, effectiveMultiplier,
}: TicketCardProps) {
  const { t } = useTranslation();

  const grid = useMemo(() => {
    const B    = matrix.slice(0, 5);
    const I    = matrix.slice(5, 10);
    const Nraw = matrix.slice(10, 14);
    const G    = matrix.slice(14, 19);
    const O    = matrix.slice(19, 24);
    const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
    return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
  }, [matrix]);

  const markedCount = useMemo(
    () => matrix.filter(n => drawnSet.has(n)).length + 1,
    [matrix, drawnSet],
  );

  const { completedPatterns, winningCells } = useMemo(() => {
    const isCellMarked = (i: number) => {
      const val = grid[Math.floor(i / 5)][i % 5];
      return val === null || drawnSet.has(val as number);
    };
    const completed = patterns.filter(p =>
      p.cells.every((req, i) => !req || isCellMarked(i))
    );
    const winning = new Set<number>();
    completed.forEach(p => p.cells.forEach((req, i) => { if (req) winning.add(i); }));
    if (winPattern) winPattern.forEach(i => winning.add(i));
    return { completedPatterns: completed, winningCells: winning };
  }, [grid, drawnSet, patterns, winPattern]);

  const nearMiss = useMemo(
    () => computeTicketNearMiss(matrix, drawnSet, patterns),
    [matrix, drawnSet, patterns],
  );

  const isWinner    = winPattern !== null || completedPatterns.length > 0;
  const isClose     = !isWinner && markedCount >= (density === 'compact' ? 20 : 18);
  const showNearMiss = !isWinner && nearMiss.patternsOneAway > 0;
  const isGoldenWinner = isWinner && goldenBallNum !== undefined &&
    [...winningCells].some(gridIdx => {
      const r = Math.floor(gridIdx / 5);
      const c = gridIdx % 5;
      return grid[r][c] === goldenBallNum;
    });

  return (
    <article
      data-testid={`gr-ticket-${ticketId}`}
      className={[
        'gr-ticket',
        isWinner    ? 'is-winner'   : '',
        isClose     ? 'is-close'    : '',
        showNearMiss ? 'is-near-miss' : '',
        !isWinner && !isClose && markedCount < 3 ? 'is-dimmed' : '',
        isGoldenWinner ? 'is-golden-winner' : '',
      ].filter(Boolean).join(' ')}
      aria-label={isWinner ? t('game_room.ticket_winner_aria', { id: ticketId }) : t('game_room.ticket_aria', { id: ticketId })}
    >
      <div className="gr-ticket-header">
        <div className="gr-ticket-id">
          <span className="label">{t('game_room.ticket_label', { id: ticketId })}</span>
        </div>
        <span className={`gr-ticket-marks${isWinner ? ' is-winner' : isClose ? ' is-close' : ''}`}>
          {isWinner ? t('game_room.winner_badge') : `${markedCount}/25`}
        </span>
          {showNearMiss && (
            <span
              className="gr-ticket-near-miss"
              data-testid="tc-near-miss"
              aria-label={t('game_room.near_miss_aria', { id: ticketId })}
            >
              {t('game_room.near_miss')}
            </span>
          )}
          {isGoldenWinner && effectiveMultiplier !== undefined && (
            <span className="gr-ticket-golden-badge" data-testid="gr-ticket-golden-badge">
              ×{effectiveMultiplier}
            </span>
          )}
        </div>

      <div className="gr-bingo-grid" role="grid" aria-label={t('game_room.ticket_aria', { id: ticketId })}>
        <div className="gr-bingo-grid-head" role="row">
          {COLS.map(c => (
            <div key={c} className="gr-bingo-head" role="columnheader" style={{ background: BINGO_COLORS[c] }}>
              {c}
            </div>
          ))}
        </div>
        <div className="gr-bingo-grid-body">
          {grid.map((row, ri) => (
            <div key={ri} className="gr-bingo-row" role="row">
              {row.map((val, ci) => {
                const gridIdx    = ri * 5 + ci;
                const isFree     = val === null;
                const isMarked   = isFree || drawnSet.has(val as number);
                const isJustHit  = !isFree && val === lastDrawn;
                const inWin      = (winPattern?.has(gridIdx) ?? false) || winningCells.has(gridIdx);
                const color      = BINGO_COLORS[COLS[ci]];
                const isGoldenCell = isGoldenWinner && val !== null && val === goldenBallNum;

                return (
                  <div
                    key={ci}
                    data-testid={`tc-cell-${gridIdx}`}
                    role="gridcell"
                    aria-selected={isMarked}
                    aria-label={
                      isFree
                        ? t('game_room.free_space_aria')
                        : isMarked
                          ? t('game_room.cell_marked_aria', { col: COLS[ci], val })
                          : t('game_room.cell_aria', { col: COLS[ci], val })
                    }
                    className={[
                      'gr-bingo-cell',
                      isFree              ? 'is-free'            : '',
                      isMarked && !isFree ? 'is-marked'          : '',
                      isJustHit           ? 'is-just-hit'        : '',
                      inWin               ? 'in-winning-pattern' : '',
                      showNearMiss && nearMiss.nearMissCells.has(gridIdx) && !isMarked ? 'is-near-miss-cell' : '',
                      isGoldenCell        ? 'is-golden-cell'     : '',
                    ].filter(Boolean).join(' ')}
                    style={isMarked && !isFree ? { '--cell-color': color } as React.CSSProperties : {}}
                  >
                    {isFree ? <Star className="size-3 shrink-0 fill-current" /> : val}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {(() => {
        // max_weight (ADR-005): exibe apenas a entrada de maior peso
        let best: { label: string; isCombo: boolean } | null = null;
        let bestMultiplier = 0;
        for (const p of completedPatterns) {
          const m = parseFloat(p.prize) || 0;
          if (m > bestMultiplier) { bestMultiplier = m; best = { label: p.name, isCombo: false }; }
        }
        for (const c of completedCombinations ?? []) {
          const m = c.weight / 100;
          if (m > bestMultiplier) { bestMultiplier = m; best = { label: c.name, isCombo: true }; }
        }
        if (!best) return null;
        return (
          <div className="gr-ticket-patterns">
            <span
              key={best.label}
              className={`gr-ticket-pattern-badge${best.isCombo ? ' gr-ticket-combo-badge' : ''}`}
            >
              <span>{best.isCombo ? <Link2 className="size-3 shrink-0" /> : <Star className="size-3 shrink-0" />}</span>{best.label}
            </span>
          </div>
        );
      })()}

      {!isWinner && nearMiss.closestPct > 0 && (
        <div className="gr-ticket-progress" data-testid="tc-progress" aria-hidden="true">
          <i style={{ width: `${Math.round(nearMiss.closestPct * 100)}%` }} />
        </div>
      )}

      <div className="gr-ticket-foot">
        <span className="best">
          {isWinner
            ? t('game_room.ticket_footer_pattern', { count: completedPatterns.length || 1 })
            : t('game_room.ticket_footer_marked', { marked: markedCount, total: 25 })}
        </span>
        <div className="gr-ticket-foot-right">
          {pricePaid && <span className="ticket-price-paid">{pricePaid}</span>}
          {prize && <span className={`prize${isWinner ? ' is-paid' : ''}`}>{prize}</span>}
        </div>
      </div>
    </article>
  );
}
