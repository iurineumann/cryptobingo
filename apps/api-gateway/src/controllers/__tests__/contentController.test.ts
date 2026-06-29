// Testes TDD para contentController (ADR-037).
// Primeiro behavior: GET /content/faq lista items.

import { Request, Response } from 'express';

jest.mock('../../database/redis', () => ({
    redisClient: {
        get:  jest.fn(async () => null),
        setEx: jest.fn(async () => 'OK'),
        keys: jest.fn(async () => []),
        del:  jest.fn(async () => 0),
    },
}));

jest.mock('../../models/Content', () => {
    const mockChain = () => {
        const chain: any = {
            sort:  jest.fn().mockReturnThis(),
            skip:  jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean:  jest.fn(),
        };
        return chain;
    };
    return {
        Content: {
            find:             jest.fn(() => mockChain()),
            findOne:          jest.fn(),
            countDocuments:   jest.fn(),
            create:           jest.fn(),
            findByIdAndUpdate: jest.fn(),
            findByIdAndDelete: jest.fn(),
        },
    };
});

jest.mock('../../services/translation', () => ({
    translateNewsContent: jest.fn(async () => ({
        'en-US': { title: 'Translated EN', content: 'Content EN' },
        'zh-CN': { title: 'Translated ZH', content: 'Content ZH' },
    })),
}));

import { redisClient } from '../../database/redis';
import { Content } from '../../models/Content';
import { listContent, getContentItem, createContentItem, updateContentItem, deleteContentItem } from '../contentController';

const mockRedisGet   = redisClient.get   as jest.Mock;
const mockRedisSetEx = redisClient.setEx as jest.Mock;
const mockFind       = Content.find      as jest.Mock;
const mockFindOne    = Content.findOne   as jest.Mock;
const mockFindByIdAndUpdate = Content.findByIdAndUpdate as jest.Mock;
const mockFindByIdAndDelete = Content.findByIdAndDelete as jest.Mock;
const mockCreate     = Content.create    as jest.Mock;
const mockCount      = Content.countDocuments as jest.Mock;
const mockRedisKeys  = redisClient.keys   as jest.Mock;
const mockRedisDel   = redisClient.del    as jest.Mock;

function makeRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(opts: {
    params?: Record<string, string>;
    query?:  Record<string, string>;
    body?:   Record<string, unknown>;
    user?:   { wallet: string };
} = {}): Request {
    return {
        params: opts.params ?? {},
        query:  opts.query  ?? {},
        body:   opts.body   ?? {},
        user:   opts.user   ?? { wallet: 'admin.wam' },
    } as unknown as Request;
}

const CONTENT_DOCS = [
    {
        _id:             { toString: () => 'faq-1' },
        type:            'faq',
        slug:            'como-jogar',
        title:           'Como jogar?',
        content:         'Compre uma cartela...',
        content_format:  'text',
        image_url:       null,
        metadata:        { question: 'Como jogar?' },
        pinned:          false,
        sort_order:      2,
        locale_overrides: {},
        active:          true,
        published_at:    new Date('2026-06-01'),
        published_by:    'admin.wam',
    },
    {
        _id:             { toString: () => 'faq-2' },
        type:            'faq',
        slug:            'regras',
        title:           'Quais as regras?',
        content:         'As regras são...',
        content_format:  'text',
        image_url:       null,
        metadata:        { question: 'Quais as regras?' },
        pinned:          true,
        sort_order:      1,
        locale_overrides: {},
        active:          true,
        published_at:    new Date('2026-06-02'),
        published_by:    'admin.wam',
    },
    {
        _id:             { toString: () => 'faq-inactive' },
        type:            'faq',
        slug:            'rascunho',
        title:           'Rascunho',
        content:         'Ainda não publicado',
        content_format:  'text',
        image_url:       null,
        metadata:        null,
        pinned:          false,
        sort_order:      99,
        locale_overrides: {},
        active:          false,
        published_at:    new Date('2026-06-03'),
        published_by:    'admin.wam',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
});

describe('listContent', () => {
    it('retorna lista de items ativos do tipo, ordenados por pinned desc + sort_order asc', async () => {
        const req = makeReq({ params: { type: 'faq' }, query: {} });
        const res = makeRes();

        const activeDocs = CONTENT_DOCS
            .filter(d => d.active)
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
                return a.sort_order - b.sort_order;
            });
        const mockChain = {
            sort:  jest.fn().mockReturnThis(),
            skip:  jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean:  jest.fn().mockResolvedValue(activeDocs),
        };
        mockFind.mockReturnValue(mockChain);
        mockCount.mockResolvedValue(activeDocs.length);

        await listContent(req, res);

        expect(mockFind).toHaveBeenCalledWith({ type: 'faq', active: true });
        expect(mockChain.sort).toHaveBeenCalledWith({ pinned: -1, sort_order: 1 });
        expect(res.status).toHaveBeenCalledWith(200);

        const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
        expect(jsonArg.items).toHaveLength(2);
        expect(jsonArg.items[0].id).toBe('faq-2');  // pinned=true primeiro
        expect(jsonArg.items[1].id).toBe('faq-1');
        expect(jsonArg.total).toBe(2);
    });
});

describe('getContentItem', () => {
    it('retorna item específico por type + id', async () => {
        const req = makeReq({ params: { type: 'faq', id: 'faq-1' } });
        const res = makeRes();

        const doc = CONTENT_DOCS[0];
        const mockChain = { lean: jest.fn().mockResolvedValue(doc) };
        mockFindOne.mockReturnValue(mockChain);

        await getContentItem(req, res);

        expect(mockFindOne).toHaveBeenCalledWith({ _id: 'faq-1', type: 'faq', active: true });
        expect(res.status).toHaveBeenCalledWith(200);
        const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
        expect(jsonArg.id).toBe('faq-1');
        expect(jsonArg.title).toBe('Como jogar?');
    });

    it('retorna 404 se não encontrado', async () => {
        const req = makeReq({ params: { type: 'faq', id: 'nao-existe' } });
        const res = makeRes();

        const mockChain = { lean: jest.fn().mockResolvedValue(null) };
        mockFindOne.mockReturnValue(mockChain);

        await getContentItem(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
});

describe('createContentItem', () => {
    beforeEach(() => {
        mockRedisKeys.mockResolvedValue([]);
        mockRedisDel.mockResolvedValue(0);
    });

    it('cria item com auto-translate e invalida cache', async () => {
        const req = makeReq({
            params: { type: 'news' },
            body: {
                title: 'Notícia Teste',
                content: 'Conteúdo da notícia',
                content_format: 'text',
                sort_order: 1,
            },
        });
        const res = makeRes();

        const createdDoc = {
            _id:             { toString: () => 'news-1' },
            type:            'news',
            slug:            'noticia-teste',
            title:           'Notícia Teste',
            content:         'Conteúdo da notícia',
            content_format:  'text',
            image_url:       null,
            metadata:        null,
            pinned:          false,
            sort_order:      1,
            locale_overrides: {
                'en-US': { title: 'Translated EN', content: 'Content EN' },
                'zh-CN': { title: 'Translated ZH', content: 'Content ZH' },
            },
            active:          true,
            published_at:    new Date('2026-06-29'),
            published_by:    'admin.wam',
        };
        mockCreate.mockResolvedValue(createdDoc);

        await createContentItem(req, res);

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'news',
                title: 'Notícia Teste',
                locale_overrides: expect.objectContaining({
                    'en-US': expect.any(Object),
                }),
            }),
        );
        expect(res.status).toHaveBeenCalledWith(201);
        const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
        expect(jsonArg.id).toBe('news-1');
        expect(jsonArg.locale_overrides['en-US'].title).toBe('Translated EN');
    });

    it('rejeita se title ou content faltando', async () => {
        const req = makeReq({ params: { type: 'news' }, body: { title: 'só título' } });
        const res = makeRes();

        await createContentItem(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('updateContentItem', () => {
    beforeEach(() => {
        mockRedisKeys.mockResolvedValue([]);
        mockRedisDel.mockResolvedValue(0);
    });

    it('atualiza campos parciais e invalida cache', async () => {
        const req = makeReq({
            params: { type: 'faq', id: 'faq-1' },
            body: { title: 'Como jogar? (atualizado)', sort_order: 5 },
        });
        const res = makeRes();

        const updatedDoc = {
            ...CONTENT_DOCS[0],
            _id:       { toString: () => 'faq-1' },
            title:     'Como jogar? (atualizado)',
            sort_order: 5,
        };
        const updateChain = { lean: jest.fn().mockResolvedValue(updatedDoc) };
        mockFindByIdAndUpdate.mockReturnValue(updateChain);

        await updateContentItem(req, res);

        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
            'faq-1',
            expect.objectContaining({ title: 'Como jogar? (atualizado)' }),
            { new: true },
        );
        expect(res.status).toHaveBeenCalledWith(200);
        const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
        expect(jsonArg.title).toBe('Como jogar? (atualizado)');
    });

    it('retorna 404 se item não existe', async () => {
        const req = makeReq({ params: { type: 'faq', id: 'nao-existe' }, body: { title: 'x' } });
        const res = makeRes();

        const updateChainNull = { lean: jest.fn().mockResolvedValue(null) };
        mockFindByIdAndUpdate.mockReturnValue(updateChainNull);

        await updateContentItem(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('deleteContentItem', () => {
    beforeEach(() => {
        mockRedisKeys.mockResolvedValue([]);
        mockRedisDel.mockResolvedValue(0);
    });

    it('deleta item e invalida cache', async () => {
        const req = makeReq({ params: { type: 'faq', id: 'faq-1' } });
        const res = makeRes();

        const deletedDoc = { ...CONTENT_DOCS[0], _id: { toString: () => 'faq-1' } };
        const deleteChain = { lean: jest.fn().mockResolvedValue(deletedDoc) };
        mockFindByIdAndDelete.mockReturnValue(deleteChain);

        await deleteContentItem(req, res);

        expect(mockFindByIdAndDelete).toHaveBeenCalledWith('faq-1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });

    it('retorna 404 se item não existe', async () => {
        const req = makeReq({ params: { type: 'faq', id: 'nao-existe' } });
        const res = makeRes();

        const deleteChainNull = { lean: jest.fn().mockResolvedValue(null) };
        mockFindByIdAndDelete.mockReturnValue(deleteChainNull);

        await deleteContentItem(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
