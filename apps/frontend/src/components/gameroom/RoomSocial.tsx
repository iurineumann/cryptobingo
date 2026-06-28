// apps/frontend/src/components/gameroom/RoomSocial.tsx
// Camada social da sala: presença online, reações flutuantes e feed de eventos.
// Task 4, Fase 4 (ADR-032).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FloatingReaction } from '../../hooks/useRoomSocial';
import ChatFloating from '../chat/ChatFloating';
import type { EnrichedRoom } from '../../services/api';

// Allowlist espelha o backend (evita emojis não autorizados chegarem ao socket).
const EMOJIS_ALLOWLIST = ['👏', '🔥', '😮', '😢', '🍀', '🎉'] as const;

export interface RoomSocialProps {
  room: EnrichedRoom | null;
  walletAddress: string;
  /** Últimas vitórias locais (do hook useGameRoomState) para o feed. */
  localWinners: Array<{ ticket_id: string; win_pattern: string }>;
  /** Estágios liberados (do hook useGameRoomState) para o feed. */
  clearedStages: Array<{ stage: number; winners: unknown[] }>;
  /** Presença online (do hook useRoomSocial no pai). */
  onlineCount: number;
  /** Reações flutuantes efêmeras. */
  reactions: FloatingReaction[];
  /** Envia uma reação. */
  sendReaction: (emoji: string) => void;
}

export default function RoomSocial({ room, walletAddress, localWinners, clearedStages, onlineCount, reactions, sendReaction }: RoomSocialProps) {
  const { t } = useTranslation();
  const [showReactions, setShowReactions] = useState(false);

  if (!room) return null;

  // Feed: últimas 5 vitórias + stages liberados (mais recentes primeiro → reverse)
  const feedItems: string[] = [
    ...localWinners.slice(-5).map(w =>
      t('game_room.social_feed_win', { id: w.ticket_id, pattern: w.win_pattern }),
    ),
    ...clearedStages.map(s =>
      t('game_room.social_feed_stage', { stage: s.stage }),
    ),
  ].reverse();

  return (
    <>
      {/* Reações flutuantes efêmeras */}
      <div className="gr-reactions-overlay" aria-hidden="true">
        {reactions.map(r => (
          <span key={r.id} className="gr-reaction-float">
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Botão + popover de reações — flutuante perto do chat FAB */}
      <div className="gr-reaction-wrapper" data-testid="gr-reaction-wrapper">
        <button
          type="button"
          className="gr-reaction-toggle"
          data-testid="gr-reaction-toggle"
          onClick={() => setShowReactions(v => !v)}
          aria-label={t('game_room.social_react_aria', { emoji: '😊' })}
          aria-expanded={showReactions}
        >
          😊
        </button>
        {showReactions && (
          <fieldset className="gr-reaction-bar" data-testid="gr-reaction-bar">
            {EMOJIS_ALLOWLIST.map(emoji => (
              <button
                key={emoji}
                type="button"
                aria-label={t('game_room.social_react_aria', { emoji })}
                onClick={() => { sendReaction(emoji); setShowReactions(false); }}
              >
                {emoji}
              </button>
            ))}
          </fieldset>
        )}
      </div>

      {/* Feed de eventos: vitórias e stages */}
      {feedItems.length > 0 && (
        <div className="gr-event-feed" data-testid="gr-event-feed">
          {feedItems.map(item => (
            <span key={item} className="ev">{item}</span>
          ))}
        </div>
      )}

      {/* Chat flutuante (mantido da Fase anterior) */}
      <ChatFloating
        roomId={room.room_id}
        roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
        walletAddress={walletAddress}
      />
    </>
  );
}
