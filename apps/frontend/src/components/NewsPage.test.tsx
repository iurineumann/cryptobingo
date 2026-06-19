// Testes de NewsPage (ADR-024).
// Cobre: render, lista de itens, pinned badge, locale override, estado vazio, erro, load more.

import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import NewsPage from './NewsPage';

afterEach(cleanup);

vi.mock('../services/api', () => ({
    fetchNews: vi.fn(),
}));

vi.mock('react-i18next', () => {
    const t = (k: string) => k;
    const i18n = { language: 'pt' };
    return { useTranslation: () => ({ t, i18n }) };
});

import { fetchNews } from '../services/api';
const mockFetchNews = fetchNews as ReturnType<typeof vi.fn>;

const ITEM_BASE = {
    id:              'n1',
    title:           'Promoção de Bingo',
    content:         'Ganhe bônus este fim de semana!',
    image_url:       null,
    locale_overrides: {},
    active:          true,
    pinned:          false,
    published_at:    '2026-01-15T10:00:00Z',
    published_by:    'admin.wam',
};

const PAGE_1 = { items: [ITEM_BASE], total: 15, cached_at: '' };
const PAGE_2 = { items: [{ ...ITEM_BASE, id: 'n2', title: 'Notícia 2' }], total: 15, cached_at: '' };

beforeEach(() => {
    vi.clearAllMocks();
    mockFetchNews.mockResolvedValue(PAGE_1);
});

describe('NewsPage — render e estado inicial', () => {
    it('[REG] renderiza página com data-testid correto', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-page')).toBeDefined());
    });

    it('[REG] mostra spinner enquanto carrega', () => {
        mockFetchNews.mockImplementation(() => new Promise(() => {}));
        render(<NewsPage />);
        expect(screen.getByTestId('news-loading')).toBeDefined();
    });

    it('[REG] esconde spinner após carregar', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.queryByTestId('news-loading')).toBeNull());
    });
});

describe('NewsPage — lista de itens', () => {
    it('[REG] renderiza item com data-testid correto', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-item-n1')).toBeDefined());
    });

    it('[REG] exibe título e conteúdo do item', async () => {
        render(<NewsPage />);
        await waitFor(() => {
            expect(screen.getByTestId('news-heading-n1').textContent).toBe('Promoção de Bingo');
            expect(screen.getByTestId('news-content-n1').textContent).toContain('Ganhe bônus');
        });
    });

    it('[REG] item sem image_url não renderiza img', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.queryByTestId('news-image-n1')).toBeNull());
    });

    it('[REG] item com image_url renderiza img', async () => {
        mockFetchNews.mockResolvedValue({
            ...PAGE_1,
            items: [{ ...ITEM_BASE, image_url: 'https://example.com/img.png' }],
        });
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-image-n1')).toBeDefined());
    });
});

describe('NewsPage — pinned badge', () => {
    it('[REG] item pinned exibe badge', async () => {
        mockFetchNews.mockResolvedValue({ items: [{ ...ITEM_BASE, pinned: true }], total: 1, cached_at: '' });
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-pinned-n1')).toBeDefined());
    });

    it('[REG] item não pinned não exibe badge', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.queryByTestId('news-pinned-n1')).toBeNull());
    });
});

describe('NewsPage — locale overrides', () => {
    it('[REG] item com locale_overrides renderiza heading', async () => {
        const item = {
            ...ITEM_BASE,
            locale_overrides: { 'en-US': { title: 'Bingo Promo EN', content: 'Get bonus!' } },
        };
        mockFetchNews.mockResolvedValue({ items: [item], total: 1, cached_at: '' });
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-heading-n1')).toBeDefined());
    });
});

describe('NewsPage — estado vazio', () => {
    it('[REG] lista vazia mostra mensagem news.empty', async () => {
        mockFetchNews.mockResolvedValue({ items: [], total: 0, cached_at: '' });
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-empty')).toBeDefined());
    });
});

describe('NewsPage — erro', () => {
    it('[REG] mostra news-error ao falhar', async () => {
        mockFetchNews.mockRejectedValue(new Error('Servidor fora'));
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-error')).toBeDefined());
    });
});

describe('NewsPage — paginação load more', () => {
    it('[REG] botão load more aparece e não está desabilitado quando há mais itens', async () => {
        render(<NewsPage />);
        await waitFor(() => expect(screen.getByTestId('news-load-more')).toBeDefined());
        const btn = screen.getByTestId('news-load-more') as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
    });

    it('[REG] botão load more não aparece quando total == items.length', async () => {
        mockFetchNews.mockResolvedValue({ items: [ITEM_BASE], total: 1, cached_at: '' });
        render(<NewsPage />);
        await waitFor(() => expect(screen.queryByTestId('news-loading')).toBeNull());
        expect(screen.queryByTestId('news-load-more')).toBeNull();
    });
});
