// Testes do newsController — CRUD admin + listagem pública. Ref: ADR-024/025.
// Estratégia: mockar Mongo (NewsFeed), Redis e tradução; testar validações, RBAC e cache.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

const mockFind               = jest.fn();
const mockCountDocuments     = jest.fn();
const mockCreate             = jest.fn();
const mockFindByIdAndUpdate  = jest.fn();
const mockRedisGet           = jest.fn();
const mockRedisSetEx         = jest.fn();
const mockRedisKeys          = jest.fn();
const mockRedisDel           = jest.fn();
const mockTranslate          = jest.fn();

jest.mock('../models/NewsFeed', () => ({
    NewsFeed: {
        find:             (...args: any[]) => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: mockFind }) }) }) }),
        countDocuments:   mockCountDocuments,
        create:           mockCreate,
        findByIdAndUpdate: mockFindByIdAndUpdate,
    },
}));

jest.mock('../database/redis', () => ({
    redisClient: {
        get:   mockRedisGet,
        setEx: mockRedisSetEx,
        keys:  mockRedisKeys,
        del:   mockRedisDel,
    },
}));

jest.mock('../services/translation', () => ({
    translateNewsContent: mockTranslate,
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { listNews, createNews, updateNews, deleteNews } from './newsController';

function makeToken(role = 'admin'): string {
    return jwt.sign({ wallet: 'admin1', role, jti: 'jti' }, 'test-secret-32chars-xxxxxxxxxx!!', { expiresIn: '1h' });
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
            try { req.user = jwt.verify(auth.slice(7), 'test-secret-32chars-xxxxxxxxxx!!') as any; } catch { /* noop */ }
        }
        next();
    });
    app.get   ('/news',     listNews);
    app.post  ('/news',     createNews);
    app.patch ('/news/:id', updateNews);
    app.delete('/news/:id', deleteNews);
    return app;
}

const SAMPLE_DOC = {
    _id:              'abc123',
    title:            'Promoção',
    content:          'Conteúdo da promoção.',
    image_url:        null,
    locale_overrides: { 'en-US': { title: 'Promo', content: 'Promo content.' } },
    active:           true,
    pinned:           false,
    published_at:     new Date('2026-01-01T12:00:00Z'),
    published_by:     'admin1',
};

// ── GET /news ─────────────────────────────────────────────────────────────────

describe('listNews', () => {
    beforeEach(() => jest.clearAllMocks());

    it('serve do cache Redis quando hit', async () => {
        const cached = { items: [{ id: 'xyz', title: 'Cached' }], total: 1, cached_at: '2026-01-01T00:00:00Z' };
        mockRedisGet.mockResolvedValue(JSON.stringify(cached));

        const res = await request(makeApp()).get('/news');

        expect(res.status).toBe(200);
        expect(res.body.items[0].title).toBe('Cached');
        expect(mockFind).not.toHaveBeenCalled();
    });

    it('busca no Mongo quando cache miss e cacheia resultado', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockFind.mockResolvedValue([SAMPLE_DOC]);
        mockCountDocuments.mockResolvedValue(1);
        mockRedisSetEx.mockResolvedValue('OK');

        const res = await request(makeApp()).get('/news');

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].id).toBe('abc123');
        expect(mockRedisSetEx).toHaveBeenCalled();
    });

    it('fail-open: Redis indisponível não bloqueia a requisição', async () => {
        mockRedisGet.mockRejectedValue(new Error('Redis down'));
        mockFind.mockResolvedValue([SAMPLE_DOC]);
        mockCountDocuments.mockResolvedValue(1);
        mockRedisSetEx.mockRejectedValue(new Error('Redis down'));

        const res = await request(makeApp()).get('/news');

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
    });

    it('limita paginação a max 20 e normaliza limit/offset', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockFind.mockResolvedValue([]);
        mockCountDocuments.mockResolvedValue(0);

        await request(makeApp()).get('/news?limit=999&offset=-5');

        expect(mockFind).toHaveBeenCalled();
    });

    it('500 quando Mongo lança exceção', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockFind.mockRejectedValue(new Error('Mongo down'));

        const res = await request(makeApp()).get('/news');

        expect(res.status).toBe(500);
    });
});

// ── POST /news ────────────────────────────────────────────────────────────────

describe('createNews', () => {
    beforeEach(() => jest.clearAllMocks());

    it('400 sem title', async () => {
        const res = await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ content: 'Conteúdo' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/title/i);
    });

    it('400 sem content', async () => {
        const res = await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Título' });

        expect(res.status).toBe(400);
    });

    it('cria publicação com tradução automática quando sem locale_overrides', async () => {
        const translated = { 'en-US': { title: 'Promo', content: 'Content' } };
        mockTranslate.mockResolvedValue(translated);
        mockCreate.mockResolvedValue({ ...SAMPLE_DOC, toObject: () => SAMPLE_DOC });
        mockRedisKeys.mockResolvedValue([]);

        const res = await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Promoção', content: 'Conteúdo da promoção.' });

        expect(res.status).toBe(201);
        expect(mockTranslate).toHaveBeenCalledWith('Promoção', 'Conteúdo da promoção.', 'pt', ['en-US', 'zh-CN']);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            locale_overrides: translated,
        }));
    });

    it('ignora tradução quando locale_overrides explícito informado', async () => {
        const manualOverrides = { 'en-US': { title: 'Manual', content: 'Manual.' } };
        mockCreate.mockResolvedValue({ ...SAMPLE_DOC, toObject: () => SAMPLE_DOC });
        mockRedisKeys.mockResolvedValue([]);

        await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Promoção', content: 'Conteúdo', locale_overrides: manualOverrides });

        expect(mockTranslate).not.toHaveBeenCalled();
    });

    it('publica mesmo quando tradução falha (fail-open)', async () => {
        mockTranslate.mockRejectedValue(new Error('Provider timeout'));
        mockCreate.mockResolvedValue({ ...SAMPLE_DOC, toObject: () => SAMPLE_DOC });
        mockRedisKeys.mockResolvedValue([]);

        const res = await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Promoção', content: 'Conteúdo' });

        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ locale_overrides: {} }));
    });

    it('invalida cache após criação', async () => {
        mockTranslate.mockResolvedValue({});
        mockCreate.mockResolvedValue({ ...SAMPLE_DOC, toObject: () => SAMPLE_DOC });
        mockRedisKeys.mockResolvedValue(['news:list:10:0', 'news:list:5:0']);
        mockRedisDel.mockResolvedValue(2);

        await request(makeApp())
            .post('/news')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'T', content: 'C' });

        expect(mockRedisDel).toHaveBeenCalledWith(['news:list:10:0', 'news:list:5:0']);
    });
});

// ── PATCH /news/:id ───────────────────────────────────────────────────────────

describe('updateNews', () => {
    beforeEach(() => jest.clearAllMocks());

    it('404 quando publicação não existe', async () => {
        mockFindByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

        const res = await request(makeApp())
            .patch('/news/nonexistent')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Novo título' });

        expect(res.status).toBe(404);
    });

    it('200 e invalida cache após atualização', async () => {
        const updated = { ...SAMPLE_DOC, title: 'Atualizado' };
        mockFindByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(updated) });
        mockRedisKeys.mockResolvedValue(['news:list:10:0']);
        mockRedisDel.mockResolvedValue(1);

        const res = await request(makeApp())
            .patch('/news/abc123')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ title: 'Atualizado' });

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Atualizado');
        expect(mockRedisDel).toHaveBeenCalled();
    });
});

// ── DELETE /news/:id ──────────────────────────────────────────────────────────

describe('deleteNews (soft delete)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('404 quando publicação não existe', async () => {
        mockFindByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

        const res = await request(makeApp())
            .delete('/news/nonexistent')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(404);
    });

    it('200 com soft delete (active: false) e invalida cache', async () => {
        const archived = { ...SAMPLE_DOC, active: false };
        mockFindByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(archived) });
        mockRedisKeys.mockResolvedValue([]);

        const res = await request(makeApp())
            .delete('/news/abc123')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/arquivada/i);
        // Confirma que active:false foi o campo enviado
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
            'abc123',
            { $set: { active: false } },
            expect.any(Object),
        );
    });
});
