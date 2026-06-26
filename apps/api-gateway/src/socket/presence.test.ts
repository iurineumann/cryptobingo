import { createPresenceStore } from './presence';

describe('PresenceStore', () => {
  it('conta wallets distintas, não sockets', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r1', 'alice'); // 2ª aba da mesma wallet
    p.add('r1', 'bob');
    expect(p.count('r1')).toBe(2); // alice + bob, não 3
  });

  it('remove wallet só quando todos os sockets dela saem', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r1', 'alice');
    p.remove('r1', 'alice');
    expect(p.count('r1')).toBe(1); // ainda 1 socket da alice
    p.remove('r1', 'alice');
    expect(p.count('r1')).toBe(0);
  });

  it('remove tolera wallet/sala inexistente', () => {
    const p = createPresenceStore();
    expect(() => p.remove('rX', 'ghost')).not.toThrow();
    expect(p.count('rX')).toBe(0);
  });

  it('salas são independentes', () => {
    const p = createPresenceStore();
    p.add('r1', 'alice');
    p.add('r2', 'bob');
    expect(p.count('r1')).toBe(1);
    expect(p.count('r2')).toBe(1);
  });
});
