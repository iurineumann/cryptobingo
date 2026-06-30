import { PrizeTx } from '../PrizeTx';

describe('PrizeTx Schema', () => {
    it('has required fields', () => {
        const paths = PrizeTx.schema.paths;
        expect(paths.gameId).toBeDefined();
        expect(paths.account).toBeDefined();
        expect(paths.ticketId).toBeDefined();
        expect(paths.winType).toBeDefined();
        expect(paths.winLabel).toBeDefined();
        expect(paths.weight).toBeDefined();
        expect(paths.amount).toBeDefined();
        expect(paths.currency).toBeDefined();
        expect(paths.claimedAt).toBeDefined();
    });

    it('winType enum accepts pattern/combo/stage', () => {
        const enumValues = (PrizeTx.schema.paths.winType as any).options.enum;
        expect(enumValues).toEqual(['pattern', 'combo', 'stage']);
    });

    it('has unique compound index on gameId + ticketId + winType', () => {
        const indexes = PrizeTx.schema.indexes();
        const idx = indexes.find(i =>
            i[0]?.gameId === 1 && i[0]?.ticketId === 1 && i[0]?.winType === 1,
        );
        expect(idx).toBeDefined();
        expect(idx?.[1]?.unique).toBe(true);
    });
});
