// Testes do serviço de NFTs consumíveis (ADR-028 §3).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

jest.mock('./atomicSchema', () => ({
    getAssetMutableData: jest.fn(),
    buildAttributeMap:   jest.fn(),
}));

jest.mock('./blockchain', () => ({
    executeSetAssetData: jest.fn(),
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { getAssetMutableData, buildAttributeMap } from './atomicSchema';
import { executeSetAssetData } from './blockchain';
import {
    getConsumableRule,
    getCurrentUses,
    decrementNftUse,
    decrementUsedNfts,
} from './consumableService';

const mockRows      = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockGetMutable = getAssetMutableData as jest.Mock;
const mockBuildMap   = buildAttributeMap as jest.Mock;
const mockSetData    = executeSetAssetData as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockGetMutable.mockResolvedValue({ decoded: {}, format: [] });
    mockBuildMap.mockReturnValue([]);
    mockSetData.mockResolvedValue('txid');
});

// ── getConsumableRule ─────────────────────────────────────────────────────

describe('getConsumableRule', () => {
    it('retorna regra consumível quando max_uses > 0', async () => {
        mockRows.mockResolvedValue({
            rows: [{
                template_id: 10, collection_name: 'cryptobingo1',
                rules: [
                    { type: 2, max_uses: 5, schema_field: 'uses_remaining' },
                ],
            }],
            more: false,
        });
        const rule = await getConsumableRule(10);
        expect(rule).toEqual({ maxUses: 5, usesField: 'uses_remaining', ruleType: 2 });
    });

    it('retorna null quando max_uses = 0 (ilimitado)', async () => {
        mockRows.mockResolvedValue({
            rows: [{
                template_id: 10, collection_name: 'cryptobingo1',
                rules: [{ type: 2, max_uses: 0, schema_field: '' }],
            }],
            more: false,
        });
        expect(await getConsumableRule(10)).toBeNull();
    });

    it('retorna null quando template não existe', async () => {
        mockRows.mockResolvedValue({ rows: [], more: false });
        expect(await getConsumableRule(99)).toBeNull();
    });

    it('usa "uses_remaining" como campo padrão quando schema_field vazio', async () => {
        mockRows.mockResolvedValue({
            rows: [{
                template_id: 10, collection_name: 'col',
                rules: [{ type: 1, max_uses: 3, schema_field: '' }],
            }],
            more: false,
        });
        const rule = await getConsumableRule(10);
        expect(rule?.usesField).toBe('uses_remaining');
    });
});

// ── getCurrentUses ────────────────────────────────────────────────────────

describe('getCurrentUses', () => {
    it('retorna valor numérico do campo de usos', async () => {
        mockGetMutable.mockResolvedValue({ decoded: { uses_remaining: 3 }, format: [] });
        expect(await getCurrentUses('jogador1', '999', 'col', 'uses_remaining')).toBe(3);
    });

    it('parseia valor string como número', async () => {
        mockGetMutable.mockResolvedValue({ decoded: { uses_remaining: '7' }, format: [] });
        expect(await getCurrentUses('jogador1', '999', 'col', 'uses_remaining')).toBe(7);
    });

    it('retorna null quando campo ausente', async () => {
        mockGetMutable.mockResolvedValue({ decoded: {}, format: [] });
        expect(await getCurrentUses('jogador1', '999', 'col', 'uses_remaining')).toBeNull();
    });
});

// ── decrementNftUse ───────────────────────────────────────────────────────

describe('decrementNftUse', () => {
    it('decrementa campo e chama setassetdata', async () => {
        const format = [{ name: 'uses_remaining', type: 4 }];
        mockGetMutable.mockResolvedValue({ decoded: { uses_remaining: 3 }, format });
        mockBuildMap.mockReturnValue([{ first: 'uses_remaining', second: ['uint32', 2] }]);

        const ok = await decrementNftUse('jogador1', '999', 'cryptobingo1', 'uses_remaining');

        expect(ok).toBe(true);
        expect(mockBuildMap).toHaveBeenCalledWith({ uses_remaining: 2 }, format);
        expect(mockSetData).toHaveBeenCalledWith(
            'jogador1', '999', 'cryptobingo1',
            [{ first: 'uses_remaining', second: ['uint32', 2] }],
        );
    });

    it('retorna false e não chama setassetdata quando campo ausente', async () => {
        mockGetMutable.mockResolvedValue({ decoded: {}, format: [] });
        const ok = await decrementNftUse('jogador1', '999', 'col', 'uses_remaining');
        expect(ok).toBe(false);
        expect(mockSetData).not.toHaveBeenCalled();
    });

    it('retorna false quando usos já em 0', async () => {
        mockGetMutable.mockResolvedValue({ decoded: { uses_remaining: 0 }, format: [] });
        const ok = await decrementNftUse('jogador1', '999', 'col', 'uses_remaining');
        expect(ok).toBe(false);
        expect(mockSetData).not.toHaveBeenCalled();
    });

    it('retorna false sem lançar quando setassetdata falha', async () => {
        mockGetMutable.mockResolvedValue({
            decoded: { uses_remaining: 2 },
            format: [{ name: 'uses_remaining', type: 4 }],
        });
        mockBuildMap.mockReturnValue([{ first: 'uses_remaining', second: ['uint32', 1] }]);
        mockSetData.mockRejectedValue(new Error('not authorized'));

        const ok = await decrementNftUse('jogador1', '999', 'col', 'uses_remaining');
        expect(ok).toBe(false);
    });
});

// ── decrementUsedNfts ─────────────────────────────────────────────────────

describe('decrementUsedNfts', () => {
    it('no-op para lista vazia', async () => {
        await decrementUsedNfts('jogador1', []);
        expect(mockRows).not.toHaveBeenCalled();
    });

    it('decrementa apenas NFTs consumíveis', async () => {
        // Asset 111 → template 10 com max_uses=3; asset 222 → template 20 sem consumível
        mockRows
            // get_table_rows para asset 111
            .mockResolvedValueOnce({
                rows: [{ asset_id: '111', template_id: '10', collection_name: 'col' }],
                more: false,
            })
            // getConsumableRule para template 10 → consumível
            .mockResolvedValueOnce({
                rows: [{
                    template_id: 10, collection_name: 'col',
                    rules: [{ type: 2, max_uses: 3, schema_field: 'uses_remaining' }],
                }],
                more: false,
            })
            // get_table_rows para asset 222
            .mockResolvedValueOnce({
                rows: [{ asset_id: '222', template_id: '20', collection_name: 'col' }],
                more: false,
            })
            // getConsumableRule para template 20 → não consumível
            .mockResolvedValueOnce({
                rows: [{
                    template_id: 20, collection_name: 'col',
                    rules: [{ type: 2, max_uses: 0, schema_field: '' }],
                }],
                more: false,
            });

        mockGetMutable.mockResolvedValue({
            decoded: { uses_remaining: 2 },
            format: [{ name: 'uses_remaining', type: 4 }],
        });
        mockBuildMap.mockReturnValue([{ first: 'uses_remaining', second: ['uint32', 1] }]);

        await decrementUsedNfts('jogador1', ['111', '222']);

        // Só asset 111 (consumível) → setassetdata 1x
        expect(mockSetData).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledWith('jogador1', '111', 'col', expect.any(Array));
    });

    it('não lança quando asset não encontrado', async () => {
        mockRows.mockResolvedValue({ rows: [], more: false });
        await expect(decrementUsedNfts('jogador1', ['999'])).resolves.not.toThrow();
    });
});
