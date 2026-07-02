// apps/api-gateway/src/controllers/contentController.ts
// CRUD genérico de conteúdo unificado por type. Ref: ADR-037.

import { Request, Response } from 'express';
import { redisClient } from '../database/redis';
import { Content } from '../models/Content';
import { translateNewsContent } from '../services/translation';
import type { ContentItem } from '@cryptobingo/shared-types';

const TTL_SECONDS = 120;
const CACHE_PREFIX = 'content';

const CONTENT_TYPES = ['faq', 'howitworks', 'sponsors', 'tutorials', 'news'] as const;
type ContentType = typeof CONTENT_TYPES[number];

function parseContentType(raw: string): ContentType | null {
    return CONTENT_TYPES.includes(raw as ContentType) ? raw as ContentType : null;
}

// ==========================================
// Helpers
// ==========================================

function docToContentItem(doc: any): ContentItem {
    return {
        id:               String(doc._id),
        type:             doc.type,
        slug:             doc.slug,
        title:            doc.title,
        content_format:   doc.content_format,
        content:          doc.content,
        image_url:        doc.image_url ?? null,
        metadata:         doc.metadata ?? null,
        pinned:           doc.pinned ?? false,
        sort_order:       doc.sort_order ?? 0,
        locale_overrides: doc.locale_overrides ?? {},
        active:           doc.active,
        published_at:     doc.published_at instanceof Date
                            ? doc.published_at.toISOString()
                            : String(doc.published_at),
        published_by:     doc.published_by,
    };
}

async function invalidateCache(): Promise<void> {
    try {
        const keys = await redisClient.keys(`${CACHE_PREFIX}:*`);
        if (keys.length > 0) await redisClient.del(keys);
    } catch { /* best-effort */ }
}

// ==========================================
// GET  /api/v1/content/:type
// ==========================================

export async function listContent(req: Request, res: Response): Promise<void> {
    const rawType = (req.params as Record<string, string>).type;
    const type = parseContentType(rawType);
    if (!type) { res.status(400).json({ error: 'Tipo inválido.' }); return; }

    const limit  = Math.min(Math.max(Number(req.query.limit  ?? 10), 1), 20);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const cacheKey = `${CACHE_PREFIX}:${type}:${limit}:${offset}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const filter = { type, active: true };
        const [items, total] = await Promise.all([
            Content.find(filter)
                .sort({ pinned: -1, sort_order: 1 })
                .skip(offset)
                .limit(limit)
                .lean(),
            Content.countDocuments(filter),
        ]);

        const payload = {
            items: items.map(docToContentItem),
            total,
            cached_at: new Date().toISOString(),
        };

        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => {});
        res.status(200).json(payload);
    } catch (err) {
        console.error('[Content] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar conteúdo.' });
    }
}

// ==========================================
// GET  /api/v1/content/:type/:id
// ==========================================

export async function getContentItem(req: Request, res: Response): Promise<void> {
    const params = req.params as Record<string, string>;
    const rawType = params.type;
    const id = params.id;
    const type = parseContentType(rawType);
    if (!type) { res.status(400).json({ error: 'Tipo inválido.' }); return; }

    const cacheKey = `${CACHE_PREFIX}:${type}:${id}`;

    try {
        const cached = await redisClient.get(cacheKey).catch(() => null);
        if (cached) {
            res.status(200).json(JSON.parse(cached));
            return;
        }
    } catch { /* fail-open */ }

    try {
        const doc = await Content.findOne({ _id: id, type, active: true }).lean();
        if (!doc) {
            res.status(404).json({ error: 'Conteúdo não encontrado.' });
            return;
        }

        const payload = docToContentItem(doc);
        redisClient.setEx(cacheKey, TTL_SECONDS, JSON.stringify(payload)).catch(() => {});
        res.status(200).json(payload);
    } catch (err) {
        console.error('[Content] Erro ao buscar item:', err);
        res.status(500).json({ error: 'Erro ao buscar conteúdo.' });
    }
}

// ==========================================
// POST  /api/v1/content/:type
// ==========================================

export async function createContentItem(req: Request, res: Response): Promise<void> {
    const rawType = (req.params as Record<string, string>).type;
    const type = parseContentType(rawType);
    if (!type) { res.status(400).json({ error: 'Tipo inválido.' }); return; }

    const { title, content, content_format, image_url, metadata, pinned, sort_order, locale_overrides } = req.body;

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
        res.status(400).json({ error: 'Campos "title" e "content" são obrigatórios.' });
        return;
    }

    try {
        const resolvedOverrides = locale_overrides ?? await autoTranslate(title, content);

        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'item';

        const item = await Content.create({
            type,
            slug,
            title,
            content,
            content_format: content_format ?? 'text',
            image_url: image_url ?? null,
            metadata: metadata ?? null,
            pinned: pinned === true,
            sort_order: sort_order ?? 0,
            locale_overrides: resolvedOverrides,
            active: true,
            published_at: new Date(),
            published_by: (req as any).user?.wallet ?? 'unknown',
        });

        await invalidateCache();
        res.status(201).json(docToContentItem(typeof item.toObject === 'function' ? item.toObject() : item));
    } catch (err) {
        console.error('[Content] Erro ao criar:', err);
        res.status(500).json({ error: 'Erro ao criar conteúdo.' });
    }
}

async function autoTranslate(
    title: string,
    content: string,
): Promise<Partial<Record<'en-US' | 'zh-CN', { title: string; content: string }>>> {
    try {
        return await translateNewsContent(title, content, 'pt', ['en-US', 'zh-CN']);
    } catch (err) {
        console.warn('[Content] Tradução automática falhou:', err);
        return {};
    }
}

// ==========================================
// PUT  /api/v1/content/:type/:id
// ==========================================

export async function updateContentItem(req: Request, res: Response): Promise<void> {
    const { id } = req.params as Record<string, string>;
    const allowed = ['title', 'content', 'content_format', 'image_url', 'metadata', 'pinned', 'sort_order', 'locale_overrides', 'active'];

    const update: Record<string, unknown> = {};
    for (const key of allowed) {
        if (key in req.body) {
            update[key] = req.body[key];
        }
    }

    if (Object.keys(update).length === 0) {
        res.status(400).json({ error: 'Nenhum campo para atualizar.' });
        return;
    }

    try {
        const doc = await Content.findByIdAndUpdate(id, update, { new: true }).lean();
        if (!doc) {
            res.status(404).json({ error: 'Conteúdo não encontrado.' });
            return;
        }

        await invalidateCache();
        res.status(200).json(docToContentItem(doc));
    } catch (err) {
        console.error('[Content] Erro ao atualizar:', err);
        res.status(500).json({ error: 'Erro ao atualizar conteúdo.' });
    }
}

// ==========================================
// DELETE  /api/v1/content/:type/:id
// ==========================================

export async function deleteContentItem(req: Request, res: Response): Promise<void> {
    const { id } = req.params as Record<string, string>;

    try {
        const doc = await Content.findByIdAndDelete(id).lean();
        if (!doc) {
            res.status(404).json({ error: 'Conteúdo não encontrado.' });
            return;
        }

        await invalidateCache();
        res.status(200).json({ deleted: true });
    } catch (err) {
        console.error('[Content] Erro ao deletar:', err);
        res.status(500).json({ error: 'Erro ao deletar conteúdo.' });
    }
}
