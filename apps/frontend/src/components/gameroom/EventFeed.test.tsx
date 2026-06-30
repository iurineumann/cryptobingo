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
      { account: 'alice',   pattern_name: 'Linha 1' },
      { account: 'bob',     pattern_name: 'Coluna 2' },
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

  it('renderiza link explorer quando tx_id presente', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'alice', pattern_name: 'Linha 1', tx_id: 'abc123' },
    ]} error={null} />);
    const item = screen.getByTestId('gr-event-feed-item-0');
    const links = item.querySelectorAll('a');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza spinners nos items sem tx_id', () => {
    render(<EventFeed loading={false} winners={[
      { account: 'bob', pattern_name: 'Coluna 2' },
    ]} error={null} />);
    const item = screen.getByTestId('gr-event-feed-item-0');
    expect(item.querySelector('.cb-spinner')).toBeTruthy();
  });
});
