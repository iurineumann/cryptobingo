// apps/frontend/src/components/ticketUtils.nearmiss.test.ts
import { describe, it, expect } from 'vitest';
import { computeTicketNearMiss, type Pattern } from './ticketUtils';

// Matriz canônica (24 números; FREE SPACE inserido em [2][2] pelo flat)
// B:1-5 I:16-20 N:31-34 G:46-50 O:61-65 → flat por linhas:
// linha0: B1,I16,N31,G46,O61  (índices 0..4)
const MATRIX = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34, 46,47,48,49,50, 61,62,63,64,65];

// Padrão "linha 0": índices 0,1,2,3,4 (col B,I,N,G,O da 1ª linha).
const LINHA0: Pattern = { name: 'Linha 0', prize: '2', cells: [true,true,true,true,true, ...Array(20).fill(false)] };

describe('computeTicketNearMiss', () => {
  it('marca near-miss quando falta exatamente 1 célula', () => {
    // linha0 = B1,I16,N31,G46,O61. Sorteia todas menos O61 (índice 4).
    const drawn = new Set([1, 16, 31, 46]); // N31 também marcado; falta O61
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(1);
    expect(r.nearMissCells.has(4)).toBe(true);
    expect(r.nearMissCells.size).toBe(1);
  });

  it('não marca near-miss quando faltam 2+ células', () => {
    const drawn = new Set([1, 16]); // faltam N31(2), G46(3), O61(4) → mas N31 é número real aqui
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(0);
    expect(r.nearMissCells.size).toBe(0);
    expect(r.closestPct).toBeCloseTo(2 / 5, 5); // 2 de 5 marcadas
  });

  it('padrão já completo não conta como near-miss nem entra em closestPct', () => {
    const drawn = new Set([1, 16, 31, 46, 61]); // linha0 completa
    const r = computeTicketNearMiss(MATRIX, drawn, [LINHA0]);
    expect(r.patternsOneAway).toBe(0);
    expect(r.closestPct).toBe(0); // nenhum padrão não-completo
  });

  it('FREE SPACE conta como marcado', () => {
    // Padrão que inclui o centro (índice 12). Faltando só o centro? centro é free → marcado.
    const comCentro: Pattern = { name: 'cruz-mini', prize: '3', cells: (() => { const c = Array(25).fill(false); c[12] = true; c[7] = true; return c; })() };
    const drawn = new Set<number>([]); // nada sorteado
    const r = computeTicketNearMiss(MATRIX, drawn, [comCentro]);
    // requer índices 7 (N-coluna linha1 = valor 32) e 12 (free, marcado). Falta só o 7 → near-miss.
    expect(r.patternsOneAway).toBe(1);
    expect(r.nearMissCells.has(7)).toBe(true);
  });
});
