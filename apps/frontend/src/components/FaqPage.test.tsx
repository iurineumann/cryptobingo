// Testes de FaqPage (ADR-024).
// Cobre: render, accordion open/close, acessibilidade aria-expanded.

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FaqPage from './FaqPage';

const FAQ_ITEMS = [
    { question: 'O que é o CryptoBingo?',  answer: 'É uma plataforma de bingo on-chain.' },
    { question: 'Como faço para jogar?',   answer: 'Conecte sua carteira WAX e compre cartelas.' },
    { question: 'Os sorteios são justos?', answer: 'Sim, usamos um oráculo RNG verificável.' },
];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: any) => {
            if (key === 'faq.items' && opts?.returnObjects) return FAQ_ITEMS;
            return key;
        },
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('FaqPage — render', () => {
    it('[REG] renderiza página com data-testid correto', () => {
        render(<FaqPage />);
        expect(screen.getByTestId('faq-page')).toBeDefined();
    });

    it('[REG] renderiza lista de perguntas', () => {
        render(<FaqPage />);
        expect(screen.getByTestId('faq-list')).toBeDefined();
        FAQ_ITEMS.forEach((_, idx) => {
            expect(screen.getByTestId(`faq-item-${idx}`)).toBeDefined();
            expect(screen.getByTestId(`faq-question-${idx}`)).toBeDefined();
        });
    });

    it('[REG] respostas fechadas por padrão (nenhum faq-answer visível)', () => {
        render(<FaqPage />);
        FAQ_ITEMS.forEach((_, idx) => {
            expect(screen.queryByTestId(`faq-answer-${idx}`)).toBeNull();
        });
    });
});

describe('FaqPage — accordion', () => {
    it('[REG] clique abre a resposta', () => {
        render(<FaqPage />);
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();
        expect(screen.getByTestId('faq-answer-0').textContent).toContain('bingo on-chain');
    });

    it('[REG] clique novamente fecha a resposta', () => {
        render(<FaqPage />);
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.queryByTestId('faq-answer-0')).toBeNull();
    });

    it('[REG] abrir segunda pergunta não mantém a primeira aberta', () => {
        render(<FaqPage />);
        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeDefined();

        fireEvent.click(screen.getByTestId('faq-question-1'));
        expect(screen.queryByTestId('faq-answer-0')).toBeNull();
        expect(screen.getByTestId('faq-answer-1')).toBeDefined();
    });

    it('[REG] conteúdo da resposta é correto', () => {
        render(<FaqPage />);
        fireEvent.click(screen.getByTestId('faq-question-2'));
        expect(screen.getByTestId('faq-answer-2').textContent).toContain('oráculo RNG');
    });
});

describe('FaqPage — acessibilidade', () => {
    it('[REG] aria-expanded=false quando fechado', () => {
        render(<FaqPage />);
        const btn = screen.getByTestId('faq-question-0');
        expect((btn as HTMLButtonElement).getAttribute('aria-expanded')).toBe('false');
    });

    it('[REG] aria-expanded=true quando aberto', () => {
        render(<FaqPage />);
        fireEvent.click(screen.getByTestId('faq-question-0'));
        const btn = screen.getByTestId('faq-question-0');
        expect((btn as HTMLButtonElement).getAttribute('aria-expanded')).toBe('true');
    });
});
