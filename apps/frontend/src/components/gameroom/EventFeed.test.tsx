import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import EventFeed from './EventFeed';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? `${k}:${JSON.stringify(o)}` : k,
  }),
}));

afterEach(() => cleanup());

describe('EventFeed', () => {
  it('renderiza loading skeleton quando loading=true', () => {
    render(<EventFeed loading winners={[]} error={null} />);
    expect(screen.getByTestId('gr-event-feed-loading')).toBeTruthy();
  });

  it('renderiza empty state quando sem winners e nem loading', () => {
    render(<EventFeed loading={false} winners={[]} error={null} />);
    expect(screen.getByTestId('gr-event-feed-empty')).toBeTruthy();
  });

  it('renderiza lista de winners', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'alice',   pattern_name: 'Linha 1', status: 'confirmed' as const },
      { account: 'bob',     pattern_name: 'Coluna 2', status: 'confirmed' as const },
    ]} error={null} />);
    const items = screen.getAllByTestId(/^gr-event-feed-item-/);
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('alice');
    expect(items[0].textContent).toContain('Linha 1');
  });

  it('renderiza mensagem de erro', () => {
    render(<EventFeed loading={false} winners={[]} error="Falha no feed" />);
    expect(screen.getByTestId('gr-event-feed-error')).toBeTruthy();
    expect(screen.getByTestId('gr-event-feed-error').textContent).toContain('Falha no feed');
  });

  it('renderiza link explorer quando status=confirmed com tx_id', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'alice', pattern_name: 'Linha 1', status: 'confirmed' as const, tx_id: 'abc123' },
    ]} error={null} />);
    const item = screen.getByTestId('gr-event-feed-item-0');
    const links = item.querySelectorAll('a');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza preparing status', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'alice', pattern_name: 'Linha 1', status: 'preparing' as const },
    ]} error={null} />);
    expect(screen.getByTestId('gr-event-feed-item-0')).toBeTruthy();
    expect(screen.getByText('game_room.prize_preparing')).toBeTruthy();
  });

  it('renderiza confirming status', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'bob', pattern_name: 'Coluna 2', status: 'confirming' as const },
    ]} error={null} />);
    expect(screen.getByText('game_room.prize_confirming')).toBeTruthy();
  });

  it('confirmed status mostra amount e link explorer', () => {
    render(<EventFeed loading={false} winners={[{
      account: 'alice', pattern_name: 'Linha 1',
      status: 'confirmed' as const, tx_id: 'tx123', amount: '3.5000',
    }]} error={null} />);
    const link = screen.getByTestId('gr-event-feed-tx-0');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toContain('tx123');
  });

  it('status sem tx_id (preparing/confirming) não renderiza link', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'alice', pattern_name: 'Linha 1', status: 'preparing' as const },
    ]} error={null} />);
    expect(screen.queryByTestId('gr-event-feed-tx-0')).toBeNull();
  });
});
