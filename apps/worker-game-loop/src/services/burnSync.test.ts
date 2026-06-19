// Testes do burn sync (ADR-028 §8).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('./blockchain', () => ({
    executeRecordBurn: jest.fn(),
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { executeRecordBurn } from './blockchain';
import { syncBurns, getOwnedAssetIds } from './burnSync';

const mockRows = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockRecord = executeRecordBurn as jest.Mock;

beforeEach(() => { mockRows.mockReset(); mockRecord.mockReset(); });

function ownedAssets(ids: string[]) {
    mockRows.mockResolvedValue({ rows: ids.map(id => ({ asset_id: id })), more: false, next_key: '' });
}

describe('syncBurns — registra burns por ausência na carteira', () => {
    it('registra recordburn para candidatos que não estão mais na carteira', async () => {
        ownedAssets(['100']); // só mantém 100
        const recorded = await syncBurns('jogador1', [
            { assetId: '100', templateId: 1, collection: 'cryptobingo1' }, // ainda possui
            { assetId: '200', templateId: 2, collection: 'cryptobingo1' }, // sumiu → burn
            { assetId: '300', templateId: 2, collection: 'cryptobingo1' }, // sumiu → burn
        ]);
        expect(recorded).toEqual(['200', '300']);
        expect(mockRecord).toHaveBeenCalledTimes(2);
        expect(mockRecord).toHaveBeenCalledWith('jogador1', '200', 2, 'cryptobingo1');
    });

    it('não registra nada se todos os candidatos ainda estão na carteira', async () => {
        ownedAssets(['100', '200']);
        const recorded = await syncBurns('jogador1', [
            { assetId: '100', templateId: 1, collection: 'cryptobingo1' },
            { assetId: '200', templateId: 2, collection: 'cryptobingo1' },
        ]);
        expect(recorded).toEqual([]);
        expect(mockRecord).not.toHaveBeenCalled();
    });

    it('trata "Burn ja registrado" como no-op (idempotência)', async () => {
        ownedAssets([]);
        mockRecord.mockRejectedValueOnce(new Error('assertion failure with message: Burn ja registrado para este asset_id.'));
        const recorded = await syncBurns('jogador1', [
            { assetId: '200', templateId: 2, collection: 'cryptobingo1' },
        ]);
        expect(recorded).toEqual([]); // rejeição idempotente → não conta como registrado
    });

    it('lista vazia → no-op sem consultar a chain', async () => {
        const recorded = await syncBurns('jogador1', []);
        expect(recorded).toEqual([]);
        expect(mockRows).not.toHaveBeenCalled();
    });
});

describe('getOwnedAssetIds', () => {
    it('agrega asset_ids da carteira (paginação)', async () => {
        mockRows
            .mockResolvedValueOnce({ rows: [{ asset_id: '1' }, { asset_id: '2' }], more: true, next_key: '3' })
            .mockResolvedValueOnce({ rows: [{ asset_id: '3' }], more: false, next_key: '' });
        const owned = await getOwnedAssetIds('jogador1');
        expect([...owned].sort()).toEqual(['1', '2', '3']);
    });
});
