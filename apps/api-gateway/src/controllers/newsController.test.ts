// Testes unitários para newsController (ADR-024).
// Cobre: listagem pública com cache, CRUD admin, soft-delete, invalidação de cache, validação.

import { Request, Response } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../database/redis', () => ({
    redisClient: {
        get:  jest.fn(async () => null),
        setEx: jest.fn(async () => 'OK'),
        keys: jest.fn(async () => []),
        del:  jest.fn(async () => 0),
    },
}));

jest.mock('../models/NewsFeed', () => ({
    NewsFeed: {
        find:             jest.fn(),
        countDocuments:   jest.fn(),
        create:           jest.fn(),
        findByIdAndUpdate: jest.fn(),
    },
}));

jest.mock('../services/translation', () => ({
    translateNewsContent: jest.fn(async () => ({
        'en-US': { title: 'Title EN', content: 'Content EN' },
        'zh-CN': { title: 'Title ZH', content: 'Content ZH' },
    })),
}));

import { redisClient }               from '../database/redis';
import { NewsFeed }                  from '../models/NewsFeed';
import { translateNewsContent }      from '../services/translation';
import { listNews, createNews, updateNews, deleteNews }
    from './newsController';

const mockRedisGet   = redisClient.get           as jest.Mock;
const mockRedisSetEx = redisClient.setEx         as jest.Mock;
const mockRedisKeys  = redisClient.keys          as jest.Mock;
const mockRedisDel   = redisClient.del           as jest.Mock;
const mockFind       = NewsFeed.find             as jest.Mock;
const mockCount      = NewsFeed.countDocuments   as jest.Mock;
const mockCreate     = NewsFeed.create           as jest.Mock;
const mockUpdate     = NewsFeed.findByIdAndUpdate as jest.Mock;
const mockTranslate  = translateNewsContent      as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(opts: {
    params?: Record<string, string>;
    query?:  Record<string, string>;
    body?:   Record<string, any>;
    user?:   { wallet: string };
} = {}): Request {
    return {
        params: opts.params ?? {},
        query:  opts.query  ?? {},
        body:   opts.body   ?? {},
        user:   opts.user   ?? { wallet: 'admin.wam' },
    } as unknown as Request;
}

const NEWS_DOC = {
    _id:             { toString: () => 'doc-1' },
    title:           'Notícia 1',
    content:         'Conteúdo 1',
    image_url:       null,
    locale_overrides: {},
    active:          true,
    pinned:          false,
    published_at:    new Date('2026-01-01'),
    published_by:    'admin.wam',
};

function mockFindChain(docs: any[]) {
    const chain = {
        sort:  jest.fn().mockReturnThis(),
        skip:  jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean:  jest.fn(async () => docs),
    };
    mockFind.mockReturnValue(chain);
    mockCount.mockResolvedValue(docs.length);
    return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetEx.mockResolvedValue('OK');
    mockRedisKeys.mockResolvedValue([]);
    mockRedisDel.mockResolvedValue(0);
});

// ── GET /api/v1/news ─────────────────────────────────────────────────────────

describe('listNews', () => {
    it('[REG] retorna items e total', async () => {
        mockFindChain([NEWS_DOC]);
        const res = makeRes();
        await listNews(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({ id: 'doc-1', title: 'Notícia 1', active: true });
        expect(body.total).toBe(1);
    });

    it('[REG] cache hit: não chama MongoDB', async () => {
        mockRedisGet.mockResolvedValue(JSON.stringify({ items: [], total: 0, cached_at: '' }));
        const res = makeRes();
        await listNews(makeReq(), res);
        expect(mockFind).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('[REG] lista vazia retorna items=[] sem erro', async () => {
        mockFindChain([]);
        const res = makeRes();
        await listNews(makeReq(), res);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.items).toEqual([]);
        expect(body.total).toBe(0);
    });

    it('[REG] suporta paginação ?offset=10', async () => {
        mockFindChain([]);
        const res = makeRes();
        await listNews(makeReq({ query: { offset: '10' } }), res);
        // A chave de cache inclui o offset
        expect(mockRedisGet).toHaveBeenCalledWith(expect.stringContaining('10'));
    });

    it('[REG] salva resultado no Redis após cache miss', async () => {
        mockFindChain([NEWS_DOC]);
        const res = makeRes();
        await listNews(makeReq(), res);
        expect(mockRedisSetEx).toHaveBeenCalled();
    });

    it('[REG] retorna 500 se MongoDB falhar', async () => {
        const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn(async () => { throw new Error('Mongo down'); }) };
        mockFind.mockReturnValue(chain);
        const res = makeRes();
        await listNews(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ── POST /api/v1/news ────────────────────────────────────────────────────────

describe('createNews', () => {
    it('[REG] cria publicação com tradução automática', async () => {
        mockCreate.mockResolvedValue({
            ...NEWS_DOC,
            toObject: () => ({ ...NEWS_DOC, locale_overrides: { 'en-US': { title: 'Title EN', content: 'Content EN' } } }),
        });

        const res = makeRes();
        await createNews(makeReq({ body: { title: 'Notícia', content: 'Texto' } }), res);

        expect(mockTranslate).toHaveBeenCalledWith('Notícia', 'Texto', 'pt', ['en-US', 'zh-CN']);
        expect(mockCreate).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('[REG] respeita locale_overrides fornecidos — não traduz', async () => {
        const overrides = { 'en-US': { title: 'Custom EN', content: 'Custom content' } };
        mockCreate.mockResolvedValue({
            ...NEWS_DOC,
            toObject: () => ({ ...NEWS_DOC, locale_overrides: overrides }),
        });

        const res = makeRes();
        await createNews(makeReq({ body: { title: 'Notícia', content: 'Texto', locale_overrides: overrides } }), res);

        expect(mockTranslate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('[SEC] retorna 400 se title ausente', async () => {
        const res = makeRes();
        await createNews(makeReq({ body: { content: 'Texto' } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[SEC] retorna 400 se content ausente', async () => {
        const res = makeRes();
        await createNews(makeReq({ body: { title: 'Título' } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('[REG] falha de tradução não bloqueia criação', async () => {
        mockTranslate.mockRejectedValueOnce(new Error('LibreTranslate down'));
        mockCreate.mockResolvedValue({
            ...NEWS_DOC,
            toObject: () => ({ ...NEWS_DOC, locale_overrides: {} }),
        });

        const res = makeRes();
        await createNews(makeReq({ body: { title: 'Notícia', content: 'Texto' } }), res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('[REG] invalida cache após criação', async () => {
        mockCreate.mockResolvedValue({ ...NEWS_DOC, toObject: () => NEWS_DOC });
        mockRedisKeys.mockResolvedValue(['news:list:10:0']);

        const res = makeRes();
        await createNews(makeReq({ body: { title: 'Notícia', content: 'Texto' } }), res);

        expect(mockRedisDel).toHaveBeenCalledWith(['news:list:10:0']);
    });

    it('[REG] published_by é o wallet do admin autenticado', async () => {
        mockCreate.mockResolvedValue({ ...NEWS_DOC, toObject: () => NEWS_DOC });
        const res = makeRes();
        await createNews(makeReq({ body: { title: 'T', content: 'C' }, user: { wallet: 'myadmin.wam' } }), res);

        const createArg = mockCreate.mock.calls[0][0];
        expect(createArg.published_by).toBe('myadmin.wam');
    });
});

// ── PATCH /api/v1/news/:id ───────────────────────────────────────────────────

describe('updateNews', () => {
    it('[REG] atualiza campos e invalida cache', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => ({ ...NEWS_DOC, title: 'Novo título' })) });
        const res = makeRes();
        await updateNews(makeReq({ params: { id: 'doc-1' }, body: { title: 'Novo título' } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.title).toBe('Novo título');
    });

    it('[REG] retorna 404 se publicação não existe', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => null) });
        const res = makeRes();
        await updateNews(makeReq({ params: { id: 'inexistente' }, body: { title: 'T' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('[REG] retorna 500 se MongoDB falhar', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => { throw new Error('Mongo error'); }) });
        const res = makeRes();
        await updateNews(makeReq({ params: { id: 'doc-1' }, body: {} }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ── DELETE /api/v1/news/:id ──────────────────────────────────────────────────

describe('deleteNews', () => {
    it('[REG] soft-delete: seta active=false', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => ({ ...NEWS_DOC, active: false })) });
        const res = makeRes();
        await deleteNews(makeReq({ params: { id: 'doc-1' } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.message).toBeDefined();

        // Verifica que findByIdAndUpdate foi chamado com active: false
        const updateArg = mockUpdate.mock.calls[0][1];
        expect(updateArg.$set.active).toBe(false);
    });

    it('[REG] retorna 404 se publicação não existe', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => null) });
        const res = makeRes();
        await deleteNews(makeReq({ params: { id: 'inexistente' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('[REG] invalida cache após soft-delete', async () => {
        mockUpdate.mockReturnValue({ lean: jest.fn(async () => ({ ...NEWS_DOC, active: false })) });
        mockRedisKeys.mockResolvedValue(['news:list:10:0', 'news:list:5:0']);

        const res = makeRes();
        await deleteNews(makeReq({ params: { id: 'doc-1' } }), res);

        expect(mockRedisDel).toHaveBeenCalledWith(['news:list:10:0', 'news:list:5:0']);
    });
});
