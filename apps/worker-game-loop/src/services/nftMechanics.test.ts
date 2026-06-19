// Testes do motor de mecânicas NFT off-chain (ADR-028 §7 — prize boost).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

jest.mock('./atomicSchema', () => ({
    getTemplateSchema: jest.fn(),
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { getTemplateSchema } from './atomicSchema';
import { getBoostNftIds, _resetBoostCache } from './nftMechanics';

const mockGetTableRows   = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockGetTplSchema   = getTemplateSchema as jest.Mock;

// Helper: monta a resposta de get_table_rows por (code, table).
function routeRows(map: Record<string, any[]>) {
    mockGetTableRows.mockImplementation(({ code, table }: any) => {
        const key = `${code}:${table}`;
        return Promise.resolve({ rows: map[key] ?? [], more: false, next_key: '' });
    });
}

const PRIZE_BOOST = 2, TICKET_DISCOUNT = 1, FIXED = 0, SCHEMA_FIELD = 1, OWNS = 0, BURNED = 1;

beforeEach(() => {
    _resetBoostCache();
    mockGetTableRows.mockReset();
    mockGetTplSchema.mockResolvedValue({});
});

describe('getBoostNftIds — pré-computa NFTs de prize boost do vencedor', () => {
    it('retorna asset_ids de templates com PRIZE_BOOST FIXED owns, ordenados por boost desc', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 150, schema_field: '', condition: OWNS } ] },
                { template_id: 20, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 300, schema_field: '', condition: OWNS } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1001', template_id: 10, collection_name: 'cryptobingo1' },
                { asset_id: '1002', template_id: 20, collection_name: 'cryptobingo1' },
            ],
        });
        const ids = await getBoostNftIds('jogador1');
        expect(ids).toEqual(['1002', '1001']); // 300 antes de 150
    });

    it('suporta PRIZE_BOOST VALUE_SCHEMA_FIELD: lê boost do template schema', async () => {
        mockGetTplSchema.mockResolvedValue({ boost_pct: 250 });
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 11, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: SCHEMA_FIELD, fixed_value: 0,
                      schema_field: 'boost_pct', condition: OWNS } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '2001', template_id: 11, collection_name: 'cryptobingo1' },
            ],
        });
        const ids = await getBoostNftIds('jogador1');
        expect(ids).toEqual(['2001']);
        expect(mockGetTplSchema).toHaveBeenCalledWith('cryptobingo1', 11);
    });

    it('SCHEMA_FIELD com campo ausente no schema → ignora template (boost=0 ≤ 100)', async () => {
        mockGetTplSchema.mockResolvedValue({}); // sem boost_pct
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 11, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: SCHEMA_FIELD, fixed_value: 0,
                      schema_field: 'boost_pct', condition: OWNS } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '2001', template_id: 11, collection_name: 'cryptobingo1' },
            ],
        });
        expect(await getBoostNftIds('jogador1')).toEqual([]);
    });

    it('SCHEMA_FIELD e FIXED coexistem: usa o maior entre os dois', async () => {
        mockGetTplSchema.mockResolvedValue({ boost_pct: 200 });
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'col', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED,        fixed_value: 350, schema_field: '',         condition: OWNS },
                    { type: PRIZE_BOOST, value_origin: SCHEMA_FIELD, fixed_value: 0,   schema_field: 'boost_pct', condition: OWNS },
                ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1', template_id: 10, collection_name: 'col' },
            ],
        });
        const ids = await getBoostNftIds('jogador1');
        // melhor = max(350, 200) = 350 → template incluído
        expect(ids).toEqual(['1']);
    });

    it('ignora PRIZE_BOOST condition=BURNED e tipo TICKET_DISCOUNT', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: TICKET_DISCOUNT, value_origin: FIXED, fixed_value: 1000, schema_field: '', condition: OWNS } ] },
                { template_id: 12, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 200, schema_field: '', condition: BURNED } ] },
            ],
            'atomicassets:assets': [
                { asset_id: '1', template_id: 10, collection_name: 'cryptobingo1' },
                { asset_id: '3', template_id: 12, collection_name: 'cryptobingo1' },
            ],
        });
        expect(await getBoostNftIds('jogador1')).toEqual([]);
    });

    it('exige match de coleção (template certo, coleção errada → ignora)', async () => {
        routeRows({
            'bingogamectr:nftconfigs': [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [
                    { type: PRIZE_BOOST, value_origin: FIXED, fixed_value: 150, schema_field: '', condition: OWNS } ] },
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
