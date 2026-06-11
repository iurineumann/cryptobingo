// apps/api-gateway/src/controllers/newsController.ts
// CRUD de publicações admin + listagem pública. Ref: ADR-024.

import { Request, Response } from 'express';
import { redisClient } from '../database/redis';
import { NewsFeed } from '../models/NewsFeed';
import type { NewsItem } from '@cryptobingo/shared-types';

const TTL_SECONDS = 120; // 2 min
const CACHE_PREFIX = 'news:list';

// ==========================================
// GET /api/v1/news
// ==========================================

export async function listNews(req: Request, res: Response): Promise<void> {
    const limit  = Math.min(Math.max(Number(req.query.limit  ?? 10), 1), 20);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const cacheKey = `${CACHE_PREFIX}:${limit}:${offset}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const [items, total] = await Promise.all([
            NewsFeed.find({ active: true })
                .sort({ pinned: -1, published_at: -1 })
                .skip(offset)
                .limit(limit)
                .lean(),
            NewsFeed.countDocuments({ active: true }),
        ]);

        const payload = {
            items:      items.map(docToNewsItem),
            total,
            cached_at:  new Date().toISOString(),
        };

        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => { /* best-effort */ });
        res.status(200).json(payload);
    } catch (err) {
        console.error('[News] Erro ao listar publicações:', err);
        res.status(500).json({ error: 'Erro ao listar publicações.' });
    }
}

// ==========================================
// POST /api/v1/news  (admin)
// ==========================================

export async function createNews(req: Request, res: Response): Promise<void> {
    const { title, content, image_url, locale_overrides, active, pinned } = req.body;

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
        res.status(400).json({ error: 'Campos "title" e "content" são obrigatórios.' });
        return;
    }

    try {
        const item = await NewsFeed.create({
            title,
            content,
            image_url:        image_url ?? null,
            locale_overrides: locale_overrides ?? {},
            active:           active !== false,
            pinned:           pinned === true,
            published_at:     new Date(),
            published_by:     (req as any).user?.wallet,
        });

        await invalidateNewsCache();
        res.status(201).json(docToNewsItem(item.toObject()));
    } catch (err) {
        console.error('[News] Erro ao criar publicação:', err);
        res.status(500).json({ error: 'Erro ao criar publicação.' });
    }
}

// ==========================================
// PATCH /api/v1/news/:id  (admin)
// ==========================================

export async function updateNews(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { title, content, image_url, locale_overrides, active, pinned } = req.body;

    try {
        const updated = await NewsFeed.findByIdAndUpdate(
            id,
            { $set: { title, content, image_url, locale_overrides, active, pinned } },
            { new: true, runValidators: true },
        ).lean();

        if (!updated) {
            res.status(404).json({ error: 'Publicação não encontrada.' });
            return;
        }

        await invalidateNewsCache();
        res.status(200).json(docToNewsItem(updated));
    } catch (err) {
        console.error('[News] Erro ao atualizar publicação:', err);
        res.status(500).json({ error: 'Erro ao atualizar publicação.' });
    }
}

// ==========================================
// DELETE /api/v1/news/:id  (admin — soft delete)
// ==========================================

export async function deleteNews(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    try {
        const updated = await NewsFeed.findByIdAndUpdate(
            id,
            { $set: { active: false } },
            { new: true },
        ).lean();

        if (!updated) {
            res.status(404).json({ error: 'Publicação não encontrada.' });
            return;
        }

        await invalidateNewsCache();
        res.status(200).json({ message: 'Publicação arquivada.' });
    } catch (err) {
        console.error('[News] Erro ao arquivar publicação:', err);
        res.status(500).json({ error: 'Erro ao arquivar publicação.' });
    }
}

// ==========================================
// Helpers
// ==========================================

function docToNewsItem(doc: any): NewsItem {
    return {
        id:               String(doc._id),
        title:            doc.title,
        content:          doc.content,
        image_url:        doc.image_url ?? null,
        locale_overrides: doc.locale_overrides ?? {},
        active:           doc.active,
        pinned:           doc.pinned,
        published_at:     doc.published_at instanceof Date
                            ? doc.published_at.toISOString()
                            : String(doc.published_at),
        published_by:     doc.published_by,
    };
}

async function invalidateNewsCache(): Promise<void> {
    try {
        const keys = await redisClient.keys(`${CACHE_PREFIX}:*`);
        if (keys.length > 0) await redisClient.del(keys);
    } catch { /* best-effort */ }
}
