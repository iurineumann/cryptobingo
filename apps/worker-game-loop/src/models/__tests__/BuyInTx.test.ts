import { BuyInTx } from '../BuyInTx';

describe('BuyInTx Schema', () => {
    it('has required fields', () => {
        const paths = BuyInTx.schema.paths;
        expect(paths.gameId).toBeDefined();
        expect(paths.account).toBeDefined();
        expect(paths.ticketId).toBeDefined();
        expect(paths.amount).toBeDefined();
        expect(paths.currency).toBeDefined();
        expect(paths.purchasedAt).toBeDefined();
    });

    it('has unique compound index on gameId + ticketId', () => {
        const indexes = BuyInTx.schema.indexes();
        const idx = indexes.find(i =>
            i[0]?.gameId === 1 && i[0]?.ticketId === 1,
        );
        expect(idx).toBeDefined();
        expect(idx?.[1]?.unique).toBe(true);
    });
});
