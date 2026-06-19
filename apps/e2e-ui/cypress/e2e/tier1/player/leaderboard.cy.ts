// apps/e2e-ui/cypress/e2e/tier1/player/leaderboard.cy.ts
// Tier 1 — Leaderboard público (ADR-017, ADR-024).
// Cobre: estrutura da página, tabs, loading, vazio.
// Nota: endpoint real retorna dados; intercept nem sempre bate cross-origin.
//       Testamos estrutura DOM, não valores específicos.

describe('Player · Leaderboard', () => {
    it('exibe título', () => {
        cy.visit('/leaderboard');
        cy.get('[data-testid="leaderboard-title"]', { timeout: 10000 }).should('be.visible');
    });

    it('exibe tabela quando há dados', () => {
        cy.visit('/leaderboard');
        cy.get('[data-testid="leaderboard-table"]', { timeout: 15000 }).should('exist');
    });

    it('alterna tabs winnings/xp', () => {
        cy.visit('/leaderboard');
        cy.get('[data-testid="leaderboard-tab-winnings"]', { timeout: 10000 }).should('be.visible');
        cy.get('[data-testid="leaderboard-tab-xp"]').should('be.visible');
        cy.get('[data-testid="leaderboard-tab-xp"]').click();
        cy.get('[data-testid="leaderboard-table"]', { timeout: 10000 }).should('exist');
    });

    it('mostra estado vazio interceptado', () => {
        // Só intercepta API, não a rota SPA /leaderboard
        cy.intercept('GET', '**/api/v1/leaderboard?*', { body: { entries: [], cached_at: '' } });
        cy.visit('/leaderboard');
        cy.get('[data-testid="leaderboard-empty"]', { timeout: 10000 }).should('be.visible');
    });
});
