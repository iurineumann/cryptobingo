import { savePrizeTx, saveBuyInTx } from '../prizeTransactionsService';

jest.mock('../../models/PrizeTx', () => ({
    PrizeTx: {
        findOneAndUpdate: jest.fn(() => ({ lean: jest.fn() })),
    },
}));

jest.mock('../../models/BuyInTx', () => ({
    BuyInTx: {
        findOneAndUpdate: jest.fn(() => ({ lean: jest.fn() })),
    },
}));

import { PrizeTx } from '../../models/PrizeTx';
import { BuyInTx } from '../../models/BuyInTx';

const mockPrizeUpsert = PrizeTx.findOneAndUpdate as unknown as jest.Mock;
const mockBuyInUpsert = BuyInTx.findOneAndUpdate as unknown as jest.Mock;

function mockResolved(value: unknown) {
    return { lean: jest.fn().mockResolvedValue(value) };
}

function mockRejected(err: Error) {
    return { lean: jest.fn().mockRejectedValue(err) };
}

beforeEach(() => jest.clearAllMocks());

describe('savePrizeTx', () => {
    const INPUT = {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        winType: 'pattern' as const, winLabel: 'Linha 1', weight: 150,
        amount: '3.5000', currency: 'BINGO', ticketPrice: '2.0000',
        claimedAt: new Date().toISOString(),
    };

    it('upserts by gameId + ticketId + winType', async () => {
        mockPrizeUpsert.mockReturnValue(mockResolved({ ...INPUT, _id: 'abc' }));
        const result = await savePrizeTx(INPUT);
        expect(mockPrizeUpsert).toHaveBeenCalledWith(
            { gameId: '1', ticketId: '42', winType: 'pattern' },
            expect.objectContaining({ $setOnInsert: expect.anything() }),
            { upsert: true, new: true },
        );
        expect(result).toBeDefined();
    });

    it('throws on db error', async () => {
        mockPrizeUpsert.mockReturnValue(mockRejected(new Error('Mongo down')));
        await expect(savePrizeTx(INPUT)).rejects.toThrow('Mongo down');
    });
});

describe('saveBuyInTx', () => {
    const INPUT = {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        amount: '2.0000', currency: 'BINGO',
        purchasedAt: new Date().toISOString(),
    };

    it('upserts by gameId + ticketId', async () => {
        mockBuyInUpsert.mockReturnValue(mockResolved({ ...INPUT, _id: 'abc' }));
        await saveBuyInTx(INPUT);
        expect(mockBuyInUpsert).toHaveBeenCalledWith(
            { gameId: '1', ticketId: '42' },
            expect.objectContaining({ $setOnInsert: expect.anything() }),
            { upsert: true, new: true },
        );
    });
});
