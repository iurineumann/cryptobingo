// NewsPage.test.tsx — feed público de notícias. Ref: ADR-024.
// Cobre: loading, itens renderizados, locale_overrides, paginação, erro, vazio.

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let mockLanguage = 'pt';

vi.mock('react-i18next', () => {
    const t = (k: string, opts?: Record<string, unknown>) =>
        opts ? `${k}:${JSON.stringify(opts)}` : k;
    return { useTranslation: () => ({ t, i18n: { language: mockLanguage } }) };
});

vi.mock('../services/api', () => ({
    fetchNews: vi.fn(),
}));

import NewsPage from './NewsPage';
import { fetchNews } from '../services/api';

const mockFetchNews = vi.mocked(fetchNews);

const ITEM = {
    id:               'n1',
    title:            'Promoção',
    content:          'Conteúdo da promoção.',
    image_url:        null,
    locale_overrides: { 'en-US': { title: 'Promo', content: 'Promo content.' } },
    active:           true,
    pinned:           false,
    published_at:     '2026-01-01T12:00:00Z',
    published_by:     'admin1',
};

const PINNED_ITEM = { ...ITEM, id: 'n2', title: 'Destaque', pinned: true };

describe('NewsPage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockLanguage = 'pt';
    });

    it('mostra spinner durante loading inicial', () => {
        mockFetchNews.mockReturnValue(new Promise(() => {}));
        render(<NewsPage />);

        expect(screen.getByTestId('news-loading')).toBeInTheDocument();
    });

    it('renderiza itens após fetch bem-sucedido', async () => {
        mockFetchNews.mockResolvedValue({ items: [ITEM], total: 1, cached_at: '2026-01-01T00:00:00Z' } as any);

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.getByTestId('news-item-n1')).toBeInTheDocument();
            expect(screen.getByTestId('news-heading-n1')).toHaveTextContent('Promoção');
            expect(screen.getByTestId('news-content-n1')).toHaveTextContent('Conteúdo da promoção.');
        });
    });

    it('usa locale_overrides quando idioma ativo é en-US', async () => {
        mockLanguage = 'en-US';
        mockFetchNews.mockResolvedValue({ items: [ITEM], total: 1, cached_at: '2026-01-01T00:00:00Z' } as any);

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.getByTestId('news-item-n1')).toBeInTheDocument();
            expect(screen.getByTestId('news-heading-n1')).toHaveTextContent('Promo');
            expect(screen.getByTestId('news-content-n1')).toHaveTextContent('Promo content.');
        });
    });

    it('mostra badge pinned para itens fixados', async () => {
        mockFetchNews.mockResolvedValue({ items: [PINNED_ITEM], total: 1, cached_at: '2026-01-01T00:00:00Z' } as any);

        render(<NewsPage />);

        await waitFor(() => expect(screen.getByTestId('news-pinned-n2')).toBeInTheDocument());
    });

    it('não mostra badge pinned para itens normais', async () => {
        mockFetchNews.mockResolvedValue({ items: [ITEM], total: 1, cached_at: '2026-01-01T00:00:00Z' } as any);

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.queryByTestId('news-loading')).not.toBeInTheDocument();
            expect(screen.queryByTestId('news-pinned-n1')).not.toBeInTheDocument();
        });
    });

    it('mostra estado vazio quando não há publicações', async () => {
        mockFetchNews.mockResolvedValue({ items: [], total: 0, cached_at: '2026-01-01T00:00:00Z' } as any);

        render(<NewsPage />);

        await waitFor(() => expect(screen.getByTestId('news-empty')).toBeInTheDocument());
    });

    it('mostra erro quando fetch falha', async () => {
        mockFetchNews.mockRejectedValue(new Error('Servidor indisponível'));

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.getByTestId('news-error')).toBeInTheDocument();
            expect(screen.getByTestId('news-error')).toHaveTextContent('Servidor indisponível');
        });
    });

    it('botão load more aparece e carrega próxima página', async () => {
        mockFetchNews
            .mockResolvedValueOnce({ items: [ITEM], total: 2, cached_at: '' } as any)
            .mockResolvedValueOnce({ items: [PINNED_ITEM], total: 2, cached_at: '' } as any);

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.getByTestId('news-load-more')).toBeInTheDocument();
            expect(screen.getByTestId('news-item-n1')).toBeInTheDocument();
        });

        await act(async () => { fireEvent.click(screen.getByTestId('news-load-more')); });

        await waitFor(() => {
            expect(screen.getByTestId('news-item-n2')).toBeInTheDocument();
            expect(screen.getByTestId('news-item-n1')).toBeInTheDocument();
        });
    });

    it('botão load more não aparece quando todos itens estão carregados', async () => {
        mockFetchNews.mockResolvedValue({ items: [ITEM], total: 1, cached_at: '' } as any);

        render(<NewsPage />);

        await waitFor(() => {
            expect(screen.queryByTestId('news-loading')).not.toBeInTheDocument();
            expect(screen.queryByTestId('news-load-more')).not.toBeInTheDocument();
        });
    });
});
