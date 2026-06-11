// Testes do serviço de tradução híbrido — ADR-025

// ──────────────────────────────────────────────────────────────────────────────
// Mocks

const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisSetEx = jest.fn().mockResolvedValue('OK');

jest.mock('../../database/redis', () => ({
    redisClient: { get: mockRedisGet, setEx: mockRedisSetEx },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers

function mockFetchOk(body: unknown) {
    mockFetch.mockResolvedValueOnce({
        ok:     true,
        status: 200,
        json:   async () => body,
    });
}

function mockFetchFail(status = 500) {
    mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
}

// ──────────────────────────────────────────────────────────────────────────────

import { translate, translateNewsContent, resetProviders } from './index';

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    resetProviders();

    // Limpa env para controlar providers em cada teste
    delete process.env.LIBRE_TRANSLATE_URL;
    delete process.env.DEEPL_API_KEY;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    delete process.env.MYMEMORY_EMAIL;
});

// ──────────────────────────────────────────────────────────────────────────────
// Cache

describe('cache Redis', () => {
    it('retorna resultado cacheado sem chamar fetch', async () => {
        process.env.DEEPL_API_KEY = 'test-key';
        mockRedisGet.mockResolvedValueOnce('cached translation');

        const result = await translate('Olá mundo', 'pt', 'en-US');

        expect(result).toEqual({ text: 'cached translation', provider: 'cache', cached: true });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('armazena no Redis após tradução bem-sucedida', async () => {
        process.env.DEEPL_API_KEY = 'test-key';
        mockFetchOk({ translations: [{ text: 'Hello world', detected_source_language: 'PT' }] });

        await translate('Olá mundo', 'pt', 'en-US');

        expect(mockRedisSetEx).toHaveBeenCalledWith(
            expect.stringContaining('translation:'),
            86400,
            'Hello world',
        );
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Provider: DeepL

describe('DeepL provider', () => {
    beforeEach(() => { process.env.DEEPL_API_KEY = 'deepl-test-key'; });

    it('traduz pt→en-US com sucesso', async () => {
        mockFetchOk({ translations: [{ text: 'Hello world', detected_source_language: 'PT' }] });

        const result = await translate('Olá mundo', 'pt', 'en-US');

        expect(result?.text).toBe('Hello world');
        expect(result?.provider).toBe('deepl');
        expect(result?.cached).toBe(false);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('api-free.deepl.com'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('retorna null quando status 456 (quota esgotada)', async () => {
        mockFetchFail(456);
        // MyMemory como fallback
        mockFetchOk({ responseStatus: 200, responseData: { translatedText: 'Hello world' } });

        const result = await translate('Olá mundo', 'pt', 'en-US');

        // Deve ter usado MyMemory após falha do DeepL
        expect(result?.provider).toBe('mymemory');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Provider: Google

describe('Google Translate provider', () => {
    beforeEach(() => { process.env.GOOGLE_TRANSLATE_API_KEY = 'google-test-key'; });

    it('traduz para zh-CN com sucesso', async () => {
        mockFetchOk({ data: { translations: [{ translatedText: '你好世界' }] } });

        const result = await translate('Olá mundo', 'pt', 'zh-CN');

        expect(result?.text).toBe('你好世界');
        expect(result?.provider).toBe('google');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('translation.googleapis.com'),
            expect.anything(),
        );
    });

    it('retorna null e cai no fallback quando Google falha', async () => {
        mockFetchFail(403);
        // MyMemory fallback
        mockFetchOk({ responseStatus: 200, responseData: { translatedText: '你好世界' } });

        const result = await translate('Olá mundo', 'pt', 'zh-CN');
        expect(result?.provider).toBe('mymemory');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Provider: LibreTranslate

describe('LibreTranslate provider (dev)', () => {
    beforeEach(() => {
        process.env.LIBRE_TRANSLATE_URL = 'http://libretranslate:5000';
        process.env.DEEPL_API_KEY = 'deepl-key';
    });

    it('é chamado ANTES do DeepL (prioridade dev)', async () => {
        mockFetchOk({ translatedText: 'Hello world' }); // LibreTranslate

        const result = await translate('Olá mundo', 'pt', 'en-US');

        expect(result?.provider).toBe('libretranslate');
        // fetch chamado apenas uma vez — não chegou no DeepL
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('libretranslate:5000'),
            expect.anything(),
        );
    });

    it('cai no DeepL quando LibreTranslate falha', async () => {
        mockFetchFail(503);   // LibreTranslate down
        mockFetchOk({ translations: [{ text: 'Hello world', detected_source_language: 'PT' }] });

        const result = await translate('Olá mundo', 'pt', 'en-US');
        expect(result?.provider).toBe('deepl');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Provider: MyMemory (fallback)

describe('MyMemory provider (fallback)', () => {
    it('funciona sem nenhuma chave configurada', async () => {
        mockFetchOk({ responseStatus: 200, responseData: { translatedText: 'Hello world' } });

        const result = await translate('Olá mundo', 'pt', 'en-US');

        expect(result?.provider).toBe('mymemory');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('api.mymemory.translated.net'),
            expect.anything(),
        );
    });

    it('retorna null quando response não é 200', async () => {
        mockFetchOk({ responseStatus: 429, responseData: { translatedText: '' } });

        const result = await translate('Olá mundo', 'pt', 'en-US');
        expect(result).toBeNull();
    });

    it('retorna null quando texto traduzido é igual ao original (sem tradução)', async () => {
        mockFetchOk({ responseStatus: 200, responseData: { translatedText: 'Olá mundo' } });

        const result = await translate('Olá mundo', 'pt', 'en-US');
        expect(result).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Roteamento por par linguístico

describe('roteamento por par linguístico', () => {
    it('roteia pt→en para DeepL antes do Google', async () => {
        process.env.DEEPL_API_KEY = 'deepl-key';
        process.env.GOOGLE_TRANSLATE_API_KEY = 'google-key';

        mockFetchOk({ translations: [{ text: 'Hello', detected_source_language: 'PT' }] });

        const result = await translate('Olá', 'pt', 'en-US');
        expect(result?.provider).toBe('deepl');
    });

    it('roteia pt→zh-CN para Google antes do DeepL', async () => {
        process.env.DEEPL_API_KEY = 'deepl-key';
        process.env.GOOGLE_TRANSLATE_API_KEY = 'google-key';

        mockFetchOk({ data: { translations: [{ translatedText: '你好' }] } });

        const result = await translate('Olá', 'pt', 'zh-CN');
        expect(result?.provider).toBe('google');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// translateNewsContent

describe('translateNewsContent', () => {
    beforeEach(() => { process.env.DEEPL_API_KEY = 'deepl-key'; });

    it('retorna overrides para en-US e zh-CN quando tudo funciona', async () => {
        // Promise.all executa as 4 traduções em paralelo — usamos mockImplementation
        // por inspeção do body para evitar dependência de ordem de execução.
        mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
            const body = (init?.body ?? '').toString();
            const isTitle = body.includes('Grande') || body.includes('%E3%83%97'); // urlencoded
            const textValue = isTitle ? 'Big Promotion' : 'Get 50% off.';
            // DeepL retorna o mesmo formato para qualquer target_lang neste mock
            return {
                ok: true, status: 200,
                json: async () => ({ translations: [{ text: textValue, detected_source_language: 'PT' }] }),
            };
        });

        const overrides = await translateNewsContent('Grande Promoção', 'Ganhe 50% de desconto.');

        // Ambos locales devem estar presentes com title e content traduzidos
        expect(overrides['en-US']).toMatchObject({ title: expect.any(String), content: expect.any(String) });
        expect(overrides['zh-CN']).toMatchObject({ title: expect.any(String), content: expect.any(String) });
        expect(overrides['en-US']!.title).not.toBe('');
        expect(overrides['zh-CN']!.content).not.toBe('');
    });

    it('omite locale do override quando tradução falha parcialmente', async () => {
        // en-US ok
        mockFetchOk({ translations: [{ text: 'Title EN', detected_source_language: 'PT' }] });
        mockFetchOk({ translations: [{ text: 'Content EN', detected_source_language: 'PT' }] });
        // zh-CN: falha em todos os providers
        mockFetchFail(500); // DeepL
        mockFetchFail(500); // MyMemory

        const overrides = await translateNewsContent('Título', 'Conteúdo');

        expect(overrides['en-US']).toBeDefined();
        expect(overrides['zh-CN']).toBeUndefined();
    });

    it('retorna objeto vazio quando todos os providers falham', async () => {
        // Sem chaves — só MyMemory disponível, que falha
        delete process.env.DEEPL_API_KEY;
        mockFetchFail(500);
        mockFetchFail(500);

        const overrides = await translateNewsContent('Título', 'Conteúdo');
        expect(Object.keys(overrides)).toHaveLength(0);
    });

    it('não chama tradução quando texto está vazio', async () => {
        const overrides = await translateNewsContent('', '');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(Object.keys(overrides)).toHaveLength(0);
    });
});
