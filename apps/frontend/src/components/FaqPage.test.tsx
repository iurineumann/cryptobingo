// FaqPage.test.tsx — acordeão de FAQ estático. Ref: ADR-024.
// Cobre: renderização dos itens, toggle abrir/fechar, aria-expanded.

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FaqPage from './FaqPage';

const FAQ_ITEMS = [
    { question: 'Como funciona o bingo?',  answer: 'Compre cartelas e tente completar padrões.' },
    { question: 'Como sacar meus ganhos?', answer: 'Acesse sua carteira e clique em Sacar.' },
];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: Record<string, unknown>) => {
            if (k === 'faq.items') return FAQ_ITEMS;
            if (opts) return `${k}:${JSON.stringify(opts)}`;
            return k;
        },
    }),
}));

describe('FaqPage', () => {
    beforeEach(() => {
        // noop
    });

    it('renderiza título e subtítulo', () => {
        render(<FaqPage />);

        expect(screen.getByTestId('faq-title')).toHaveTextContent('faq.title');
    });

    it('renderiza todos os itens do FAQ', () => {
        render(<FaqPage />);

        expect(screen.getByTestId('faq-item-0')).toBeInTheDocument();
        expect(screen.getByTestId('faq-item-1')).toBeInTheDocument();
        expect(screen.getByTestId('faq-question-0')).toHaveTextContent('Como funciona o bingo?');
    });

    it('resposta não visível antes de clicar', () => {
        render(<FaqPage />);

        expect(screen.queryByTestId('faq-answer-0')).not.toBeInTheDocument();
    });

    it('clique na pergunta expande a resposta', () => {
        render(<FaqPage />);

        fireEvent.click(screen.getByTestId('faq-question-0'));

        expect(screen.getByTestId('faq-answer-0')).toBeInTheDocument();
        expect(screen.getByTestId('faq-answer-0')).toHaveTextContent('Compre cartelas');
    });

    it('aria-expanded reflete estado aberto/fechado', () => {
        render(<FaqPage />);

        const btn = screen.getByTestId('faq-question-0');
        expect(btn).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-expanded', 'true');
    });

    it('clicar novamente colapsa a resposta', () => {
        render(<FaqPage />);

        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.queryByTestId('faq-answer-0')).not.toBeInTheDocument();
    });

    it('abre item diferente colapsa o anterior (só um aberto por vez)', () => {
        render(<FaqPage />);

        fireEvent.click(screen.getByTestId('faq-question-0'));
        expect(screen.getByTestId('faq-answer-0')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('faq-question-1'));
        expect(screen.queryByTestId('faq-answer-0')).not.toBeInTheDocument();
        expect(screen.getByTestId('faq-answer-1')).toBeInTheDocument();
    });
});
