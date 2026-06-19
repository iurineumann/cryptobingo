// apps/e2e-ui/cypress/e2e/tier1/player/news.cy.ts
// Tier 1 — Página de notícias (ADR-017).
// Cobre: listagem, item fixado, carregar mais.

describe('Player · News', () => {
    beforeEach(() => {
        cy.intercept('GET', '**/api/v1/news*', { fixture: 'news.json' }).as('news');
        cy.visit('/news');
    });

    it('exibe título e listagem', () => {
        cy.get('[data-testid="news-title"]').should('be.visible');
        cy.get('[data-testid="news-list"]').should('exist');
    });

    it('exibe itens com título e conteúdo', () => {
        cy.get('[data-testid="news-item-news-1"]').should('be.visible');
        cy.get('[data-testid="news-heading-news-1"]').should('contain', 'Grande Prêmio');
        cy.get('[data-testid="news-content-news-1"]').should('be.visible');
    });

    it('item fixado tem badge pinned', () => {
        cy.get('[data-testid="news-pinned-news-1"]').should('be.visible');
    });

    it('mostra estado vazio se sem notícias', () => {
        cy.intercept('GET', '**/api/v1/news*', { body: { items: [], total: 0, cached_at: '' } });
        cy.visit('/news');
        cy.get('[data-testid="news-empty"]').should('be.visible');
    });

    it('load more visível quando há mais páginas', () => {
        cy.get('[data-testid="news-load-more"]').should('exist');
    });
});
