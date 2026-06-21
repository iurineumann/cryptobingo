// apps/api-gateway/src/services/translation/index.ts
// TranslationService: router por par linguístico + cache Redis 24h. Ref: ADR-025.

import { createHash } from 'node:crypto';
import { redisClient } from '../../database/redis';
import { LibreTranslateProvider } from './providers/libretranslate';
import { DeepLProvider }          from './providers/deepl';
import { GoogleTranslateProvider } from './providers/google';
import { MyMemoryProvider }       from './providers/mymemory';
import type { TranslationProvider, TranslatableLocale, TranslationResult } from './types';

const CACHE_TTL = Number(process.env.TRANSLATION_CACHE_TTL ?? 86400);

// ──────────────────────────────────────────────────────────────────────────────
// Inicialização dos providers com base nas variáveis de ambiente

function buildProviders(): TranslationProvider[] {
    const providers: TranslationProvider[] = [];

    // LibreTranslate: ativo apenas quando URL configurada (dev/self-hosted)
    if (process.env.LIBRE_TRANSLATE_URL) {
        providers.push(new LibreTranslateProvider(process.env.LIBRE_TRANSLATE_URL));
    }

    if (process.env.DEEPL_API_KEY) {
        providers.push(new DeepLProvider(process.env.DEEPL_API_KEY));
    }

    if (process.env.GOOGLE_TRANSLATE_API_KEY) {
        providers.push(new GoogleTranslateProvider(process.env.GOOGLE_TRANSLATE_API_KEY));
    }

    // MyMemory sempre disponível como fallback
    providers.push(new MyMemoryProvider(process.env.MYMEMORY_EMAIL));

    return providers;
}

// ──────────────────────────────────────────────────────────────────────────────
// Roteamento por par linguístico
// Retorna providers ordenados do mais adequado para o par ao menos adequado.

function routeProviders( // NOSONAR — roteamento de providers com fallback encadeado por par linguístico e disponibilidade; complexidade inerente ao sistema de tradução híbrido (ADR-025)
    all:  TranslationProvider[],
    from: TranslatableLocale,
    to:   TranslatableLocale,
): TranslationProvider[] {
    const isToZh = to === 'zh-CN';

    // Separa por nome para reordenar sem remover
    const byName = new Map(all.map(p => [p.name, p]));

    const ordered: TranslationProvider[] = [];

    // LibreTranslate em dev: sempre primeiro (ilimitado, não queima quota)
    if (byName.has('libretranslate')) ordered.push(byName.get('libretranslate')!);

    if (isToZh) {
        // zh-CN: Google > DeepL > MyMemory
        if (byName.has('google')) ordered.push(byName.get('google')!);
        if (byName.has('deepl'))  ordered.push(byName.get('deepl')!);
    } else {
        // pt↔en e outros pares: DeepL > Google
        if (byName.has('deepl'))  ordered.push(byName.get('deepl')!);
        if (byName.has('google')) ordered.push(byName.get('google')!);
    }

    // MyMemory sempre por último
    if (byName.has('mymemory')) ordered.push(byName.get('mymemory')!);

    // Deduplicar preservando ordem (LibreTranslate pode ter entrado duas vezes)
    return [...new Map(ordered.map(p => [p.name, p])).values()];
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache Redis

function cacheKey(text: string, from: string, to: string): string {
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    return `translation:${hash}:${from}:${to}`;
}

async function fromCache(key: string): Promise<string | null> {
    try {
        return await redisClient.get(key);
    } catch {
        return null; // fail-open
    }
}

async function toCache(key: string, value: string): Promise<void> {
    try {
        await redisClient.setEx(key, CACHE_TTL, value);
    } catch { /* best-effort */ }
}

// ──────────────────────────────────────────────────────────────────────────────
// API pública

let _providers: TranslationProvider[] | null = null;

function providers(): TranslationProvider[] {
    if (!_providers) _providers = buildProviders();
    return _providers;
}

/** Reseta providers — usado em testes para reinicializar com env mockada. */
export function resetProviders(): void {
    _providers = null;
}

/**
 * Traduz um texto tentando providers em ordem de adequação para o par linguístico.
 * Retorna null se todos falharem (publicação continua sem esse override).
 */
export async function translate(
    text:  string,
    from:  TranslatableLocale,
    to:    TranslatableLocale,
): Promise<TranslationResult | null> {
    if (!text.trim()) return null;

    const key = cacheKey(text, from, to);
    const cached = await fromCache(key);
    if (cached) return { text: cached, provider: 'cache', cached: true };

    const ordered = routeProviders(providers(), from, to);

    for (const provider of ordered) {
        try {
            const result = await provider.translate(text, from, to);
            if (result) {
                await toCache(key, result);
                return { text: result, provider: provider.name, cached: false };
            }
        } catch {
            // provider lançou exceção inesperada — tenta o próximo
        }
    }

    return null;
}

/**
 * Traduz title e content para todos os locales-alvo.
 * Retorna locale_overrides parcial — omite locales onde tradução falhou.
 */
export async function translateNewsContent(
    title:       string,
    content:     string,
    from:        TranslatableLocale = 'pt',
    targets:     TranslatableLocale[] = ['en-US', 'zh-CN'],
): Promise<Partial<Record<'en-US' | 'zh-CN', { title: string; content: string }>>> {
    const overrides: Partial<Record<'en-US' | 'zh-CN', { title: string; content: string }>> = {};

    await Promise.all(
        targets.map(async (to) => {
            const [translatedTitle, translatedContent] = await Promise.all([
                translate(title,   from, to),
                translate(content, from, to),
            ]);

            // Só inclui o override se ambos (title e content) foram traduzidos
            if (translatedTitle && translatedContent) {
                (overrides as any)[to] = {
                    title:   translatedTitle.text,
                    content: translatedContent.text,
                };
            }
        }),
    );

    return overrides;
}
