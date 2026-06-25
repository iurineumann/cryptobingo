// apps/frontend/src/components/gameroom/RoomSocial.tsx
// Camada social da sala: presença online, reações flutuantes e feed de eventos.
// Task 4, Fase 4 (ADR-032).
import { useTranslation } from 'react-i18next';
import { useRoomSocial } from '../../hooks/useRoomSocial';
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
}

export default function RoomSocial({ room, walletAddress, localWinners, clearedStages }: RoomSocialProps) {
  const { t } = useTranslation();
  const { onlineCount, reactions, sendReaction } = useRoomSocial({
    roomId: room?.room_id ?? '',
  });

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
      {/* Badge de presença online */}
      <span className="gr-online" data-testid="gr-online-count">
        <span className="dot" aria-hidden="true" />
        {t('game_room.social_online', { count: onlineCount })}
      </span>

      {/* Barra de reações */}
      <div className="gr-reaction-bar" data-testid="gr-reaction-bar" role="group">
        {EMOJIS_ALLOWLIST.map(emoji => (
          <button
            key={emoji}
            type="button"
            aria-label={t('game_room.social_react_aria', { emoji })}
            onClick={() => sendReaction(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Reações flutuantes efêmeras */}
      <div className="gr-reactions-overlay" aria-hidden="true">
        {reactions.map(r => (
          <span key={r.id} className="gr-reaction-float">
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Feed de eventos: vitórias e stages */}
      {feedItems.length > 0 && (
        <div className="gr-event-feed" data-testid="gr-event-feed">
          {feedItems.map((item, idx) => (
            <span key={idx} className="ev">{item}</span>
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
