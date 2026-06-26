// apps/frontend/src/components/gameroom/RoomSocial.test.tsx
// Testes unitários de RoomSocial (Task 4, Fase 4).
// Mocka useRoomSocial e ChatFloating para isolar o componente.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import RoomSocial from './RoomSocial';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? `${k}:${JSON.stringify(o)}` : k,
  }),
}));

const sendReaction = vi.fn();
vi.mock('../../hooks/useRoomSocial', () => ({
  useRoomSocial: () => ({ onlineCount: 4, reactions: [], sendReaction }),
}));

vi.mock('../chat/ChatFloating', () => ({ default: () => <div data-testid="chat-stub" /> }));

afterEach(() => cleanup());

const room = { room_id: '1', metadata: { name: 'Sala' } } as never;

describe('RoomSocial', () => {
  it('mostra contagem de online', () => {
    render(<RoomSocial room={room} walletAddress="alice" localWinners={[]} clearedStages={[]} />);
    expect(screen.getByTestId('gr-online-count').textContent).toContain('4');
  });

  it('clicar numa reação chama sendReaction', () => {
    render(<RoomSocial room={room} walletAddress="alice" localWinners={[]} clearedStages={[]} />);
    const bar = screen.getByTestId('gr-reaction-bar');
    fireEvent.click(bar.querySelector('button')!);
    expect(sendReaction).toHaveBeenCalled();
  });

  it('feed lista vitórias recentes', () => {
    render(
      <RoomSocial
        room={room}
        walletAddress="alice"
        localWinners={[{ ticket_id: '7', win_pattern: 'Linha' }]}
        clearedStages={[]}
      />,
    );
    expect(screen.getByTestId('gr-event-feed').textContent).toContain('7');
  });

  it('retorna null sem sala', () => {
    const { container } = render(
      <RoomSocial room={null} walletAddress="alice" localWinners={[]} clearedStages={[]} />,
    );
    expect(container.querySelector('[data-testid="gr-reaction-bar"]')).toBeNull();
  });
});
