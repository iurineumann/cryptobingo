// apps/frontend/src/components/gameroom/TicketsGrid.tsx
// Seção de cartelas do jogador — exibe grupos de cartelas com estado de vitória/draw.
// Extraído de GameRoom.tsx (Fase 0 refactor, Task 7) para isolar responsabilidade visual.
//
// Ref: ADR-007 (Slow Reveal), SPEC.md §4

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TicketCard } from '../TicketCard';
import type { Pattern } from '../ticketUtils';
import { groupTicketsByCategory } from '../ticketUtils';

// ==========================================
// TIPOS
// ==========================================

export interface TicketsGridProps {
  playerTickets: Array<{ id: string; matrix: number[]; pricePaid?: string }>;
  groupedTickets: ReturnType<typeof groupTicketsByCategory>;
  loadingGame: boolean;
  gameStatus: string | undefined;
  canBuyMore: boolean;
  winnerMap: Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>;
  patternByName: Map<string, Pattern>;
  drawnSet: Set<number>;
  lastDrawn: number | null;
  roomPatterns: Pattern[];
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  onBuyMore: () => void;
}

// ==========================================
// COMPONENTE
// ==========================================

export default function TicketsGrid(props: TicketsGridProps): React.JSX.Element {
  const { t } = useTranslation();

  // Densidade fixa por enquanto — 'comfortable' é o único layout suportado (ver ADR-007)
  const density = 'comfortable' as const;

  const {
    playerTickets, groupedTickets, loadingGame, gameStatus,
    canBuyMore, winnerMap, patternByName, drawnSet, lastDrawn,
    roomPatterns, completedCombinationsPerTicket, onBuyMore,
  } = props;

  return (
    <div className="gr-tickets-section" data-testid="gr-my-tickets">
      <div className="gr-tickets-head">
        <span className="title">
          {t('game_room.my_tickets_heading')}
          <span className="count">{playerTickets.length}</span>
        </span>
        {canBuyMore && (
          <Button
            variant="default"
            size="sm"
            data-testid="gr-buy-more"
            onClick={() => onBuyMore()}
          >
            {t('game_room.buy_more')}
          </Button>
        )}
      </div>

      {playerTickets.length === 0 ? (
        <div className="gr-summary-empty">
          {loadingGame
            ? t('game_room.tickets_loading')
            : gameStatus === 'funding'
              ? t('game_room.tickets_empty_funding')
              : t('game_room.tickets_empty_default')}
        </div>
      ) : (
        groupedTickets.map(group => (
          <div key={group.category} className="gr-tickets-group">
            <div className="gr-tickets-group-label">
              <span className="gr-tickets-group-title">{group.label}</span>
              <span className="gr-tickets-group-count">{group.tickets.length}</span>
            </div>
            <div className="gr-tickets-grid">
              {group.tickets.map(ticket => {
                const w = winnerMap.get(ticket.id);
                const pat = w ? patternByName.get(w.patternName) : undefined;
                const winPatternSet = pat
                  ? new Set(pat.cells.map((req, i) => (req ? i : -1)).filter(i => i !== -1))
                  : null;
                return (
                  <TicketCard
                    key={ticket.id}
                    ticketId={ticket.id}
                    matrix={ticket.matrix}
                    drawnSet={drawnSet}
                    lastDrawn={lastDrawn}
                    winPattern={winPatternSet}
                    prize={w?.prize ?? null}
                    density={density}
                    patterns={roomPatterns}
                    completedCombinations={completedCombinationsPerTicket.get(ticket.id)}
                    pricePaid={ticket.pricePaid}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
