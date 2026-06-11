// Testes unitários para utils/rpc.ts
// Verifica o fallback de acesso público (sem sessão) via fetch proxy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTableRows } from './rpc';

describe('fetchTableRows — sem sessão (acesso público)', () => {
    const PARAMS = { code: 'bingogamectr', scope: 'bingogamectr', table: 'games', limit: 1 };

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('chama /v1/chain/get_table_rows com json:true quando session é null', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce({
            ok:   true,
            json: async () => ({ rows: [], more: false }),
        } as Response);

        await fetchTableRows(PARAMS, null);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe('/v1/chain/get_table_rows');
        expect(opts?.method).toBe('POST');
        const body = JSON.parse(opts?.body as string);
        expect(body.json).toBe(true);
        expect(body.code).toBe('bingogamectr');
    });

    it('retorna rows e more da resposta JSON', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce({
            ok:   true,
            json: async () => ({ rows: [{ game_id: '1' }], more: true, next_key: '2' }),
        } as Response);

        const result = await fetchTableRows(PARAMS, null);

        expect(result.rows).toHaveLength(1);
        expect(result.more).toBe(true);
        expect(result.next_key).toBe('2');
    });

    it('lança erro se a resposta não for ok', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

        await expect(fetchTableRows(PARAMS, null)).rejects.toThrow('RPC error: 500');
    });

    it('usa session.client quando session está presente', async () => {
        const mockGetTableRows = vi.fn().mockResolvedValueOnce({
            rows: [{ game_id: '99' }],
            more: false,
            next_key: undefined,
        });
        const mockSession = {
            client: {
                v1: { chain: { get_table_rows: mockGetTableRows } },
            },
        } as any;

        const result = await fetchTableRows(PARAMS, mockSession);

        expect(mockGetTableRows).toHaveBeenCalledOnce();
        expect(fetch).not.toHaveBeenCalled();
        expect(result.rows[0]).toEqual({ game_id: '99' });
    });
});
