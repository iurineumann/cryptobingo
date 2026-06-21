// apps/e2e-ui/cypress/e2e/tier1/player/landing.cy.ts
// Tier 1 — Landing page pública (ADR-017).
// Cobre: título, seletor idioma, botão conectar, dev-login toggle.

describe('Landing Page', () => {
    it('exibe título e botão conectar', () => {
        cy.visit('/');
        cy.get('[data-testid="landing-connect"]').should('be.visible');
    });

    it('seletor de idioma tem 3 opções', () => {
        cy.visit('/');
        cy.get('[data-testid="lang-select"]').should('exist');
        cy.get('[data-testid="lang-opt-pt"]').should('exist');
        cy.get('[data-testid="lang-opt-en"]').should('exist');
        cy.get('[data-testid="lang-opt-zh"]').should('exist');
    });

    it('dev-login toggle abre dropdown com perfis', () => {
        cy.visit('/');
        cy.get('[data-testid="dev-login-toggle"]').click();
        cy.get('[data-testid="dev-login-player"]').should('be.visible');
        cy.get('[data-testid="dev-login-admin"]').should('be.visible');
        cy.get('[data-testid="dev-login-sponsor"]').should('be.visible');
    });
});
