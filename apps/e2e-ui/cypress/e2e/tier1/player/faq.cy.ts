// apps/e2e-ui/cypress/e2e/tier1/player/faq.cy.ts
// Tier 1 — Página pública de FAQ estático (ADR-024, ADR-017).
// Página totalmente estática — sem API. Seletores SOMENTE por data-testid.

describe('Player · FAQ', () => {
    beforeEach(() => {
        cy.visit('/faq');
    });

    it('exibe título e lista de perguntas', () => {
        cy.get('[data-testid="faq-title"]').should('be.visible');
        cy.get('[data-testid="faq-list"]').should('be.visible');
        // Confirma que existe ao menos 1 item (conteúdo vem do i18n)
        cy.get('[data-testid^="faq-item-"]').should('have.length.gte', 1);
    });

    it('respostas estão ocultas inicialmente', () => {
        cy.get('[data-testid^="faq-answer-"]').should('not.exist');
    });

    it('clique na pergunta expande a resposta correspondente', () => {
        cy.get('[data-testid="faq-question-0"]').click();

        cy.get('[data-testid="faq-answer-0"]').should('be.visible');
    });

    it('aria-expanded é true após abrir', () => {
        cy.get('[data-testid="faq-question-0"]').click();

        cy.get('[data-testid="faq-question-0"]').should('have.attr', 'aria-expanded', 'true');
    });

    it('clique novamente colapsa a resposta', () => {
        cy.get('[data-testid="faq-question-0"]').click();
        cy.get('[data-testid="faq-answer-0"]').should('be.visible');

        cy.get('[data-testid="faq-question-0"]').click();
        cy.get('[data-testid="faq-answer-0"]').should('not.exist');
    });

    it('abrir item diferente colapsa o anterior', () => {
        cy.get('[data-testid="faq-item-1"]').should('exist'); // precisa ter ≥ 2 itens no i18n

        cy.get('[data-testid="faq-question-0"]').click();
        cy.get('[data-testid="faq-answer-0"]').should('be.visible');

        cy.get('[data-testid="faq-question-1"]').click();
        cy.get('[data-testid="faq-answer-0"]').should('not.exist');
        cy.get('[data-testid="faq-answer-1"]').should('be.visible');
    });
});

export {};
