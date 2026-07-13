// apps/frontend/src/components/gameroom/PatternsPanel.tsx
// Painel lateral que exibe padrões e combinações da sala com progresso por proximidade.
// Extraído da GameRoom (Fase 0 do refactor) — markup idêntico, zero mudança de comportamento.
//
// Ref: SPEC.md §4, ADR-007 (Slow Reveal), ADR-016 (Combinações)
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
export default function PatternsPanel({ loadingGame, roomPatterns, sortedPatterns, gameCombinations, adjustedPatternWinCount, allGameCombinationWinCount, patternProximityMap, combinationProximityMap, combinationCells, completedCombinationsPerTicket, currencySymbol, onClose, panelRef, drawMode, gameStages, clearedStages, playerTickets, drawnSet, }) {
    const { t } = useTranslation();
    const isMultiMatch = drawMode === 'multimatch';
    // ── MULTI_MATCH: progresso real dos estágios pelas cartelas do jogador ──
    // Conta quantos padrões o jogador completou em todas as cartelas.
    // O progresso de cada estágio = min(completed, patterns_required) / patterns_required.
    const stageProgress = React.useMemo(() => {
        if (!isMultiMatch || !gameStages?.length || !playerTickets?.length || !roomPatterns.length || !drawnSet?.size) {
            return new Map();
        }
        const progress = new Map();
        for (const s of gameStages) {
            progress.set(s.stage, { completed: 0, total: s.patterns_required, pct: 0 });
        }
        // Matriz vem com 24 elementos (FREE SPACE excluído). Converte para 25 posições
        // row-major com null no índice 12 para comparar com padrões.
        const ticketFlat = (matrix) => {
            const f = [];
            for (let i = 0, j = 0; i < 25; i++) {
                f.push(i === 12 ? null : (matrix[j++] ?? null));
            }
            return f;
        };
        // Conta padrões completos por ticket, agrega por estágio
        let maxCompleted = 0;
        for (const ticket of playerTickets) {
            const flat = ticketFlat(ticket.matrix);
            let ticketCompleted = 0;
            for (const p of roomPatterns) {
                const done = p.cells.every((req, i) => !req || flat[i] === null || drawnSet.has(flat[i]));
                if (done)
                    ticketCompleted++;
            }
            if (ticketCompleted > maxCompleted)
                maxCompleted = ticketCompleted;
        }
        // Aplica ao progresso de cada estágio
        for (const s of gameStages) {
            const cap = Math.min(maxCompleted, s.patterns_required);
            progress.set(s.stage, { completed: cap, total: s.patterns_required, pct: Math.round((cap / s.patterns_required) * 100) });
        }
        return progress;
    }, [isMultiMatch, gameStages, playerTickets, roomPatterns, drawnSet]);
    function patternMeta(proxPct, winCount, patternWon, p) {
        if (patternWon)
            return `${t('game_room.pattern_completed')} (${winCount})`;
        if (proxPct > 0)
            return t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) });
        return `${p.cells.filter(Boolean).length} cells`;
    }
    function comboMeta(proxPct, winCount, comboWon) {
        if (comboWon)
            return `${t('game_room.pattern_completed')} (${winCount})`;
        if (proxPct > 0)
            return t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) });
        return t('game_room.combo_meta');
    }
    return (<aside ref={panelRef} data-testid="gr-patterns-panel" className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
      <div className="gr-patterns-head">
        <span className="title">{isMultiMatch ? t('game_room.stages_title') : t('game_room.patterns_heading')}</span>
        <Button variant="ghost" size="sm" onClick={() => onClose()} aria-label={t('game_room.patterns_hide_aria')}>✕</Button>
      </div>
      <div className="gr-patterns-list">
        {isMultiMatch && gameStages ? (<>
            {gameStages.map(s => {
                const cleared = clearedStages?.find(cs => cs.stage === s.stage);
                const winnerCount = cleared?.winners?.length ?? 0;
                const isComplete = !!cleared;
                const sp = stageProgress.get(s.stage);
                const pct = isComplete ? 100 : (sp?.pct ?? 0);
                return (<div key={s.stage} className={`gr-pattern${isComplete ? ' is-close' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="gr-pattern-info">
                    <span className="name">
                      {t('game_room.stage_label', { stage: s.stage })}
                    </span>
                    <div className="mini-progress">
                      <i style={{ width: `${pct}%` }}/>
                    </div>
                    {isComplete ? (<span className="meta">
                        {t('game_room.stage_winners', { count: winnerCount })}
                      </span>) : (<span className="meta">
                        {sp ? t('game_room.patterns_progress', { cur: sp.completed, total: sp.total }) : t('game_room.patterns_required', { count: s.patterns_required })}
                      </span>)}
                  </div>
                  <div className="gr-pattern-prize">
                    <span className="amt">{(s.weight / 100).toFixed(2)}x</span>
                    <span className="hits">{currencySymbol}</span>
                  </div>
                </div>);
            })}
            {sortedPatterns.length > 0 && (<div className="gr-mm-patterns-sub">
                <span className="gr-mm-patterns-sub-title">{t('game_room.mm_patterns_heading')}</span>
                <div className="gr-mm-patterns-sub-list">
                  {sortedPatterns.map(p => {
                    const proxPct = patternProximityMap.get(p.name) ?? 0;
                    return (<div key={p.name} className="gr-pattern" style={{ gridTemplateColumns: '24px 1fr' }}>
                        <div className="gr-pattern-mini">
                          {p.cells.map((on, j) => <i key={`mm-${p.name}-cell-${j}`} className={on ? 'on' : ''}/>)}
                        </div>
                        <div className="gr-pattern-info">
                          <span className="name">{p.name}</span>
                          <div className="mini-progress">
                            <i style={{ width: `${Math.round(proxPct * 100)}%` }}/>
                          </div>
                        </div>
                      </div>);
                })}
                </div>
              </div>)}
          </>) : roomPatterns.length === 0 ? (<div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
            {loadingGame ? t('game_room.patterns_loading') : t('game_room.patterns_empty')}
          </div>) : (<>
            {sortedPatterns.map(p => {
                const winCount = adjustedPatternWinCount.get(p.name) ?? 0;
                const patternWon = winCount > 0;
                const proxPct = patternProximityMap.get(p.name) ?? 0;
                return (<div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                  <div className="gr-pattern-mini">
                    {p.cells.map((on, j) => <i key={`${p.name}-cell-${j}`} className={on ? 'on' : ''}/>)}
                  </div>
                  <div className="gr-pattern-info">
                    <span className="name">{p.name}</span>
                    <div className="mini-progress">
                      <i style={{ width: patternWon ? '100%' : `${Math.round(proxPct * 100)}%` }}/>
                    </div>
                    <span className="meta">
                      {patternMeta(proxPct, winCount, patternWon, p)}
                    </span>
                  </div>
                  <div className="gr-pattern-prize">
                    <span className="amt">{p.prize}x</span>
                    <span className="hits">{currencySymbol}</span>
                  </div>
                </div>);
            })}
            {gameCombinations.map(c => {
                const winCount = allGameCombinationWinCount.get(c.name) ?? 0;
                const comboWon = winCount > 0;
                const proxPct = combinationProximityMap.get(c.name) ?? 0;
                const cells = combinationCells.get(c.name) ?? new Array(25).fill(0);
                const myCombo = [...completedCombinationsPerTicket.values()].some(v => v.some(cc => cc.name === c.name));
                return (<div key={c.name} className={`gr-pattern gr-pattern--combo${comboWon ? ' is-close' : ''}`}>
                  <div className="gr-pattern-mini">
                    {cells.map((on, j) => <i key={`${c.name}-cell-${j}`} className={on ? 'on' : ''}/>)}
                  </div>
                  <div className="gr-pattern-info">
                    <span className="name">
                      {myCombo && <span title={t('game_room.my_combo_badge')}>⭐ </span>}
                      🔗 {c.name}
                    </span>
                    <div className="mini-progress">
                      <i style={{ width: comboWon ? '100%' : `${Math.round(proxPct * 100)}%` }}/>
                    </div>
                    <span className="meta">
                      {comboMeta(proxPct, winCount, comboWon)}
                    </span>
                  </div>
                  <div className="gr-pattern-prize">
                    <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                    <span className="hits">{currencySymbol}</span>
                  </div>
                </div>);
            })}
          </>)}
      </div>
    </aside>);
}
//# sourceMappingURL=PatternsPanel.js.map