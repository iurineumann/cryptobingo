process.env.CONTRACT_ACCOUNT = 'bingogamectr';
process.env.RPC_URL = 'http://localhost:8888';
process.env.CHAIN_ID = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

jest.mock('../models/playerProgression', () => ({
    PlayerProgression: {
        findOne: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock('./atomicSchema', () => ({
    getRarity: jest.fn().mockResolvedValue(3),
}));

const mockFetchGame = jest.fn();
const mockGetTableRows = jest.fn();

jest.mock('@cryptobingo/blockchain-core', () => ({
    fetchGame: (...args: any[]) => mockFetchGame(...args),
    rpcClient: { v1: { chain: { get_table_rows: (...args: any[]) => mockGetTableRows(...args) } } },
}));

import { PlayerProgression } from '../models/playerProgression';
import { getRarity } from './atomicSchema';
import {
    totalXp,
    deriveLevel,
    awardPlayerXP,
    awardWinXP,
    awardComboXP,
    awardBurnXP,
    awardTicketPurchaseXP,
    getDifficulty,
} from './xpEngine';

const mockFindOne = PlayerProgression.findOne as jest.Mock;
const mockUpdateOne = PlayerProgression.updateOne as jest.Mock;
const mockGetRarity = getRarity as jest.Mock<Promise<number>>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('totalXp — curva φ-tier (9 tiers, BASE_XP=906)', () => {
    it('level 1 = 906 × (1/25)²', () => {
        expect(totalXp(1)).toBe(Math.floor(906 * Math.pow(1/25, 2)));
    });

    it('level 25 = Cobre cap = 906', () => {
        expect(totalXp(25)).toBe(906);
    });

    it('level 50 = Bronze cap = 2371', () => {
        expect(totalXp(50)).toBe(2371);
    });

    it('level 75 = Prata cap = 4742', () => {
        expect(totalXp(75)).toBe(4742);
    });

    it('level 225 = Diamante max ≈ 110K', () => {
        const xp = totalXp(225);
        expect(xp).toBeGreaterThan(100000);
        expect(xp).toBeLessThan(120000);
    });

    it('retorna 0 para level <= 0', () => {
        expect(totalXp(0)).toBe(0);
        expect(totalXp(-5)).toBe(0);
    });
});

describe('deriveLevel — level/tier/sub_level do XP', () => {
    it('XP=0 → Cobre lvl 1 sub 1', () => {
        const d = deriveLevel(0);
        expect(d).toEqual({ level: 1, tier: 'Cobre', sub_level: 1 });
    });

    it('XP=906 → Cobre lvl 25 sub 25', () => {
        const d = deriveLevel(906);
        expect(d).toEqual({ level: 25, tier: 'Cobre', sub_level: 25 });
    });

    it('XP=1000 → Bronze lvl 31 sub 6', () => {
        const d = deriveLevel(1000);
        expect(d.tier).toBe('Bronze');
        expect(d.level).toBe(31);
        expect(d.sub_level).toBe(6);
    });

    it('XP=totalXp(150) → Esmeralda lvl 150', () => {
        const xp = totalXp(150);
        const d = deriveLevel(xp);
        expect(d.tier).toBe('Esmeralda');
        expect(d.level).toBeGreaterThanOrEqual(150);
    });

    it('XP max → Diamante lvl 225', () => {
        const d = deriveLevel(999999);
        expect(d).toEqual({ level: 225, tier: 'Diamante', sub_level: 25 });
    });
});

describe('awardPlayerXP — concede XP + daily streak + recalculo de level', () => {
    it('faz updateOne para streak + $inc para XP + $set para level', async () => {
        mockFindOne
            .mockResolvedValueOnce({ daily_streak: { last_date: '', count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 100, level: 1, tier: 'Cobre', sub_level: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 100, level: 1, tier: 'Cobre', sub_level: 1, games_played: 1 } });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardPlayerXP('jogador1', 50);

        // 3 chamadas: streak, $inc xp, level recalc
        expect(mockUpdateOne).toHaveBeenCalledTimes(3);
        expect(mockUpdateOne).toHaveBeenNthCalledWith(2,
            { wallet_address: 'jogador1' },
            { $inc: { 'progression.xp': 52, 'progression.games_played': 1 } },
            { upsert: true },
        );
    });

    it('não faz nada se amount <= 0', async () => {
        await awardPlayerXP('jogador1', 0);
        expect(mockUpdateOne).not.toHaveBeenCalled();
        await awardPlayerXP('jogador1', -5);
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });
});

describe('awardWinXP — vitória com difficulty da sala', () => {
    it('10 × difficulty (padrão)', async () => {
        mockFetchGame.mockResolvedValue({ room_id: '1' });
        mockGetTableRows.mockResolvedValue({ rows: [{ difficulty: 5 }] });
        mockFindOne
            .mockResolvedValueOnce({ daily_streak: { last_date: new Date().toISOString().slice(0, 10), count: 3 } })
            .mockResolvedValueOnce({ progression: { xp: 200, level: 1, tier: 'Cobre', sub_level: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 200, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, wins_count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 200, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, wins_count: 1 } });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardWinXP('jogador1', 'game1');

        // 10×5=50 + streak 3×2=6 = 56
        expect(mockUpdateOne).toHaveBeenNthCalledWith(1,
            { wallet_address: 'jogador1' },
            { $inc: { 'progression.xp': 56, 'progression.games_played': 1 } },
            { upsert: true },
        );
    });

    it('25 × difficulty (VIP)', async () => {
        mockFetchGame.mockResolvedValue({ room_id: '1' });
        mockGetTableRows.mockResolvedValue({ rows: [{ difficulty: 3 }] });
        mockFindOne
            .mockResolvedValueOnce({ daily_streak: { last_date: new Date().toISOString().slice(0, 10), count: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 300, level: 1, tier: 'Cobre', sub_level: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 300, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, wins_count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 300, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, wins_count: 1 } });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardWinXP('jogador1', 'game1', true);

        // 25×3=75 + streak 1×2=2 = 77
        expect(mockUpdateOne).toHaveBeenNthCalledWith(1,
            { wallet_address: 'jogador1' },
            { $inc: { 'progression.xp': 77, 'progression.games_played': 1 } },
            { upsert: true },
        );
    });

    it('retorna sem erro se game não existe', async () => {
        mockFetchGame.mockRejectedValue(new Error('game not found'));
        await awardWinXP('jogador1', 'invalid');
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });
});

describe('awardComboXP', () => {
    it('concede 15 XP + streak', async () => {
        mockFindOne
            .mockResolvedValueOnce({ daily_streak: { last_date: new Date().toISOString().slice(0, 10), count: 2 } })
            .mockResolvedValueOnce({ progression: { xp: 400, level: 1, tier: 'Cobre', sub_level: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 400, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, combos_count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 400, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, combos_count: 1 } });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardComboXP('jogador1');

        expect(mockUpdateOne).toHaveBeenNthCalledWith(1,
            { wallet_address: 'jogador1' },
            { $inc: { 'progression.xp': 19, 'progression.games_played': 1 } },
            { upsert: true },
        );
    });
});

describe('awardBurnXP', () => {
    it('50 + rarity×10 + streak', async () => {
        mockGetRarity.mockResolvedValueOnce(5);
        mockFindOne
            .mockResolvedValueOnce({ daily_streak: { last_date: new Date().toISOString().slice(0, 10), count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 500, level: 1, tier: 'Cobre', sub_level: 1 } })
            .mockResolvedValueOnce({ progression: { xp: 500, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, burns_count: 0 } })
            .mockResolvedValueOnce({ progression: { xp: 500, level: 2, tier: 'Cobre', sub_level: 2, games_played: 1, burns_count: 1 } });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardBurnXP('jogador1', 'collection1', '123');

        // 50+5×10=100 + streak 0 = 100
        expect(mockUpdateOne).toHaveBeenNthCalledWith(1,
            { wallet_address: 'jogador1' },
            { $inc: { 'progression.xp': 100, 'progression.games_played': 1 } },
            { upsert: true },
        );
    });
});

describe('getDifficulty — lê difficulty on-chain', () => {
    it('retorna 1 se sala sem difficulty', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [] });
        expect(await getDifficulty('999')).toBe(1);
    });

    it('retorna valor do campo', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [{ difficulty: 7 }] });
        expect(await getDifficulty('1')).toBe(7);
    });

    it('cap em 10', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [{ difficulty: 15 }] });
        expect(await getDifficulty('1')).toBe(10);
    });
});

describe('awardTicketPurchaseXP', () => {
    it('1 XP por ticket por owner (3 chamadas de updateOne por owner)', async () => {
        mockGetTableRows.mockResolvedValueOnce({
            rows: [
                { owner: 'jogador1', ticket_id: '1' },
                { owner: 'jogador1', ticket_id: '2' },
                { owner: 'jogador2', ticket_id: '3' },
            ],
            more: false,
        });
        mockFindOne
            .mockResolvedValue({
                daily_streak: { last_date: new Date().toISOString().slice(0, 10), count: 0 },
                progression: { xp: 500, level: 1, tier: 'Cobre', sub_level: 1 },
            });
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        await awardTicketPurchaseXP('game1');

        // 2 owners × 2 chamadas ($inc + $set) = 4 updateOne
        expect(mockUpdateOne.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('sem tickets → sem chamadas', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });
        await awardTicketPurchaseXP('empty');
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });
});
