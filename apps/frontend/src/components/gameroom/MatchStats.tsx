// apps/frontend/src/components/gameroom/MatchStats.tsx
// Faixa de dados da partida: pote (on-chain), bônus patrocinado e bolas.
// Não recalcula economia — exibe valores já resolvidos pelo worker/chain (ADR-010).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseAsset } from './prizeFormat';

export interface MatchStatsProps {
  totalWagered: string;
  sponsorPool: Array<{ quantity: string }>;
  drawnCount: number;
  maxBalls: number;
}

export default function MatchStats({ totalWagered, sponsorPool, drawnCount, maxBalls }: MatchStatsProps): React.JSX.Element | null {
  const { t } = useTranslation();

  const pot = parseAsset(totalWagered);
  const bonus = (sponsorPool ?? []).filter(s => parseAsset(s.quantity).amount > 0);
  const hasPot = pot.amount > 0;

  if (!hasPot && bonus.length === 0 && drawnCount === 0) return null;

  return (
    <div className="gr-match-stats" data-testid="gr-match-stats" role="group" aria-label={t('game_room.pot_label')}>
      <div className="gr-match-stat is-pot">
        <span className="label">{t('game_room.pot_label')}</span>
        <span className="value" data-testid="gr-pot">{hasPot ? totalWagered : '—'}</span>
      </div>
      {bonus.length > 0 && (
        <>
          <div className="gr-match-stats-sep" aria-hidden="true" />
          <div className="gr-match-stat is-bonus">
            <span className="label">{t('game_room.pot_bonus')}</span>
            <span className="value">{bonus.map(b => b.quantity).join(' + ')}</span>
          </div>
        </>
      )}
      <div className="gr-match-stats-sep" aria-hidden="true" />
      <div className="gr-match-stat">
        <span className="label">{t('game_room.stats_balls')}</span>
        <span className="value">{drawnCount}/{maxBalls}</span>
      </div>
    </div>
  );
}
