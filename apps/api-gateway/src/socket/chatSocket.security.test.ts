// Testes de regressão de segurança para chatSocket.
// Invariantes críticos:
//   1. Conexão sem token válido / revogado / expirado é rejeitada
//   2. message_type é sempre 'user' — cliente não controla
//   3. wallet_address vem de socket.data (JWT), não de payload do cliente
//   4. Mensagens vazias ou sem roomId são silenciadas
//   5. Rate limit: máx 5 msgs/5s por wallet
//   6. chat:join e chat:send rejeitam roomId inexistente

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import jwt from 'jsonwebtoken';
import { extractMentions, setupChatSocket } from './chatSocket';

// ── Mock ChatMessageModel ─────────────────────────────────────────────────────

jest.mock('../models/ChatMessage', () => ({
    __esModule: true,
    default: { create: jest.fn() },
}));

import ChatMessageModel from '../models/ChatMessage';
const mockCreate = ChatMessageModel.create as jest.Mock;

// ── Mock RoomMetadataModel ────────────────────────────────────────────────────

jest.mock('../models/RoomMetadata', () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

import RoomMetadataModel from '../models/RoomMetadata';
const mockRoomFindOne = RoomMetadataModel.findOne as jest.Mock;

// findOne retorna objeto com .lean() encadeável
function roomFindOneResult(value: object | null) {
    return { lean: jest.fn(async () => value) };
}

// ── Mock isTokenRevoked ───────────────────────────────────────────────────────

jest.mock('../middleware/auth', () => ({
    isTokenRevoked: jest.fn(async () => false),
}));

import { isTokenRevoked } from '../middleware/auth';
const mockIsTokenRevoked = isTokenRevoked as jest.Mock;

// ── Helpers para simular io/socket ────────────────────────────────────────────

type MiddlewareFn = (socket: any, next: (err?: Error) => void) => void;
type EventHandler = (payload: any) => Promise<void> | void;

interface MockNamespace {
    middlewares: MiddlewareFn[];
    handlers:    Map<string, EventHandler>;
    use:  (fn: MiddlewareFn) => void;
    on:   (event: string, fn: EventHandler) => void;
    to:   jest.Mock;
    emit: jest.Mock;
}

function makeMockIo(): { io: any; ns: MockNamespace } {
    const emit = jest.fn();
    const ns: MockNamespace = {
        middlewares: [],
        handlers:    new Map(),
        use:  fn  => ns.middlewares.push(fn),
        on:   (ev, fn) => ns.handlers.set(ev, fn),
        to:   jest.fn(() => ({ emit })),
        emit,
    };
    const io = { of: jest.fn(() => ns) };
    return { io, ns };
}

function makeSocket(overrides: Partial<{
    token: string | undefined;
    wallet: string;
    rooms: Set<string>;
}> = {}): any {
    return {
        handshake: { auth: { token: overrides.token } },
        data:      { wallet: overrides.wallet ?? '' },
        rooms:     overrides.rooms ?? new Set<string>(),
        join:      jest.fn((r: string) => {}),
        leave:     jest.fn((r: string) => {}),
    };
}

async function runMiddleware(ns: MockNamespace, socket: any): Promise<Error | undefined> {
    return new Promise(resolve => {
        const middlewares = [...ns.middlewares];
        let i = 0;
        function next(err?: Error) { if (err || i >= middlewares.length) return resolve(err); middlewares[i++](socket, next); }
        next();
    });
}

async function triggerSend(ns: MockNamespace, socket: any, payload: any) {
    const onConnection = ns.handlers.get('connection');
    if (!onConnection) throw new Error('connection handler não registrado');
    // Simula conexão: registra handlers no socket
    const socketHandlers = new Map<string, Function>();
    const wrappedSocket = {
        ...socket,
        on: (ev: string, fn: Function) => socketHandlers.set(ev, fn),
    };
    await onConnection(wrappedSocket);
    const handler = socketHandlers.get('chat:send');
    if (handler) await handler(payload);
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
        _id:            { toString: () => 'doc-1' },
        wallet_address: 'server.wam',
        message:        'ok',
        message_type:   'user',
        mentions:       [],
        timestamp:      new Date(),
    });
    // sala existe por padrão nos testes
    mockRoomFindOne.mockReturnValue(roomFindOneResult({ room_id: 'r1' }));
    // token não revogado por padrão
    mockIsTokenRevoked.mockResolvedValue(false);
});

// ── 1. Autenticação ───────────────────────────────────────────────────────────

describe('Segurança — autenticação WS', () => {
    it('[SEC] conexão sem token é rejeitada', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const err = await runMiddleware(ns, makeSocket({ token: undefined }));
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/autenticado/i);
    });

    it('[SEC] token expirado é rejeitado', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const expired = jwt.sign({ wallet: 'x.wam' }, process.env.JWT_SECRET!, { expiresIn: -1 });
        const err = await runMiddleware(ns, makeSocket({ token: expired }));
        expect(err).toBeInstanceOf(Error);
    });

    it('[SEC] token com secret errado é rejeitado', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const bad = jwt.sign({ wallet: 'x.wam' }, 'wrong-secret');
        const err = await runMiddleware(ns, makeSocket({ token: bad }));
        expect(err).toBeInstanceOf(Error);
    });

    it('[SEC] token sem campo wallet é rejeitado', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const noWallet = jwt.sign({ sub: 'x' }, process.env.JWT_SECRET!);
        const err = await runMiddleware(ns, makeSocket({ token: noWallet }));
        expect(err).toBeInstanceOf(Error);
    });

    it('[REG] token válido é aceito e wallet injetada em socket.data', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const token = jwt.sign({ wallet: 'player.wam' }, process.env.JWT_SECRET!);
        const socket = makeSocket({ token });
        const err = await runMiddleware(ns, socket);
        expect(err).toBeUndefined();
        expect(socket.data.wallet).toBe('player.wam');
    });
});

// ── 2. message_type hardcoded 'user' ─────────────────────────────────────────

describe('Segurança — message_type no chat:send', () => {
    it('[SEC] message_type enviado pelo cliente é ignorado — salva como user', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const socket = makeSocket({ wallet: 'player.wam' });

        await triggerSend(ns, socket, { roomId: 'r1', message: 'oi', message_type: 'system_draw' });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ message_type: 'user' }),
        );
        expect(mockCreate).not.toHaveBeenCalledWith(
            expect.objectContaining({ message_type: 'system_draw' }),
        );
    });

    it('[SEC] broadcast emite payload com message_type user', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const socket = makeSocket({ wallet: 'player.wam' });

        await triggerSend(ns, socket, { roomId: 'r1', message: 'oi' });

        const emitted = (ns.to as jest.Mock).mock.results[0]?.value?.emit;
        expect(emitted).toHaveBeenCalledWith('chat:message',
            expect.objectContaining({ message_type: 'user' }),
        );
    });
});

// ── 3. wallet_address vem do servidor (socket.data), não do cliente ───────────

describe('Segurança — wallet_address no chat:send', () => {
    it('[SEC] wallet_address do cliente é ignorado — usa socket.data.wallet', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const socket = makeSocket({ wallet: 'real-owner.wam' });

        await triggerSend(ns, socket, {
            roomId:         'r1',
            message:        'oi',
            wallet_address: 'atacante.wam',
        });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ wallet_address: 'real-owner.wam' }),
        );
        expect(mockCreate).not.toHaveBeenCalledWith(
            expect.objectContaining({ wallet_address: 'atacante.wam' }),
        );
    });
});

// ── 4. Silencia inputs inválidos ──────────────────────────────────────────────

describe('Validação no chat:send', () => {
    it('[REG] mensagem vazia é ignorada sem salvar', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        await triggerSend(ns, makeSocket({ wallet: 'p.wam' }), { roomId: 'r1', message: '   ' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[REG] roomId ausente é ignorado sem salvar', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        await triggerSend(ns, makeSocket({ wallet: 'p.wam' }), { message: 'oi' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[REG] mensagem longa é truncada em 500 chars', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        await triggerSend(ns, makeSocket({ wallet: 'p.wam' }), {
            roomId: 'r1', message: 'a'.repeat(600),
        });
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'a'.repeat(500) }),
        );
    });
});

// ── 5. Revogação de token (blacklist Redis) ───────────────────────────────────

describe('Segurança — revogação JWT', () => {
    it('[SEC] token com jti revogado é rejeitado na conexão', async () => {
        mockIsTokenRevoked.mockResolvedValueOnce(true);
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const token = jwt.sign({ wallet: 'x.wam', jti: 'revoked-jti' }, process.env.JWT_SECRET!);
        const err = await runMiddleware(ns, makeSocket({ token }));
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/revogado/i);
    });

    it('[REG] token não revogado passa normalmente', async () => {
        mockIsTokenRevoked.mockResolvedValueOnce(false);
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const token = jwt.sign({ wallet: 'ok.wam', jti: 'valid-jti' }, process.env.JWT_SECRET!);
        const socket = makeSocket({ token });
        const err = await runMiddleware(ns, socket);
        expect(err).toBeUndefined();
    });

    it('[REG] isTokenRevoked é chamado com o jti do token', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const token = jwt.sign({ wallet: 'x.wam', jti: 'my-jti-123' }, process.env.JWT_SECRET!);
        await runMiddleware(ns, makeSocket({ token }));
        expect(mockIsTokenRevoked).toHaveBeenCalledWith('my-jti-123');
    });
});

// ── 6. Rate limit ─────────────────────────────────────────────────────────────

describe('Segurança — rate limit chat:send', () => {
    it('[SEC] exceder 5 msgs na mesma janela emite chat:error RATE_LIMITED', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const wallet = `rate-test-${Date.now()}.wam`; // wallet única p/ não poluir outros testes
        const socket  = { ...makeSocket({ wallet }), emit: jest.fn() };

        for (let i = 0; i < 5; i++) {
            await triggerSend(ns, socket, { roomId: 'r1', message: `msg ${i}` });
        }
        // 6ª mensagem deve ser bloqueada
        await triggerSend(ns, socket, { roomId: 'r1', message: 'msg bloqueada' });

        expect(socket.emit).toHaveBeenCalledWith('chat:error',
            expect.objectContaining({ code: 'RATE_LIMITED' }),
        );
    });

    it('[REG] dentro do limite não emite chat:error', async () => {
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const wallet = `within-rate-${Date.now()}.wam`;
        const socket = { ...makeSocket({ wallet }), emit: jest.fn() };

        await triggerSend(ns, socket, { roomId: 'r1', message: 'oi' });
        expect(socket.emit).not.toHaveBeenCalledWith('chat:error', expect.anything());
    });
});

// ── 7. Autorização de sala ────────────────────────────────────────────────────

describe('Segurança — autorização de sala', () => {
    it('[SEC] chat:send com roomId inexistente não salva mensagem', async () => {
        mockRoomFindOne.mockReturnValueOnce(roomFindOneResult(null));
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        await triggerSend(ns, makeSocket({ wallet: 'p.wam' }), { roomId: 'sala-invalida', message: 'oi' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[SEC] chat:join com roomId inexistente não entra na sala', async () => {
        mockRoomFindOne.mockReturnValueOnce(roomFindOneResult(null));
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const socket = makeSocket({ wallet: 'p.wam' });
        const onConnection = ns.handlers.get('connection')!;
        const socketHandlers = new Map<string, Function>();
        await onConnection({ ...socket, on: (ev: string, fn: Function) => socketHandlers.set(ev, fn) });
        await socketHandlers.get('chat:join')?.({ roomId: 'sala-invalida' });
        expect(socket.join).not.toHaveBeenCalled();
    });

    it('[REG] chat:join com sala válida entra no room', async () => {
        mockRoomFindOne.mockReturnValueOnce(roomFindOneResult({ room_id: 'sala-valida' }));
        const { io, ns } = makeMockIo();
        setupChatSocket(io);
        const socket = makeSocket({ wallet: 'p.wam' });
        const onConnection = ns.handlers.get('connection')!;
        const socketHandlers = new Map<string, Function>();
        await onConnection({ ...socket, on: (ev: string, fn: Function) => socketHandlers.set(ev, fn) });
        await socketHandlers.get('chat:join')?.({ roomId: 'sala-valida' });
        expect(socket.join).toHaveBeenCalledWith('sala-valida');
    });
});

// ── 8. extractMentions ────────────────────────────────────────────────────────

describe('extractMentions', () => {
    it('[REG] extrai mention simples', () => {
        expect(extractMentions('oi @abc1.wam tudo bem?')).toEqual(['abc1.wam']);
    });

    it('[REG] extrai múltiplas mentions', () => {
        const result = extractMentions('@alice.wam e @bob1');
        expect(result).toContain('alice.wam');
        expect(result).toContain('bob1');
    });

    it('[REG] deduplica mentions repetidas', () => {
        const result = extractMentions('@alice.wam @alice.wam');
        expect(result.filter(m => m === 'alice.wam')).toHaveLength(1);
    });

    it('[REG] normaliza mentions para lowercase', () => {
        expect(extractMentions('@ALICE.WAM')).toEqual(['alice.wam']);
    });

    it('[REG] ignora @ sem nome válido (muito longo)', () => {
        expect(extractMentions('@nomemuuuuuuuuuuuitolongo')).toEqual([]);
    });

    it('[REG] mensagem sem @ retorna array vazio', () => {
        expect(extractMentions('sem menção nenhuma')).toEqual([]);
    });
});
