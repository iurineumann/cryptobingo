// apps/frontend/src/pages/PublicReplayPage.test.tsx
// Testes do componente publico de replay (fora de AuthGuard)
import './vitest.setup'; // garante TextEncoder antes de react-router carregar
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicReplayPage from './PublicReplayPage';

// Mock ReplayRoom para nao depender de hooks complexos
vi.mock('../components/ReplayRoom', () => ({
  default: ({ gameId, session, playerAccount }: any) => (
    <div data-testid="mock-replay-room">
      <span data-testid="prop-gameid">{gameId}</span>
      <span data-testid="prop-session">{String(!!session)}</span>
      <span data-testid="prop-playeraccount">{playerAccount ?? 'undefined'}</span>
    </div>
  ),
}));

describe('PublicReplayPage', () => {
  it('passa playerAccount = :player quando param existe (sobrepoe session)', () => {
    vi.mocked(require('react-router-dom').useParams).mockReturnValue({
      gameId: '12345', player: 'winneruser',
    });
    vi.mocked(require('react-router-dom').useNavigate).mockReturnValue(vi.fn());
    render(<PublicReplayPage session={{ actor: { toString: () => 'loggeduser' } } as any} />);
    expect(screen.getByTestId('prop-gameid').textContent).toBe('12345');
    expect(screen.getByTestId('prop-playeraccount').textContent).toBe('winneruser');
  });

  it('passa playerAccount = session.actor quando logado sem :player', () => {
    vi.mocked(require('react-router-dom').useParams).mockReturnValue({ gameId: '12345' });
    vi.mocked(require('react-router-dom').useNavigate).mockReturnValue(vi.fn());
    render(<PublicReplayPage session={{ actor: { toString: () => 'loggeduser' } } as any} />);
    expect(screen.getByTestId('prop-playeraccount').textContent).toBe('loggeduser');
  });

  it('passa playerAccount = undefined sem session nem :player', () => {
    vi.mocked(require('react-router-dom').useParams).mockReturnValue({ gameId: '12345' });
    vi.mocked(require('react-router-dom').useNavigate).mockReturnValue(vi.fn());
    render(<PublicReplayPage />);
    expect(screen.getByTestId('prop-playeraccount').textContent).toBe('undefined');
  });

  it('passa session=false quando session é null', () => {
    vi.mocked(require('react-router-dom').useParams).mockReturnValue({ gameId: '12345' });
    vi.mocked(require('react-router-dom').useNavigate).mockReturnValue(vi.fn());
    render(<PublicReplayPage session={null} />);
    expect(screen.getByTestId('prop-session').textContent).toBe('false');
  });
});
