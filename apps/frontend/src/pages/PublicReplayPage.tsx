import { useParams, useNavigate } from 'react-router-dom';
import { Session } from '@wharfkit/session';
import ReplayRoom from '../components/ReplayRoom';

interface PublicReplayPageProps {
  session?: Session | null;
}

export default function PublicReplayPage({ session }: PublicReplayPageProps) {
  const { gameId, player } = useParams<{ gameId: string; player?: string }>();
  const navigate = useNavigate();

  const playerAccount = player || (session ? session.actor.toString() : undefined);

  const handleLeave = () => navigate(session ? '/lobby' : '/');

  return (
    <ReplayRoom
      gameId={gameId!}
      session={session ?? undefined}
      playerAccount={playerAccount}
      onLeave={handleLeave}
    />
  );
}
