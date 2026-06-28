// Testes unitários de RoomSocial (Task 4, Fase 4).
// Online count agora no GameRoomHeader; RoomSocial recebe social state como props.
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
vi.mock('../chat/ChatFloating', () => ({ default: () => <div data-testid="chat-stub" /> }));

afterEach(() => cleanup());

const room = { room_id: '1', metadata: { name: 'Sala' } } as never;

function renderSocial(over: Record<string, unknown> = {}) {
  return render(
    <RoomSocial
      room={room}
      walletAddress="alice"
      localWinners={[]}
      clearedStages={[]}
      onlineCount={4}
      reactions={[]}
      sendReaction={sendReaction}
      {...over}
    />,
  );
}

describe('RoomSocial', () => {
  it('renderiza toggle de reações', () => {
    renderSocial();
    expect(screen.getByTestId('gr-reaction-toggle')).toBeTruthy();
  });

  it('barra de reações aparece ao clicar toggle', () => {
    renderSocial();
    fireEvent.click(screen.getByTestId('gr-reaction-toggle'));
    expect(screen.getByTestId('gr-reaction-bar')).toBeTruthy();
  });

  it('barra de reações some ao clicar toggle novamente', () => {
    renderSocial();
    fireEvent.click(screen.getByTestId('gr-reaction-toggle'));
    expect(screen.getByTestId('gr-reaction-bar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gr-reaction-toggle'));
    expect(screen.queryByTestId('gr-reaction-bar')).toBeNull();
  });

  it('clicar numa reação chama sendReaction e fecha', () => {
    renderSocial();
    fireEvent.click(screen.getByTestId('gr-reaction-toggle'));
    fireEvent.click(screen.getByTestId('gr-reaction-bar').querySelector('button')!);
    expect(sendReaction).toHaveBeenCalled();
    expect(screen.queryByTestId('gr-reaction-bar')).toBeNull();
  });

  it('feed lista vitórias recentes', () => {
    renderSocial({
      localWinners: [{ ticket_id: '7', win_pattern: 'Linha' }],
    });
    expect(screen.getByTestId('gr-event-feed').textContent).toContain('7');
  });

  it('retorna null sem sala', () => {
    const { container } = render(
      <RoomSocial
        room={null}
        walletAddress="alice"
        localWinners={[]}
        clearedStages={[]}
        onlineCount={0}
        reactions={[]}
        sendReaction={sendReaction}
      />,
    );
    expect(container.querySelector('[data-testid="gr-reaction-wrapper"]')).toBeNull();
  });
});
