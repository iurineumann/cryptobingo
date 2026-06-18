// Testes de regressão de segurança para chatController.
// Invariantes críticos:
//   1. message_type sempre 'user' — corpo da requisição não pode elevar o tipo
//   2. wallet_address vem do JWT (req.user.wallet), nunca do body
//   3. Ausência de message → 400, nunca 2xx

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockEmit   = jest.fn();
const mockTo     = jest.fn(() => ({ emit: mockEmit }));
const mockOfChat = jest.fn(() => ({ to: mockTo }));

jest.mock('../socket', () => ({ getIo: () => ({ of: mockOfChat }) }));

const mockCreate = jest.fn();
jest.mock('../models/ChatMessage', () => ({
    __esModule: true,
    default: {
        find: jest.fn(() => ({
            sort:  () => ({ limit: () => ({ lean: async () => [] }) }),
        })),
        create: mockCreate,
    },
}));

import express from 'express';
import request from 'supertest';
import { saveChatMessage, getChatHistory } from './chatController';

function makeApp(walletFromJwt = 'legit.wam') {
    const app = express();
    app.use(express.json());
    // Simula req.user injetado pelo middleware requireAuth
    app.use((req: any, _res: any, next: any) => { req.user = { wallet: walletFromJwt }; next(); });
    app.post('/rooms/:roomId/chat', saveChatMessage);
    app.get('/rooms/:roomId/chat', getChatHistory);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
        _id:            { toString: () => 'doc-id-1' },
        wallet_address: 'legit.wam',
        message:        'ok',
        message_type:   'user',
        mentions:       [],
        timestamp:      new Date('2024-01-01'),
    });
});

// ── 1. Bloqueio de elevação de message_type ───────────────────────────────────

describe('Segurança — message_type', () => {
    it('[SEC] message_type do body é ignorado — sempre salva como user', async () => {
        for (const type of ['system_draw', 'system_drop', 'system_status', 'admin', 'SYSTEM']) {
            mockCreate.mockClear();
            await request(makeApp())
                .post('/rooms/room-1/chat')
                .send({ message: 'texto', message_type: type });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ message_type: 'user' }),
            );
            expect(mockCreate).not.toHaveBeenCalledWith(
                expect.objectContaining({ message_type: type }),
            );
        }
    });

    it('[SEC] body sem message_type → salva como user', async () => {
        await request(makeApp()).post('/rooms/room-1/chat').send({ message: 'oi' });
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ message_type: 'user' }),
        );
    });

    it('[REG] resposta 201 contém message_type user', async () => {
        const res = await request(makeApp()).post('/rooms/room-1/chat').send({ message: 'oi' });
        expect(res.status).toBe(201);
        expect(res.body.message_type).toBe('user');
    });
});

// ── 2. wallet_address vem do JWT, não do body ─────────────────────────────────

describe('Segurança — wallet_address', () => {
    it('[SEC] wallet_address no body é ignorado — usa req.user.wallet', async () => {
        await request(makeApp('jwt-owner.wam'))
            .post('/rooms/room-1/chat')
            .send({ message: 'oi', wallet_address: 'atacante.wam' });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ wallet_address: 'jwt-owner.wam' }),
        );
        expect(mockCreate).not.toHaveBeenCalledWith(
            expect.objectContaining({ wallet_address: 'atacante.wam' }),
        );
    });

    it('[SEC] resposta usa wallet do JWT, não do body', async () => {
        mockCreate.mockResolvedValueOnce({
            _id:            { toString: () => 'id' },
            wallet_address: 'jwt-owner.wam',
            message:        'oi',
            message_type:   'user',
            mentions:       [],
            timestamp:      new Date(),
        });
        const res = await request(makeApp('jwt-owner.wam'))
            .post('/rooms/room-1/chat')
            .send({ message: 'oi', wallet_address: 'atacante.wam' });

        expect(res.body.wallet_address).toBe('jwt-owner.wam');
    });
});

// ── 3. Validação de input ─────────────────────────────────────────────────────

describe('Validação', () => {
    it('[REG] message ausente → 400', async () => {
        const res = await request(makeApp()).post('/rooms/room-1/chat').send({});
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[REG] message string vazia → 400', async () => {
        const res = await request(makeApp()).post('/rooms/room-1/chat').send({ message: '' });
        expect(res.status).toBe(400);
    });

    it('[REG] message longa é truncada em 500 chars', async () => {
        const long = 'x'.repeat(600);
        await request(makeApp()).post('/rooms/room-1/chat').send({ message: long });
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'x'.repeat(500) }),
        );
    });
});

// ── 4. Broadcast via WS após save ────────────────────────────────────────────

describe('Broadcast WS', () => {
    it('[REG] emite chat:message no namespace /chat após save', async () => {
        await request(makeApp()).post('/rooms/sala-1/chat').send({ message: 'oi' });
        expect(mockOfChat).toHaveBeenCalledWith('/chat');
        expect(mockTo).toHaveBeenCalledWith('sala-1');
        expect(mockEmit).toHaveBeenCalledWith('chat:message', expect.objectContaining({ message_type: 'user' }));
    });
});
