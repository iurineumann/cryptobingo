import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FaqPage from './FaqPage';

const FAQ_ITEMS = [
    { id: 'f1', type: 'faq', slug: 'o-que-e', title: 'O que é o CryptoBingo?', content: 'É uma plataforma de bingo on-chain.', content_format: 'text', image_url: null, metadata: { question: 'O que é o CryptoBingo?' }, pinned: false, sort_order: 1, locale_overrides: {}, active: true, published_at: '2026-01-01T00:00:00Z', published_by: 'admin' },
    { id: 'f2', type: 'faq', slug: 'como-jogar', title: 'Como faço para jogar?', content: 'Conecte sua carteira WAX e compre cartelas.', content_format: 'text', image_url: null, metadata: { question: 'Como faço para jogar?' }, pinned: false, sort_order: 2, locale_overrides: {}, active: true, published_at: '2026-01-01T00:00:00Z', published_by: 'admin' },
    { id: 'f3', type: 'faq', slug: 'sorteios-justos', title: 'Os sorteios são justos?', content: 'Sim, usamos um oráculo RNG verificável.', content_format: 'text', image_url: null, metadata: { question: 'Os sorteios são justos?' }, pinned: false, sort_order: 3, locale_overrides: {}, active: true, published_at: '2026-01-01T00:00:00Z', published_by: 'admin' },
];

vi.mock('../services/api', () => ({
    fetchContentByType: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => {
            if (k === 'faq.title') return 'Perguntas Frequentes';
            if (k === 'faq.subtitle') return 'Subtitle';
            if (k === 'content.error') return 'Erro';
            if (k === 'content.empty') return 'Vazio';
            return k;
        },
        i18n: { language: 'pt' },
    }),
}));

import { fetchContentByType } from '../services/api';
const mockApi = fetchContentByType as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockResolvedValue({ items: FAQ_ITEMS, total: 3, cached_at: '' });
});

describe('FaqPage — render', () => {
    it('[REG] renderiza página com data-testid correto', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-page')).toBeDefined());
    });

    it('[REG] renderiza lista de perguntas', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-list')).toBeDefined());
        FAQ_ITEMS.forEach((_, idx) => {
            expect(screen.getByTestId(`faq-item-${idx}`)).toBeDefined();
            expect(screen.getByTestId(`faq-question-${idx}`)).toBeDefined();
        });
    });

    it('[REG] respostas fechadas por padrão (nenhum faq-answer visível)', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-list')).toBeDefined());
        FAQ_ITEMS.forEach((_, idx) => {
            expect(screen.queryByTestId(`faq-answer-${idx}`)).toBeNull();
        });
    });
});

describe('FaqPage — accordion', () => {
    it('[REG] clique abre a resposta', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-0')).toBeDefined());
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();
        expect(screen.getByTestId('faq-answer-0').textContent).toContain('bingo on-chain');
    });

    it('[REG] clique novamente fecha a resposta', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-0')).toBeDefined());
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.queryByTestId('faq-answer-0')).toBeNull();
    });

    it('[REG] abrir segunda pergunta não mantém a primeira aberta', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-0')).toBeDefined());
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();

        fireEvent.click(screen.getByTestId('faq-question-1'));
        expect(screen.queryByTestId('faq-answer-0')).toBeNull();
        expect(screen.getByTestId('faq-answer-1')).toBeDefined();
    });

    it('[REG] conteúdo da resposta é correto', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-2')).toBeDefined());
        fireEvent.click(screen.getByTestId('faq-question-2'));
        expect(screen.getByTestId('faq-answer-2').textContent).toContain('oráculo RNG');
    });
});

describe('FaqPage — acessibilidade', () => {
    it('[REG] aria-expanded=false quando fechado', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-0')).toBeDefined());
        const btn = screen.getByTestId('faq-question-0');
        expect((btn as HTMLButtonElement).getAttribute('aria-expanded')).toBe('false');
    });

    it('[REG] aria-expanded=true quando aberto', async () => {
        render(<FaqPage />);
        await waitFor(() => expect(screen.getByTestId('faq-question-0')).toBeDefined());
        fireEvent.click(screen.getByTestId('faq-question-0'));
        const btn = screen.getByTestId('faq-question-0');
        expect((btn as HTMLButtonElement).getAttribute('aria-expanded')).toBe('true');
    });
});
