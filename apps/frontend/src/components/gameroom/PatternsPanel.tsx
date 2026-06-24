// apps/frontend/src/components/gameroom/PatternsPanel.tsx
// Painel lateral que exibe padrões e combinações da sala com progresso por proximidade.
// Extraído da GameRoom (Fase 0 do refactor) — markup idêntico, zero mudança de comportamento.
//
// Ref: SPEC.md §4, ADR-007 (Slow Reveal), ADR-016 (Combinações)

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Pattern, CombinationRuleInput } from '../ticketUtils';

export interface PatternsPanelProps {
  loadingGame: boolean;
  roomPatterns: Pattern[];
  sortedPatterns: Pattern[];
  gameCombinations: CombinationRuleInput[];
  adjustedPatternWinCount: Map<string, number>;
  allGameCombinationWinCount: Map<string, number>;
  patternProximityMap: Map<string, number>;
  combinationProximityMap: Map<string, number>;
  combinationCells: Map<string, number[]>;
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  currencySymbol: string;
  onClose: () => void;
  /** ref para sincronizar altura com o DrawStage */
  panelRef: React.RefObject<HTMLElement | null>;
}

export default function PatternsPanel({
  loadingGame,
  roomPatterns,
  sortedPatterns,
  gameCombinations,
  adjustedPatternWinCount,
  allGameCombinationWinCount,
  patternProximityMap,
  combinationProximityMap,
  combinationCells,
  completedCombinationsPerTicket,
  currencySymbol,
  onClose,
  panelRef,
}: PatternsPanelProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <aside ref={panelRef} data-testid="gr-patterns-panel" className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
      <div className="gr-patterns-head">
        <span className="title">{t('game_room.patterns_heading')}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onClose()}
          aria-label={t('game_room.patterns_hide_aria')}
        >✕</Button>
      </div>
      <div className="gr-patterns-list">
        {roomPatterns.length === 0 ? (
          <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
            {loadingGame ? t('game_room.patterns_loading') : t('game_room.patterns_empty')}
          </div>
        ) : (
          <>
            {sortedPatterns.map(p => {
              const winCount  = adjustedPatternWinCount.get(p.name) ?? 0;
              const patternWon = winCount > 0;
              const proxPct   = patternProximityMap.get(p.name) ?? 0;
              return (
                <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                  <div className="gr-pattern-mini">
                    {p.cells.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                  </div>
                  <div className="gr-pattern-info">
                    <span className="name">{p.name}</span>
                    <div className="mini-progress">
                      <i style={{ width: patternWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                    </div>
                    <span className="meta">
                      {patternWon
                        ? `${t('game_room.pattern_completed')} (${winCount})`
                        : proxPct > 0
                          ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                          : `${p.cells.filter(Boolean).length} cells`}
                    </span>
                  </div>
                  <div className="gr-pattern-prize">
                    <span className="amt">{p.prize}x</span>
                    <span className="hits">{currencySymbol}</span>
                  </div>
                </div>
              );
            })}
            {gameCombinations.map(c => {
              const winCount  = allGameCombinationWinCount.get(c.name) ?? 0;
              const comboWon  = winCount > 0;
              const proxPct   = combinationProximityMap.get(c.name) ?? 0;
              const cells     = combinationCells.get(c.name) ?? new Array(25).fill(0);
              const myCombo   = [...completedCombinationsPerTicket.values()].some(v => v.some(cc => cc.name === c.name));
              return (
                <div key={c.name} className={`gr-pattern gr-pattern--combo${comboWon ? ' is-close' : ''}`}>
                  <div className="gr-pattern-mini">
                    {cells.map((on: number, j: number) => <i key={j} className={on ? 'on' : ''} />)}
                  </div>
                  <div className="gr-pattern-info">
                    <span className="name">
                      {myCombo && <span title={t('game_room.my_combo_badge')}>⭐ </span>}
                      🔗 {c.name}
                    </span>
                    <div className="mini-progress">
                      <i style={{ width: comboWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                    </div>
                    <span className="meta">
                      {comboWon
                        ? `${t('game_room.pattern_completed')} (${winCount})`
                        : proxPct > 0
                          ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                          : t('game_room.combo_meta')}
                    </span>
                  </div>
                  <div className="gr-pattern-prize">
                    <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                    <span className="hits">{currencySymbol}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
