// Testes de integração social para chatSocket:
// Presença (join/leave/disconnect) e reações (allowlist, rate-limit, wallet do JWT).

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import { setupChatSocket } from './chatSocket';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models/ChatMessage', () => ({
    __esModule: true,
    default: { create: jest.fn() },
}));

jest.mock('../models/RoomMetadata', () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

import RoomMetadataModel from '../models/RoomMetadata';
const mockRoomFindOne = RoomMetadataModel.findOne as jest.Mock;

function roomFindOneResult(value: object | null) {
    return { lean: jest.fn(async () => value) };
}

jest.mock('../middleware/auth', () => ({
    isTokenRevoked: jest.fn(async () => false),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

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

interface MockIoResult {
    io: any;
    ns: MockNamespace;
    /** broadcastEmit.mock.calls — referência única, não duplica por quantos { emit } forem criados. */
    emitCalls: () => Array<[string, any]>;
}

function makeMockIo(): MockIoResult {
    // broadcastEmit é uma referência única compartilhada por todos os { emit } retornados
    // por ns.to() — assim mock.calls não duplica (evita contagem × nº de calls de ns.to).
    const broadcastEmit = jest.fn();
    const ns: MockNamespace = {
        middlewares: [],
        handlers:    new Map(),
        use:  fn       => ns.middlewares.push(fn),
        on:   (ev, fn) => ns.handlers.set(ev, fn),
        to:   jest.fn(() => ({ emit: broadcastEmit })),
        emit: broadcastEmit,
    };
    const io = { of: jest.fn(() => ns) };
    const emitCalls = () => broadcastEmit.mock.calls as Array<[string, any]>;
    return { io, ns, emitCalls };
}

function makeSocket(wallet: string): any {
    return {
        handshake: { auth: { token: 'unused-in-unit' } },
        data:      { wallet },
        rooms:     new Set<string>(),
        join:      jest.fn(),
        leave:     jest.fn(),
        emit:      jest.fn(),
        on:        jest.fn(),
        disconnect: jest.fn(),
    };
}

/** Conecta socket ao namespace e retorna mapa de handlers registrados. */
async function connect(ns: MockNamespace, socket: any): Promise<Map<string, Function>> {
    const onConnection = ns.handlers.get('connection')!;
    const socketHandlers = new Map<string, Function>();
    const wrappedSocket = { ...socket, on: (ev: string, fn: Function) => socketHandlers.set(ev, fn) };
    await onConnection(wrappedSocket);
    return socketHandlers;
}

/** Filtra chamadas de emit por nome de evento. */
function filterEmits(calls: Array<[string, any]>, event: string) {
    return calls.filter(c => c[0] === event);
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockRoomFindOne.mockReturnValue(roomFindOneResult({ room_id: 'sala1' }));
});

// ── Testes de presença ────────────────────────────────────────────────────────

describe('Presença — presence:update', () => {
    it('[SOC] dois clientes com wallets distintas na mesma sala → online: 2', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const s1 = makeSocket(`wallet-a-${Date.now()}.wam`);
        const s2 = makeSocket(`wallet-b-${Date.now()}.wam`);
        const h1 = await connect(ns, s1);
        const h2 = await connect(ns, s2);

        await h1.get('chat:join')!({ roomId: 'sala1' });
        await h2.get('chat:join')!({ roomId: 'sala1' });

        const updates = filterEmits(emitCalls(), 'presence:update');
        const last    = updates[updates.length - 1];
        expect(last[1]).toMatchObject({ roomId: 'sala1', online: 2 });
    });

    it('[SOC] duas conexões da mesma wallet → online: 1', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const wallet = `same-wallet-${Date.now()}.wam`;
        const s1 = makeSocket(wallet);
        const s2 = makeSocket(wallet);
        const h1 = await connect(ns, s1);
        const h2 = await connect(ns, s2);

        await h1.get('chat:join')!({ roomId: 'sala1' });
        await h2.get('chat:join')!({ roomId: 'sala1' });

        const updates = filterEmits(emitCalls(), 'presence:update');
        const last    = updates[updates.length - 1];
        expect(last[1]).toMatchObject({ roomId: 'sala1', online: 1 });
    });

    it('[SOC] re-join idempotente: mesmo socket emite chat:join 2x → online continua 1', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const socket   = makeSocket(`rejoin-${Date.now()}.wam`);
        const handlers = await connect(ns, socket);

        await handlers.get('chat:join')!({ roomId: 'sala1' });
        await handlers.get('chat:join')!({ roomId: 'sala1' }); // re-join (reconnect/remount)

        // 1º join emite presence:update; 2º join é descartado (guard de idempotência)
        const updates = filterEmits(emitCalls(), 'presence:update');
        expect(updates.length).toBe(1);
        expect(updates[0][1]).toMatchObject({ roomId: 'sala1', online: 1 });

        // Rejoin legítimo após leave volta a contar
        await handlers.get('chat:leave')!({ roomId: 'sala1' });
        await handlers.get('chat:join')!({ roomId: 'sala1' });
        const after = filterEmits(emitCalls(), 'presence:update');
        expect(after[after.length - 1][1]).toMatchObject({ roomId: 'sala1', online: 1 });
    });

    it('[SOC] disconnect decrementa presença e emite presence:update', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const wallet = `disc-wallet-${Date.now()}.wam`;
        const socket = makeSocket(wallet);
        const h1     = await connect(ns, socket);

        await h1.get('chat:join')!({ roomId: 'sala1' });

        // Antes do disconnect: online: 1
        let updates = filterEmits(emitCalls(), 'presence:update');
        expect(updates[updates.length - 1][1]).toMatchObject({ online: 1 });

        // Dispara disconnect
        h1.get('disconnect')!({});

        // Após disconnect: online: 0
        updates = filterEmits(emitCalls(), 'presence:update');
        expect(updates[updates.length - 1][1]).toMatchObject({ roomId: 'sala1', online: 0 });
    });
});

// ── Testes de reações ─────────────────────────────────────────────────────────

describe('Reações — reaction:send / reaction:new', () => {
    it('[SOC] emoji da allowlist é transmitido com wallet do JWT', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const wallet   = `react-wallet-${Date.now()}.wam`;
        const socket   = makeSocket(wallet);
        const handlers = await connect(ns, socket);

        handlers.get('reaction:send')!({ roomId: 'sala1', emoji: '🔥' });

        const reactions = filterEmits(emitCalls(), 'reaction:new');
        expect(reactions.length).toBe(1);
        expect(reactions[0][1]).toMatchObject({ wallet, emoji: '🔥' });
        expect(typeof reactions[0][1].ts).toBe('number');
    });

    it('[SOC] emoji fora da allowlist → nenhum reaction:new emitido', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        const socket   = makeSocket(`bad-emoji-${Date.now()}.wam`);
        const handlers = await connect(ns, socket);

        handlers.get('reaction:send')!({ roomId: 'sala1', emoji: '💩' });

        expect(filterEmits(emitCalls(), 'reaction:new').length).toBe(0);
    });

    it('[SOC] rate-limit: 11ª reação na mesma janela não emite reaction:new', async () => {
        const { io, ns, emitCalls } = makeMockIo();
        setupChatSocket(io);

        // Wallet única para isolar o bucket de rate-limit desta instância
        const wallet   = `ratelimit-${Date.now()}.wam`;
        const socket   = makeSocket(wallet);
        const handlers = await connect(ns, socket);

        // 10 reações dentro do limite
        for (let i = 0; i < 10; i++) {
            handlers.get('reaction:send')!({ roomId: 'sala1', emoji: '👏' });
        }
        expect(filterEmits(emitCalls(), 'reaction:new').length).toBe(10);

        // 11ª deve ser bloqueada
        handlers.get('reaction:send')!({ roomId: 'sala1', emoji: '👏' });
        expect(filterEmits(emitCalls(), 'reaction:new').length).toBe(10); // não aumentou
    });
});
