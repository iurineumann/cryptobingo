import { Request, Response } from 'express';

jest.mock('../../models/PrizeTx', () => ({
    PrizeTx: { find: jest.fn() },
}));

import { PrizeTx } from '../../models/PrizeTx';
import { listGamePrizes } from '../prizeController';

const mockFind = PrizeTx.find as jest.Mock;

function makeRes(): Response {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(gameId: string): Request {
    return { params: { gameId }, query: {} } as unknown as Request;
}

function makePrize(overrides: Record<string, unknown> = {}) {
    return {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        winType: 'pattern', winLabel: 'Linha 1', weight: 150,
        amount: '3.5000', currency: 'BINGO', transactionId: 'tx123',
        goldenMultiplier: 1, ticketPrice: '2.0000',
        claimedAt: new Date('2026-06-29').toISOString(),
        ...overrides,
    };
}

beforeEach(() => jest.clearAllMocks());

describe('listGamePrizes', () => {
    it('retorna 200 com lista vazia se nenhum prize', async () => {
        mockFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ items: [], total: 0, gameId: '1' });
    });

    it('retorna 200 com prizes ordenados por claimedAt desc', async () => {
        const prize1 = makePrize({ ticketId: '1', claimedAt: '2026-06-29T10:00:00Z' });
        const prize2 = makePrize({ ticketId: '2', claimedAt: '2026-06-29T11:00:00Z' });
        const mockSort = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([prize2, prize1]) });
        mockFind.mockReturnValue({ sort: mockSort });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(mockSort).toHaveBeenCalledWith({ claimedAt: -1 });
        expect(res.json).toHaveBeenCalledWith({ items: [prize2, prize1], total: 2, gameId: '1' });
    });

    it('retorna 400 se gameId inválido', async () => {
        const res = makeRes();
        await listGamePrizes(makeReq(''), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('retorna 500 se MongoDB falhar', async () => {
        mockFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('Mongo down')) }) });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
