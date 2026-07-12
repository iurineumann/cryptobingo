// apps/worker-game-loop/src/services/combinationEvaluator.fetchComboContext.test.ts
// ADR-016 — fetchComboContext alinha NOMES on-chain (fonte de verdade)
// com os tipos (simple/special/master) do gateway, para que isComboSatisfied
// conte corretamente quando wonPatternNames vier do contrato.
//
// REGRESSÃO DO BUG B (#260): antes, patternTypeByName era montado com a
// CHAVE = nome do gateway. Como selectBestPayout passa os NOMES ON-CHAIN,
// se eles divergissem (ou por robustez), patternTypeByName.get(name) retornava
// undefined → contagem 0 → combinação NUNCA satisfeita → pagava só padrão simples.
// Agora a chave é o nome on-chain; o type é cruzado pelo nome com o gateway.

import { fetchComboContext, isComboSatisfied } from './combinationEvaluator';
// Mock do cache on-chain: por padrão retorna [] (fallback gateway).
// Nos testes principais passamos onChainPatterns direto, então o cache não é chamado.
jest.mock('./patternCache', () => ({
  fetchPatternsWithCache: jest.fn().mockResolvedValue([]),
}));

// Padrões ON-CHAIN (fonte de verdade) — poderiam, em tese, ter
// formatação diferente do gateway (ex.: espaços vs underscores).
const ON_CHAIN = [
  { name: 'ROW_0', mask: 1n, weight: 100 },
  { name: 'ROW_1', mask: 2n, weight: 100 },
  { name: 'ROW_2', mask: 4n, weight: 100 },
  { name: 'ROW_3', mask: 8n, weight: 100 },
  { name: 'ROW_4', mask: 16n, weight: 100 },
  { name: 'BINGO_N', mask: 32n, weight: 6000 },
];

// Gateway retorna patterns com pattern_id + name, e rules com pattern_id + type.
const GATEWAY_BODY = {
  patterns: [
    { pattern_id: '1', name: 'ROW_0', mask: '1', weight: 100 },
    { pattern_id: '2', name: 'ROW_1', mask: '2', weight: 100 },
    { pattern_id: '3', name: 'ROW_2', mask: '4', weight: 100 },
    { pattern_id: '4', name: 'ROW_3', mask: '8', weight: 100 },
    { pattern_id: '5', name: 'ROW_4', mask: '16', weight: 100 },
    { pattern_id: '13', name: 'BINGO_N', mask: '32', weight: 6000 },
  ],
  rules: [
    { pattern_id: '1', weight: 100, type: 'simple' },
    { pattern_id: '2', weight: 100, type: 'simple' },
    { pattern_id: '3', weight: 100, type: 'simple' },
    { pattern_id: '4', weight: 100, type: 'simple' },
    { pattern_id: '5', weight: 100, type: 'simple' },
    { pattern_id: '13', weight: 6000, type: 'master' },
  ],
  combinations: [
    { combo_id: 0, name: '2 Simples', weight: 250, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] },
    { combo_id: 3, name: '5 Simples', weight: 3906, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 5 }] },
  ],
};

describe('fetchComboContext — alinhamento on-chain (BUG B #260)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => GATEWAY_BODY,
    });
  });

  afterEach(() => {
    (global as any).fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('monta patternTypeByName com CHAVE = nome on-chain', async () => {
    const ctx = await fetchComboContext('1', ON_CHAIN as any);
    expect(ctx.patternTypeByName.get('ROW_0')).toBe('simple');
    expect(ctx.patternTypeByName.get('ROW_4')).toBe('simple');
    expect(ctx.patternTypeByName.get('BINGO_N')).toBe('master');
    expect(ctx.patternTypeByName.size).toBe(ON_CHAIN.length);
  });

  it('patternNameById mapeia pattern_id (gateway) -> nome on-chain', async () => {
    const ctx = await fetchComboContext('1', ON_CHAIN as any);
    expect(ctx.patternNameById.get('1')).toBe('ROW_0');
    expect(ctx.patternNameById.get('13')).toBe('BINGO_N');
  });

  it('combinações são carregadas do gateway', async () => {
    const ctx = await fetchComboContext('1', ON_CHAIN as any);
    expect(ctx.combos).toHaveLength(2);
    expect(ctx.combos[1].name).toBe('5 Simples');
  });

  it('2 Simples satisfaz com 2 nomes on-chain (conta via patternTypeByName on-chain)', async () => {
    const ctx = await fetchComboContext('1', ON_CHAIN as any);
    const won = new Set(['ROW_0', 'ROW_1']); // NOMES ON-CHAIN
    const combo = ctx.combos[0]; // 2 Simples
    expect(isComboSatisfied(combo, won, ctx.patternTypeByName, ctx.patternNameById)).toBe(true);
  });

  it('5 Simples satisfaz com 5 nomes on-chain', async () => {
    const ctx = await fetchComboContext('1', ON_CHAIN as any);
    const won = new Set(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4']);
    const combo = ctx.combos[1]; // 5 Simples
    expect(isComboSatisfied(combo, won, ctx.patternTypeByName, ctx.patternNameById)).toBe(true);
  });

  it('fallback para gateway quando onChainPatterns não vem', async () => {
    const ctx = await fetchComboContext('1');
    // No fallback, a chave é o nome do gateway (comportamento anterior)
    expect(ctx.patternTypeByName.get('ROW_0')).toBe('simple');
  });
});
