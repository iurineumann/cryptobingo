// apps/api-gateway/src/services/translation/providers/libretranslate.ts
// Provider LibreTranslate — dev/self-hosted, ilimitado. Ref: ADR-025.

import type { TranslationProvider, TranslatableLocale } from '../types';

// Mapeamento interno → código LibreTranslate
const LOCALE_MAP: Record<TranslatableLocale, string> = {
    'pt':    'pt',
    'en-US': 'en',
    'zh-CN': 'zh',
};

export class LibreTranslateProvider implements TranslationProvider {
    readonly name = 'libretranslate';
    readonly supportedPairs = 'all' as const;

    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async translate(text: string, from: TranslatableLocale, to: TranslatableLocale): Promise<string | null> {
        try {
            const res = await fetch(`${this.baseUrl}/translate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q:      text,
                    source: LOCALE_MAP[from],
                    target: LOCALE_MAP[to],
                    format: 'text',
                }),
                signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) return null;

            const data = await res.json() as { translatedText?: string; error?: string };
            return data.translatedText ?? null;
        } catch {
            return null;
        }
    }
}
