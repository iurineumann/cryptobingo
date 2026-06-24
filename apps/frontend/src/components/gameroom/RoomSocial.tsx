// apps/frontend/src/components/gameroom/RoomSocial.tsx
// Camada social da sala. Hoje só encapsula o ChatFloating;
// na Fase 4 (ADR-032) ganha presença/reações/feed de eventos.
import ChatFloating from '../chat/ChatFloating';
import type { EnrichedRoom } from '../../services/api';

export interface RoomSocialProps {
  room: EnrichedRoom | null;
  walletAddress: string;
}

export default function RoomSocial({ room, walletAddress }: RoomSocialProps) {
  if (!room) return null;
  return (
    <ChatFloating
      roomId={room.room_id}
      roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
      walletAddress={walletAddress}
    />
  );
}
