// Testes do motor de mecânicas NFT off-chain (ADR-028 §7 — prize boost).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { getBoostNftIds, _resetBoostCache } from './nftMechanics';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;

// Helper: monta a resposta de get_table_rows por (code, table).
function routeRows(map: Record<string, any[]>) {
    mockGetTableRows.mockImplementation(({ code, table }: any) => {
        const key = `${code}:${table}`;
        return Promise.resolve({ rows: map[key] ?? [], more: false, next_key: '' });
    });
}

const PRIZE_BOOST = 2, TICKET_DISCOUNT = 1, FIXED = 0, OWNS = 0, BURNED = 1;

beforeEach(() => {
    _resetBoostCache();
    mockGetTableRows.mockReset();
});

describe('getBoostNftIds — pré-computa NFTs de prize boost do vencedor', () => {
    it('retorna asset_ids de templates com PRIZE_BOOST FIXED owns, ordenados por boost desc', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 150, condition: OWNS } ] },
                { template_id: 20, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 300, condition: OWNS } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1001', template_id: 10, collection_name: 'cryptobingo1' },
                { asset_id: '1002', template_id: 20, collection_name: 'cryptobingo1' },
            ],
        });
        const ids = await getBoostNftIds('jogador1');
        expect(ids).toEqual(['1002', '1001']); // 300 antes de 150
    });

    it('ignora templates sem PRIZE_BOOST e regras não-FIXED/não-owns', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: TICKET_DISCOUNT, value_origin: FIXED, fixed_value: 1000, condition: OWNS } ] },
                { template_id: 11, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: 1 /*SCHEMA_FIELD*/, fixed_value: 0, condition: OWNS } ] },
                { template_id: 12, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 200, condition: BURNED } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1', template_id: 10, collection_name: 'cryptobingo1' },
                { asset_id: '2', template_id: 11, collection_name: 'cryptobingo1' },
                { asset_id: '3', template_id: 12, collection_name: 'cryptobingo1' },
            ],
        });
        expect(await getBoostNftIds('jogador1')).toEqual([]);
    });

    it('exige match de coleção (template certo, coleção errada → ignora)', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 150, condition: OWNS } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1', template_id: 10, collection_name: 'outracolecao' },
            ],
        });
        expect(await getBoostNftIds('jogador1')).toEqual([]);
    });

    it('retorna [] quando não há templates de boost configurados', async () => {
        routeRows({ 'bingogamectr:nftconfigs': [], 'atomicassets:assets': [] });
        expect(await getBoostNftIds('jogador1')).toEqual([]);
    });
});
