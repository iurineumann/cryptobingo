// apps/frontend/src/components/TicketCard.tsx
// Componente de cartela 5×5. Apenas exporta o componente React
// para compatibilidade com o Fast Refresh do Vite.
// Utilitários, tipos e funções assíncronas estão em ticketUtils.ts
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BINGO_COLORS, COLS, computeTicketNearMiss } from './ticketUtils';
import { Star, Link2 } from 'lucide-react';
/** Traduz stage_N → i18n (ex: stage_2 → "Estágio 2"). */
function fmtStageLabel(t, key) {
    const m = key.match(/^stage_(\d+)$/);
    if (m)
        return t('game_room.stage_label', { stage: Number(m[1]) });
    return key;
}
function TicketFooterView({ isWinner, completedPatterns, markedCount, pricePaid, prize, total, t }) {
    return (<div className="gr-ticket-foot">
      <span className="best">
        {isWinner
            ? t('game_room.ticket_footer_pattern', { count: completedPatterns.length || 1 })
            : t('game_room.ticket_footer_marked', { marked: markedCount, total })}
      </span>
      <div className="gr-ticket-foot-right">
        {pricePaid && <span className="ticket-price-paid">{pricePaid}</span>}
        {prize && <span className={`prize${isWinner ? ' is-paid' : ''}`}>{prize}</span>}
      </div>
    </div>);
}
function TicketPatternsSection({ stageWonKeys, completedPatterns, completedCombinations, t }) {
    if (stageWonKeys && stageWonKeys.length > 0) {
        return (<div className="gr-ticket-patterns">
        {stageWonKeys.map(key => (<span key={key} className="gr-ticket-pattern-badge">
            <span><Star className="size-3 shrink-0"/></span>{fmtStageLabel(t, key)}
          </span>))}
      </div>);
    }
    const total = completedPatterns.length + (completedCombinations?.length ?? 0);
    if (total === 0)
        return null;
    const allItems = [
        ...completedPatterns.map(p => ({ label: p.name, isCombo: false, multiplier: parseFloat(p.prize) || 0 })),
        ...(completedCombinations ?? []).map(c => ({ label: c.name, isCombo: true, multiplier: c.weight / 100 })),
    ].sort((a, b) => b.multiplier - a.multiplier);
    const top = allItems[0];
    if (!top)
        return null;
    return (<div className="gr-ticket-patterns">
      <span key={top.label} className={`gr-ticket-pattern-badge${top.isCombo ? ' gr-ticket-combo-badge' : ''}`}>
        <span>{top.isCombo ? <Link2 className="size-3 shrink-0"/> : <Star className="size-3 shrink-0"/>}</span>{top.label}
      </span>
    </div>);
}
function TicketCell({ gridIdx, val, isFree, isMarked, isJustHit, inWin, color, isGoldenCell, showNearMiss, nearMissCells, t, }) {
    let ariaLabel;
    if (isFree) {
        ariaLabel = t('game_room.free_space_aria');
    }
    else if (isMarked) {
        ariaLabel = t('game_room.cell_marked_aria', { col: COLS[gridIdx % 5], val });
    }
    else {
        ariaLabel = t('game_room.cell_aria', { col: COLS[gridIdx % 5], val });
    }
    return (<div data-testid={`tc-cell-${gridIdx}`} role="gridcell" // NOSONAR — CSS grid layout with ARIA roles intentional for 5×5 bingo card
     aria-selected={isMarked} aria-label={ariaLabel} className={[
            'gr-bingo-cell',
            isFree ? 'is-free' : '',
            isMarked && !isFree ? 'is-marked' : '',
            isJustHit ? 'is-just-hit' : '',
            inWin ? 'in-winning-pattern' : '',
            showNearMiss && nearMissCells.has(gridIdx) && !isMarked ? 'is-near-miss-cell' : '',
            isGoldenCell ? 'is-golden-cell' : '',
        ].filter(Boolean).join(' ')} style={isMarked && !isFree ? { '--cell-color': color } : {}}>
      {isFree ? <Star className="size-3 shrink-0 fill-current"/> : val}
    </div>);
}
export function TicketCard({ ticketId, matrix, drawnSet, lastDrawn, winPattern, prize, density, patterns, completedCombinations, pricePaid, goldenBallNum, effectiveMultiplier, stageWonKeys, suppressWinner = false, }) {
    const { t } = useTranslation();
    const grid = useMemo(() => {
        const B = matrix.slice(0, 5);
        const I = matrix.slice(5, 10);
        const Nraw = matrix.slice(10, 14);
        const G = matrix.slice(14, 19);
        const O = matrix.slice(19, 24);
        const N = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
        return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
    }, [matrix]);
    const markedCount = useMemo(() => matrix.filter(n => drawnSet.has(n)).length + 1, [matrix, drawnSet]);
    const { completedPatterns, winningCells } = useMemo(() => {
        const isCellMarked = (i) => {
            const val = grid[Math.floor(i / 5)][i % 5];
            return val === null || drawnSet.has(val);
        };
        const completed = patterns.filter(p => p.cells.every((req, i) => !req || isCellMarked(i)));
        const winning = new Set();
        completed.forEach(p => p.cells.forEach((req, i) => { if (req)
            winning.add(i); }));
        if (winPattern)
            winPattern.forEach(i => winning.add(i));
        return { completedPatterns: completed, winningCells: winning };
    }, [grid, drawnSet, patterns, winPattern]);
    const nearMiss = useMemo(() => computeTicketNearMiss(matrix, drawnSet, patterns), [matrix, drawnSet, patterns]);
    const isWinner = !suppressWinner && (winPattern !== null || completedPatterns.length > 0);
    const isClose = !isWinner && markedCount >= (density === 'compact' ? 20 : 18);
    const showNearMiss = !isWinner && nearMiss.patternsOneAway > 0;
    const goldenBallCheckSet = winPattern ?? winningCells;
    const isGoldenWinner = isWinner && goldenBallNum !== undefined &&
        [...goldenBallCheckSet].some(gridIdx => {
            const r = Math.floor(gridIdx / 5);
            const c = gridIdx % 5;
            return grid[r][c] === goldenBallNum;
        });
    let marksClassName = '';
    if (isWinner)
        marksClassName = ' is-winner';
    else if (isClose)
        marksClassName = ' is-close';
    const marksLabel = isWinner ? t('game_room.winner_badge') : `${markedCount}/25`;
    return (<article data-testid={`gr-ticket-${ticketId}`} className={[
            'gr-ticket',
            isWinner ? 'is-winner' : '',
            isClose ? 'is-close' : '',
            showNearMiss ? 'is-near-miss' : '',
            !isWinner && !isClose && markedCount < 3 ? 'is-dimmed' : '',
            isGoldenWinner ? 'is-golden-winner' : '',
        ].filter(Boolean).join(' ')} aria-label={isWinner ? t('game_room.ticket_winner_aria', { id: ticketId }) : t('game_room.ticket_aria', { id: ticketId })}>
      <div className="gr-ticket-header">
        <div className="gr-ticket-id">
          <span className="label">{t('game_room.ticket_label', { id: ticketId })}</span>
        </div>
        <span className={`gr-ticket-marks${marksClassName}`}>
          {marksLabel}
        </span>
          {showNearMiss && (<span className="gr-ticket-near-miss" data-testid="tc-near-miss" aria-label={t('game_room.near_miss_aria', { id: ticketId })}>
              {t('game_room.near_miss')}
            </span>)}
          {isGoldenWinner && effectiveMultiplier !== undefined && (<span className="gr-ticket-golden-badge" data-testid="gr-ticket-golden-badge">
              ×{effectiveMultiplier}
            </span>)}
        </div>

      <div className="gr-bingo-grid" role="grid" aria-label={t('game_room.ticket_aria', { id: ticketId })}>
        <div className="gr-bingo-grid-head" role="row">
          {COLS.map(c => (<div key={c} className="gr-bingo-head" role="columnheader" style={{ background: BINGO_COLORS[c] }}>
              {c}
            </div>))}
        </div>
        <div className="gr-bingo-grid-body">
          {grid.map((row, ri) => (<div key={`${ticketId}-row-${ri}`} className="gr-bingo-row" role="row">
              {row.map((val, ci) => {
                const gridIdx = ri * 5 + ci;
                return (<TicketCell key={gridIdx} gridIdx={gridIdx} val={val} isFree={val === null} isMarked={val === null || drawnSet.has(val)} isJustHit={val !== null && val === lastDrawn} inWin={(winPattern?.has(gridIdx) ?? false) || winningCells.has(gridIdx)} color={BINGO_COLORS[COLS[ci]]} isGoldenCell={isGoldenWinner && val !== null && val === goldenBallNum} showNearMiss={showNearMiss} nearMissCells={nearMiss.nearMissCells} t={t}/>);
            })}
            </div>))}
        </div>
      </div>

      <TicketPatternsSection stageWonKeys={stageWonKeys} completedPatterns={completedPatterns} completedCombinations={completedCombinations} t={t}/>

      {!isWinner && nearMiss.closestPct > 0 && (<div className="gr-ticket-progress" data-testid="tc-progress" aria-hidden="true">
          <i style={{ width: `${Math.round(nearMiss.closestPct * 100)}%` }}/>
        </div>)}

      <TicketFooterView isWinner={isWinner} completedPatterns={completedPatterns} markedCount={markedCount} pricePaid={pricePaid} prize={prize} total={25} t={t}/>
    </article>);
}
//# sourceMappingURL=TicketCard.js.map