// apps/api-gateway/src/services/translation/providers/google.ts
// Provider Google Cloud Translation v2 — melhor cobertura zh-CN. Ref: ADR-025.

import type { TranslationProvider, TranslatableLocale } from '../types';

const LOCALE_MAP: Record<TranslatableLocale, string> = {
    'pt':    'pt',
    'en-US': 'en',
    'zh-CN': 'zh-CN',
};

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

interface GoogleTranslateResponse {
    data?: {
        translations?: Array<{ translatedText: string }>;
    };
    error?: { message: string; code: number };
}

export class GoogleTranslateProvider implements TranslationProvider {
    readonly name = 'google';
    readonly supportedPairs = 'all' as const;

    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async translate(text: string, from: TranslatableLocale, to: TranslatableLocale): Promise<string | null> {
        try {
            const params = new URLSearchParams({
                key:    this.apiKey,
                q:      text,
                source: LOCALE_MAP[from],
                target: LOCALE_MAP[to],
                format: 'text',
            });

            const res = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`, {
                method: 'GET',
                signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) return null;

            const data = await res.json() as GoogleTranslateResponse;
            const translated = data.data?.translations?.[0]?.translatedText;
            return translated ?? null;
        } catch {
            return null;
        }
    }
}
