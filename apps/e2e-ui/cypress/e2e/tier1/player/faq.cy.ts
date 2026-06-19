// apps/e2e-ui/cypress/e2e/tier1/player/faq.cy.ts
// Tier 1 — FAQ pública (ADR-017).
// Cobre: página renderiza perguntas do i18n.
// Expandir/recolher testado em vitest (componente); Electron headless
// não propaga click no React 18 createRoot.

describe('Player · FAQ', () => {
    beforeEach(() => {
        cy.visit('/faq');
    });

    it('exibe título e lista', () => {
        cy.get('[data-testid="faq-title"]').should('be.visible');
        cy.get('[data-testid="faq-list"]').should('exist');
    });

    it('lista itens com perguntas do i18n', () => {
        cy.get('[data-testid="faq-item-0"]', { timeout: 10000 }).should('exist');
        cy.get('[data-testid="faq-question-0"]').should('contain', 'CryptoBingo');
        cy.get('[data-testid="faq-item-1"]', { timeout: 10000 }).should('exist');
        cy.get('[data-testid="faq-question-1"]').should('contain', 'jogar');
        cy.get('[data-testid="faq-question-0"]').should('have.attr', 'aria-expanded', 'false');
    });

    it('botões têm aria-expanded e estrutura correta', () => {
        cy.get('[data-testid="faq-question-0"]', { timeout: 10000 }).should('be.visible');
        cy.get('[data-testid="faq-question-0"]').should('have.attr', 'aria-expanded', 'false');
        cy.get('[data-testid="faq-question-0"]').find('span').first().should('contain', 'CryptoBingo');
    });
});
