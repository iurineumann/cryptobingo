// apps/api-gateway/src/services/translation/providers/mymemory.ts
// Provider MyMemory — fallback universal, sem chave. Ref: ADR-025.
// Limite: 5.000 chars/dia sem chave; 10.000/dia com email (MYMEMORY_EMAIL env).

import type { TranslationProvider, TranslatableLocale } from '../types';

const LOCALE_MAP: Record<TranslatableLocale, string> = {
    'pt':    'pt-BR',
    'en-US': 'en-US',
    'zh-CN': 'zh-CN',
};

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

interface MyMemoryResponse {
    responseStatus:  number;
    responseData?:   { translatedText?: string };
    responseDetails?: string;
}

export class MyMemoryProvider implements TranslationProvider {
    readonly name = 'mymemory';
    readonly supportedPairs = 'all' as const;

    private readonly email?: string;

    constructor(email?: string) {
        // Email opcional — aumenta o limite diário de 5K para 10K chars
        this.email = email;
    }

    async translate(text: string, from: TranslatableLocale, to: TranslatableLocale): Promise<string | null> {
        // MyMemory não lida bem com textos longos; trunca preventivamente
        const truncated = text.length > 500 ? text.slice(0, 500) : text;

        try {
            const params = new URLSearchParams({
                q:        truncated,
                langpair: `${LOCALE_MAP[from]}|${LOCALE_MAP[to]}`,
            });
            if (this.email) params.set('de', this.email);

            const res = await fetch(`${MYMEMORY_URL}?${params}`, {
                signal: AbortSignal.timeout(8_000),
            });

            if (!res.ok) return null;

            const data = await res.json() as MyMemoryResponse;

            // responseStatus 200 = sucesso; 429 = quota; outros = erro
            if (data.responseStatus !== 200) return null;

            const translated = data.responseData?.translatedText;
            // MyMemory às vezes retorna o texto original quando não consegue traduzir
            if (!translated || translated === truncated) return null;

            return translated;
        } catch {
            return null;
        }
    }
}
