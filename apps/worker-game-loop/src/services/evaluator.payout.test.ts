import { computePayoutAmount } from './evaluator';

describe('computePayoutAmount', () => {
  it('calcula payout básico: 10.0000 × 1 × 500 / 100 = 50.00', () => {
    const result = computePayoutAmount('10.0000 BINGO', 1, 500, 0);
    expect(result).toEqual({ amount: 50, currency: 'BINGO' });
  });

  it('usa baseMultiplier > 1: 10.0000 × 3 × 500 / 100 = 150', () => {
    const result = computePayoutAmount('10.0000 BINGO', 3, 500, 0);
    expect(result).toEqual({ amount: 150, currency: 'BINGO' });
  });

  it('usa weight em hundredths: 10.0000 × 1 × 150 / 100 = 15.00', () => {
    const result = computePayoutAmount('10.0000 BINGO', 1, 150, 0);
    expect(result).toEqual({ amount: 15, currency: 'BINGO' });
  });

  it('goldenMultiplier > 1 multiplica: 10 × 1 × 500 / 100 × 5 = 250', () => {
    const result = computePayoutAmount('10.0000 BINGO', 1, 500, 5);
    expect(result).toEqual({ amount: 250, currency: 'BINGO' });
  });

  it('goldenMultiplier = 0 não altera (mesmo que sem golden)', () => {
    const base = computePayoutAmount('10.0000 BINGO', 1, 500, 0);
    const withZero = computePayoutAmount('10.0000 BINGO', 1, 500, 0);
    expect(withZero).toEqual(base);
  });

  it('goldenMultiplier = 1 não altera', () => {
    const base = computePayoutAmount('10.0000 BINGO', 1, 500, 0);
    const withOne = computePayoutAmount('10.0000 BINGO', 1, 500, 1);
    expect(withOne).toEqual(base);
  });

  it('goldenMultiplier 100x: 10 × 1 × 500 / 100 × 100 = 5000', () => {
    const result = computePayoutAmount('10.0000 BINGO', 1, 500, 100);
    expect(result).toEqual({ amount: 5000, currency: 'BINGO' });
  });

  it('parseia quantity com formato diferente: "0.0100 TOKEN"', () => {
    const result = computePayoutAmount('0.0100 TOKEN', 1, 10000, 0);
    expect(result).toEqual({ amount: 1, currency: 'TOKEN' });
  });

  it('parseia quantity sem espaço: "5.0000WAX"', () => {
    const result = computePayoutAmount('5.0000 WAX', 1, 200, 0);
    expect(result).toEqual({ amount: 10, currency: 'WAX' });
  });

  it('arredonda para 4 casas: payout 0.00005 → 0.0001 (round up)', () => {
    const result = computePayoutAmount('0.0001 BINGO', 1, 50, 0);
    expect(result.amount).toBe(0.0001);
  });

  it('arredonda para 4 casas: payout 0.00004 → 0.0000 (round down)', () => {
    const result = computePayoutAmount('0.0001 BINGO', 1, 40, 0);
    expect(result.amount).toBe(0);
  });

  it('preço zero → payout zero', () => {
    const result = computePayoutAmount('0.0000 BINGO', 1, 500, 10);
    expect(result).toEqual({ amount: 0, currency: 'BINGO' });
  });

  it('baseMultiplier zero → payout zero', () => {
    const result = computePayoutAmount('10.0000 BINGO', 0, 500, 5);
    expect(result).toEqual({ amount: 0, currency: 'BINGO' });
  });

  it('goldenMultiplier + baseMultiplier + weight combinados: 5 × 2 × 250 / 100 × 10 = 250', () => {
    const result = computePayoutAmount('5.0000 BINGO', 2, 250, 10);
    expect(result).toEqual({ amount: 250, currency: 'BINGO' });
  });

  it('weight máximo 25500 (255.00×): 1.0000 × 1 × 25500 / 100 = 255', () => {
    const result = computePayoutAmount('1.0000 BINGO', 1, 25500, 0);
    expect(result).toEqual({ amount: 255, currency: 'BINGO' });
  });

  it('currency default WAX quando quantity sem token', () => {
    const result = computePayoutAmount('10.0000', 1, 500, 0);
    expect(result.currency).toBe('WAX');
  });
});
