// apps/frontend/src/components/gameroom/prizeFormat.test.ts
import { describe, it, expect } from 'vitest';
import { parseAsset, sumPayoutsByCurrency, countWinners } from './prizeFormat';

describe('parseAsset', () => {
  it('quebra quantidade e símbolo', () => {
    expect(parseAsset('10.0000 WAX')).toEqual({ amount: 10, symbol: 'WAX' });
  });
  it('tolera string vazia', () => {
    expect(parseAsset('')).toEqual({ amount: 0, symbol: '' });
  });
});

describe('sumPayoutsByCurrency', () => {
  it('soma por moeda e ordena desc', () => {
    const r = sumPayoutsByCurrency(['1.0000 WAX', '2.5000 WAX', '3.0000 USDT']);
    expect(r).toEqual([
      { symbol: 'WAX', total: 3.5 },
      { symbol: 'USDT', total: 3 },
    ]);
  });
  it('ignora payouts vazios', () => {
    expect(sumPayoutsByCurrency(['', '1.0000 WAX'])).toEqual([{ symbol: 'WAX', total: 1 }]);
  });
});

describe('countWinners', () => {
  it('conta ticket_id distintos', () => {
    expect(countWinners([{ ticket_id: '1' }, { ticket_id: '1' }, { ticket_id: '2' }])).toBe(2);
  });
});
