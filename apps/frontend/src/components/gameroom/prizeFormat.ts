// Utils puros de exibição de prêmio. NÃO recalculam economia (ADR-010):
// apenas fazem parse/soma de valores que o worker/chain já resolveram.

/** Quebra "10.0000 WAX" em { amount: 10, symbol: 'WAX' }. Tolerante a vazio. */
export function parseAsset(quantity: string): { amount: number; symbol: string } {
  const parts = (quantity ?? '').trim().split(/\s+/);
  const amount = parseFloat(parts[0]) || 0;
  const symbol = parts[1] ?? '';
  return { amount, symbol };
}

/** Soma payouts (strings "x.yyyy SYM") agrupando por símbolo de moeda.
 *  Retorna [{ symbol, total }] ordenado por total desc. */
export function sumPayoutsByCurrency(payouts: string[]): Array<{ symbol: string; total: number }> {
  const map = new Map<string, number>();
  for (const p of payouts) {
    const { amount, symbol } = parseAsset(p);
    if (!symbol) continue;
    map.set(symbol, (map.get(symbol) ?? 0) + amount);
  }
  return [...map.entries()]
    .map(([symbol, total]) => ({ symbol, total }))
    .sort((a, b) => b.total - a.total);
}

/** Conta vencedores distintos (ticket_id) numa lista de winners. */
export function countWinners(winners: Array<{ ticket_id: string }>): number {
  return new Set(winners.map(w => w.ticket_id)).size;
}
