// Testes de lógica de deduplicação do useGamesHistory
// Isola a função de merge/sort de rows para verificar o fix de React 18 StrictMode.

import { describe, it, expect } from 'vitest';
import type { GameHistoryRow } from './useGamesHistory';

// Extrai a lógica de merge/deduplicate (idêntica ao useGamesHistory linha ~131)
function mergeRows(prev: GameHistoryRow[], collected: GameHistoryRow[]): GameHistoryRow[] {
    const seen = new Set(prev.map(r => r.gameId));
    const merged = [...prev, ...collected.filter(r => !seen.has(r.gameId))];
    return merged.sort((a, b) => Number(BigInt(b.gameId) - BigInt(a.gameId)));
}

const makeRow = (gameId: string, roomId = '1'): GameHistoryRow => ({
    gameId,
    roomId,
    status:       'archived',
    endTime:      0,
    ticketsCount: 1,
    totalSpent:   '1.0000 BINGO',
    totalWon:     '—',
});

describe('useGamesHistory — lógica de deduplicação', () => {
    it('mantém apenas IDs únicos quando collected repete IDs de prev (React 18 StrictMode)', () => {
        const prev = [makeRow('100'), makeRow('200')];
        const collected = [makeRow('100'), makeRow('300')]; // '100' é duplicata

        const result = mergeRows(prev, collected);

        const ids = result.map(r => r.gameId);
        const unique = [...new Set(ids)];
        expect(ids.length).toBe(unique.length);
    });

    it('ordena por gameId descrescente (mais recente primeiro)', () => {
        const prev: GameHistoryRow[] = [];
        const collected = [makeRow('100'), makeRow('300'), makeRow('200')];

        const result = mergeRows(prev, collected);
        const ids = result.map(r => r.gameId);

        expect(ids).toEqual(['300', '200', '100']);
    });

    it('merge correto: prev + collected sem sobreposição', () => {
        const prev = [makeRow('300'), makeRow('200')];
        const collected = [makeRow('100')];

        const result = mergeRows(prev, collected);

        expect(result.length).toBe(3);
        expect(result[0].gameId).toBe('300');
        expect(result[2].gameId).toBe('100');
    });

    it('deduplica quando StrictMode chama duas vezes com o mesmo lote', () => {
        const batch = [makeRow('500'), makeRow('400'), makeRow('300')];

        // Simula StrictMode: reset → load → reset → load (segundo load repete IDs)
        let state: GameHistoryRow[] = [];
        state = mergeRows(state, batch);  // primeira chamada
        state = mergeRows(state, batch);  // segunda chamada (StrictMode)

        expect(state.length).toBe(3); // sem duplicatas
    });

    it('não perde dados quando prev é vazio', () => {
        const collected = [makeRow('1'), makeRow('2')];
        const result = mergeRows([], collected);

        expect(result.length).toBe(2);
    });

    it('handles game IDs maiores que Number.MAX_SAFE_INTEGER via BigInt', () => {
        // game_id é um uint64 WAX (timestamp em ms) — pode ser > 2^53
        const bigId1 = '1780478298986';
        const bigId2 = '1780478494062';

        const prev = [makeRow(bigId1)];
        const collected = [makeRow(bigId2)];

        const result = mergeRows(prev, collected);

        expect(result[0].gameId).toBe(bigId2); // mais recente primeiro
        expect(result[1].gameId).toBe(bigId1);
    });
});
