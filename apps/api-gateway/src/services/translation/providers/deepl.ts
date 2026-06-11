// apps/api-gateway/src/services/translation/providers/deepl.ts
// Provider DeepL Free API — melhor qualidade pt↔en. Ref: ADR-025.

import type { TranslationProvider, TranslatableLocale } from '../types';

// DeepL usa códigos diferentes para source e target
const SOURCE_MAP: Record<TranslatableLocale, string> = {
    'pt':    'PT',
    'en-US': 'EN',
    'zh-CN': 'ZH',
};
const TARGET_MAP: Record<TranslatableLocale, string> = {
    'pt':    'PT-BR',
    'en-US': 'EN-US',
    'zh-CN': 'ZH-HANS',
};

// DeepL Free usa endpoint diferente do Pro
const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';

interface DeepLResponse {
    translations?: Array<{ text: string; detected_source_language: string }>;
    message?:      string;
}

export class DeepLProvider implements TranslationProvider {
    readonly name = 'deepl';
    // Melhor qualidade nos pares europeus; zh-CN é suportado mas abaixo do Google
    readonly supportedPairs = 'all' as const;

    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async translate(text: string, from: TranslatableLocale, to: TranslatableLocale): Promise<string | null> {
        try {
            const res = await fetch(DEEPL_FREE_URL, {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/x-www-form-urlencoded',
                    'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
                },
                body: new URLSearchParams({
                    text,
                    source_lang: SOURCE_MAP[from],
                    target_lang: TARGET_MAP[to],
                }).toString(),
                signal: AbortSignal.timeout(10_000),
            });

            // 456 = quota exceeded — retorna null para o router tentar o próximo
            if (res.status === 456 || !res.ok) return null;

            const data = await res.json() as DeepLResponse;
            return data.translations?.[0]?.text ?? null;
        } catch {
            return null;
        }
    }
}
