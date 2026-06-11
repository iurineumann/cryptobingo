// apps/api-gateway/src/services/translation/types.ts
// Contrato dos providers e tipos internos do serviço de tradução. Ref: ADR-025.

/** Locales internos suportados pela plataforma (subset do i18n frontend). */
export type TranslatableLocale = 'pt' | 'en-US' | 'zh-CN';

export interface TranslationProvider {
    readonly name: string;
    /**
     * Pares suportados no formato "from:to" (ex: "pt:en-US").
     * 'all' indica suporte universal.
     */
    readonly supportedPairs: ReadonlyArray<`${string}:${string}`> | 'all';
    /**
     * Traduz um texto. Retorna null se o provider não puder atender
     * (quota esgotada, indisponível, resposta inválida).
     */
    translate(text: string, from: TranslatableLocale, to: TranslatableLocale): Promise<string | null>;
}

export interface TranslationResult {
    text:     string;
    provider: string;
    cached:   boolean;
}
