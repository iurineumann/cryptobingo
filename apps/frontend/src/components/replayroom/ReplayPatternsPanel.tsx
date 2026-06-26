// apps/frontend/src/components/replayroom/ReplayPatternsPanel.tsx
import { useTranslation } from 'react-i18next';
import type { Pattern, CombinationRuleInput } from '../ticketUtils';
import { Check, X } from 'lucide-react';

export interface ReplayPatternsPanelProps {
  show: boolean;
  patterns: Pattern[];
  sortedPatterns: Pattern[];
  combinations: CombinationRuleInput[];
  winners: Array<{ ticket_id: string; patterns: Pattern[] }>;
  patternWinCount: Map<string, number>;
  combinationWinCount: Map<string, number>;
  currencySymbol: string;
  onClose: () => void;
  patternsRef: React.RefObject<HTMLElement | null>;
}

export default function ReplayPatternsPanel({
  show, patterns, sortedPatterns, combinations,
  winners, patternWinCount, combinationWinCount,
  currencySymbol, onClose, patternsRef,
}: ReplayPatternsPanelProps) {
  const { t } = useTranslation();
  if (!show) return null;

  return (
    <aside ref={patternsRef} className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
      <div className="gr-patterns-head">
        <span className="title">{t('game_room.patterns_heading')}</span>
        <button
          className="cb-btn cb-btn-ghost cb-btn-sm"
          onClick={onClose}
          aria-label={t('game_room.patterns_hide_aria')}
        ><X className="size-4 shrink-0" /></button>
      </div>
      <div className="gr-patterns-list">
        {patterns.length === 0 ? (
          <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
            {t('game_room.patterns_empty')}
          </div>
        ) : (
          sortedPatterns.map(p => {
            const patternWon = winners.some(w => w.patterns.some(wp => wp.name === p.name));
            const winCount   = patternWinCount.get(p.name) || 0;
            return (
              <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                <div className="gr-pattern-mini">
                  {p.cells.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                </div>
                <div className="gr-pattern-info">
                  <span className="name">{p.name}</span>
                  <div className="mini-progress">
                    <i style={{ width: patternWon ? '100%' : '0%' }} />
                  </div>
                  <span className="meta">
                    {patternWon
                      ? `${t('game_room.pattern_completed')} (${winCount})`
                      : `${p.cells.filter(Boolean).length} cells`}
                  </span>
                </div>
                <div className="gr-pattern-prize">
                  <span className="amt">{p.prize}</span>
                  <span className="hits">{currencySymbol}</span>
                </div>
              </div>
            );
          })
        )}
        {combinations.length > 0 && (
          <div className="gr-patterns-combos">
            <span className="gr-patterns-combos-head">Combinações</span>
            {combinations.map(c => {
              const won = combinationWinCount.get(c.name);
              return (
                <div key={c.name} className={`gr-pattern-combo${won ? ' is-close' : ''}`}>
                  <span className="name">{c.name}</span>
                  <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                  {won
                    ? <span className="cnt"><Check className="size-3 shrink-0" /> {won} cartela{won > 1 ? 's' : ''}</span>
                    : <span className="cnt">—</span>
                  }
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
