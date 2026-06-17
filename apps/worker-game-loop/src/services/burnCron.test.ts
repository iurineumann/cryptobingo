// Testes do cron de burn sync (ADR-028 §8 — modo automático).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

const mockRedisGet    = jest.fn();
const mockRedisSet    = jest.fn();
const mockRedisSadd   = jest.fn();
const mockRedisSadd2  = jest.fn();
const mockRedisSMembers = jest.fn();
jest.mock('./redis', () => ({
    redisClient: {
        get:      (...args: any[]) => mockRedisGet(...args),
        set:      (...args: any[]) => mockRedisSet(...args),
        sAdd:     (...args: any[]) => mockRedisSadd(...args),
        sMembers: (...args: any[]) => mockRedisSMembers(...args),
    },
}));

jest.mock('./blockchain', () => ({
    executeRecordBurn: jest.fn(),
}));

jest.mock('./xpEngine', () => ({
    awardBurnXP: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./burnSync', () => ({
    syncBurns: jest.fn(),
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { executeRecordBurn } from './blockchain';
import { syncBurns } from './burnSync';
import {
    fetchBurnToClaimTemplates,
    fetchBurnsFromApi,
    syncPlayerBurns,
    addBurnWatchPlayer,
    runBurnSyncCycle,
} from './burnCron';

const mockRows   = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockRecord = executeRecordBurn as jest.Mock;
const mockSync   = syncBurns as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSMembers.mockResolvedValue([]);
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisSadd.mockResolvedValue(1);
    delete process.env.ATOMICASSETS_API_URL;
    delete process.env.BURN_WATCH_PLAYERS;
});

// ── fetchBurnToClaimTemplates ─────────────────────────────────────────────

describe('fetchBurnToClaimTemplates', () => {
    it('retorna templates com regra type=4 (BURN_TO_CLAIM)', async () => {
        mockRows.mockResolvedValue({
            rows: [
                { template_id: 10, collection_name: 'cryptobingo1', rules: [{ type: 4 }] },
                { template_id: 20, collection_name: 'cryptobingo1', rules: [{ type: 2 }] }, // PRIZE_BOOST — ignorar
                { template_id: 30, collection_name: 'cryptobingo1', rules: [{ type: 4 }, { type: 2 }] },
            ],
            more: false, next_key: '',
        });
        const result = await fetchBurnToClaimTemplates();
        expect(result).toEqual([
            { templateId: '10', collection: 'cryptobingo1' },
            { templateId: '30', collection: 'cryptobingo1' },
        ]);
    });

    it('retorna [] quando nenhum template tem BURN_TO_CLAIM', async () => {
        mockRows.mockResolvedValue({
            rows: [{ template_id: 20, collection_name: 'cryptobingo1', rules: [{ type: 2 }] }],
            more: false, next_key: '',
        });
        expect(await fetchBurnToClaimTemplates()).toEqual([]);
    });

    it('retorna [] quando nftconfigs está vazia', async () => {
        mockRows.mockResolvedValue({ rows: [], more: false, next_key: '' });
        expect(await fetchBurnToClaimTemplates()).toEqual([]);
    });

    it('pagina corretamente nftconfigs', async () => {
        mockRows
            .mockResolvedValueOnce({
                rows: [{ template_id: 10, collection_name: 'col1', rules: [{ type: 4 }] }],
                more: true, next_key: '11',
            })
            .mockResolvedValueOnce({
                rows: [{ template_id: 11, collection_name: 'col1', rules: [{ type: 4 }] }],
                more: false, next_key: '',
            });
        const result = await fetchBurnToClaimTemplates();
        expect(result).toHaveLength(2);
        expect(result.map(t => t.templateId)).toEqual(['10', '11']);
    });
});

// ── fetchBurnsFromApi ─────────────────────────────────────────────────────

describe('fetchBurnsFromApi', () => {
    const templates = [{ templateId: '10', collection: 'cryptobingo1' }];

    beforeEach(() => {
        process.env.ATOMICASSETS_API_URL = 'http://localhost:8080';
    });

    it('parseia burns da API e filtra por template', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                data: [
                    { owner: 'jogador1', asset_id: '999', template: { template_id: 10 }, collection: { collection_name: 'cryptobingo1' } },
                    { owner: 'jogador2', asset_id: '888', template: { template_id: 99 }, collection: { collection_name: 'cryptobingo1' } }, // template 99 — ignorar
                ],
            }),
        } as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: [] }),
        } as any);

        const burns = await fetchBurnsFromApi(templates);
        expect(burns).toEqual([
            { owner: 'jogador1', assetId: '999', templateId: '10', collection: 'cryptobingo1' },
        ]);
    });

    it('retorna [] quando API retorna sucesso=false', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: false, data: [] }),
        } as any);
        expect(await fetchBurnsFromApi(templates)).toEqual([]);
    });

    it('retorna [] e não lança quando fetch falha', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        expect(await fetchBurnsFromApi(templates)).toEqual([]);
    });
});

// ── syncPlayerBurns ───────────────────────────────────────────────────────

describe('syncPlayerBurns', () => {
    const templates = [{ templateId: '10', collection: 'cryptobingo1' }];

    it('usa union de snapshot + current como candidatos', async () => {
        // Snapshot: [A, B]; Current on-chain: [A] — B queimou
        mockRedisGet.mockResolvedValue(JSON.stringify([
            { assetId: 'A', templateId: 10, collection: 'cryptobingo1' },
            { assetId: 'B', templateId: 10, collection: 'cryptobingo1' },
        ]));
        mockRows.mockResolvedValue({
            rows: [{ asset_id: 'A', template_id: '10', collection_name: 'cryptobingo1' }],
            more: false, next_key: '',
        });
        mockSync.mockResolvedValue(['B']);

        const recorded = await syncPlayerBurns('jogador1', templates);

        expect(mockSync).toHaveBeenCalledWith('jogador1', expect.arrayContaining([
            expect.objectContaining({ assetId: 'A' }),
            expect.objectContaining({ assetId: 'B' }),
        ]));
        expect(recorded).toEqual(['B']);
        // Snapshot salvo = só os ativos possuídos agora
        expect(mockRedisSet).toHaveBeenCalledWith(
            'burn:snapshot:jogador1',
            JSON.stringify([{ assetId: 'A', templateId: 10, collection: 'cryptobingo1' }]),
            { EX: 604800 },
        );
    });

    it('snapshot nulo → usa apenas assets atuais como candidatos', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockRows.mockResolvedValue({
            rows: [{ asset_id: 'A', template_id: '10', collection_name: 'cryptobingo1' }],
            more: false, next_key: '',
        });
        mockSync.mockResolvedValue([]);

        await syncPlayerBurns('jogador1', templates);

        expect(mockSync).toHaveBeenCalledWith('jogador1', [
            { assetId: 'A', templateId: 10, collection: 'cryptobingo1' },
        ]);
    });

    it('ignora assets on-chain de outros templates', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockRows.mockResolvedValue({
            rows: [
                { asset_id: 'A', template_id: '10', collection_name: 'cryptobingo1' },
                { asset_id: 'B', template_id: '99', collection_name: 'cryptobingo1' }, // template não configurado
            ],
            more: false, next_key: '',
        });
        mockSync.mockResolvedValue([]);

        await syncPlayerBurns('jogador1', templates);

        expect(mockSync).toHaveBeenCalledWith('jogador1', [
            { assetId: 'A', templateId: 10, collection: 'cryptobingo1' },
        ]);
    });
});

// ── addBurnWatchPlayer ────────────────────────────────────────────────────

describe('addBurnWatchPlayer', () => {
    it('adiciona owner ao set Redis', async () => {
        await addBurnWatchPlayer('jogador1');
        expect(mockRedisSadd).toHaveBeenCalledWith('burn:watch_players', 'jogador1');
    });
});

// ── runBurnSyncCycle ──────────────────────────────────────────────────────

describe('runBurnSyncCycle — modo API', () => {
    beforeEach(() => {
        process.env.ATOMICASSETS_API_URL = 'http://localhost:8080';
        mockRows.mockResolvedValue({
            rows: [{ template_id: 10, collection_name: 'cryptobingo1', rules: [{ type: 4 }] }],
            more: false, next_key: '',
        });
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: [
                        { owner: 'jogador1', asset_id: '999', template: { template_id: 10 }, collection: { collection_name: 'cryptobingo1' } },
                    ],
                }),
            } as any);
    });

    it('chama recordburn para burns da API', async () => {
        mockRecord.mockResolvedValue('txid1');
        const result = await runBurnSyncCycle();
        expect(mockRecord).toHaveBeenCalledWith('jogador1', '999', '10', 'cryptobingo1');
        expect(result.processed).toBe(1);
        expect(result.skipped).toBe(0);
    });

    it('trata "ja registrado" como skipped (não lança)', async () => {
        mockRecord.mockRejectedValue(new Error('Burn ja registrado para este asset_id.'));
        const result = await runBurnSyncCycle();
        expect(result.processed).toBe(0);
        expect(result.skipped).toBe(1);
    });

    it('retorna processed=0,skipped=0 sem templates BURN_TO_CLAIM', async () => {
        mockRows.mockResolvedValue({
            rows: [{ template_id: 20, collection_name: 'cryptobingo1', rules: [{ type: 2 }] }],
            more: false, next_key: '',
        });
        const result = await runBurnSyncCycle();
        expect(result).toEqual({ processed: 0, skipped: 0 });
        expect(mockRecord).not.toHaveBeenCalled();
    });
});

describe('runBurnSyncCycle — modo dev (sem API URL)', () => {
    beforeEach(() => {
        delete process.env.ATOMICASSETS_API_URL;
        process.env.BURN_WATCH_PLAYERS = 'jogador1,jogador2';
        mockRows
            // fetchBurnToClaimTemplates
            .mockResolvedValueOnce({
                rows: [{ template_id: 10, collection_name: 'cryptobingo1', rules: [{ type: 4 }] }],
                more: false, next_key: '',
            })
            // getCurrentBurnToClaimAssets jogador1
            .mockResolvedValueOnce({ rows: [], more: false, next_key: '' })
            // getCurrentBurnToClaimAssets jogador2
            .mockResolvedValueOnce({ rows: [], more: false, next_key: '' });
        mockSync.mockResolvedValue(['999']);
    });

    it('itera jogadores do env e acumula registros', async () => {
        const result = await runBurnSyncCycle();
        expect(mockSync).toHaveBeenCalledTimes(2);
        // jogador1 + jogador2 → 1 burn cada
        expect(result.processed).toBe(2);
    });
});
