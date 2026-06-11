// apps/e2e-ui/cypress/e2e/tier1/player/leaderboard.cy.ts
// Tier 1 — Página pública de Leaderboard (ADR-024, ADR-017).
// Rota pública — sem auth. Usa cy.intercept para stub do api-gateway.
// Seletores SOMENTE por data-testid.

describe('Player · Leaderboard (global)', () => {
    beforeEach(() => {
        cy.intercept('GET', '**/api/v1/leaderboard*', { fixture: 'leaderboard.json' }).as('leaderboard');
        cy.visit('/leaderboard');
        cy.wait('@leaderboard');
    });

    it('exibe título da página', () => {
        cy.get('[data-testid="leaderboard-title"]').should('be.visible');
    });

    it('renderiza tabela de ranking', () => {
        cy.get('[data-testid="leaderboard-table"]').should('be.visible');
    });

    it('exibe 3 entradas da fixture', () => {
        cy.get('[data-testid="leaderboard-row-1"]').should('be.visible');
        cy.get('[data-testid="leaderboard-row-2"]').should('be.visible');
        cy.get('[data-testid="leaderboard-row-3"]').should('be.visible');
    });

    it('1º lugar mostra nickname Alice', () => {
        cy.get('[data-testid="leaderboard-nickname-1"]').should('have.text', 'Alice');
    });

    it('2º lugar sem nickname mostra wallet truncada', () => {
        // bob.wam tem ≤12 chars — exibe completo (sem truncar)
        cy.get('[data-testid="leaderboard-nickname-2"]').should('contain.text', 'bob.wam');
    });

    it('valores financeiros aparecem na coluna total_won', () => {
        cy.get('[data-testid="leaderboard-total-1"]').should('contain.text', '500');
    });
});

describe('Player · Leaderboard — estado de erro', () => {
    it('exibe mensagem de erro quando API falha', () => {
        cy.intercept('GET', '**/api/v1/leaderboard*', { statusCode: 503, body: { error: 'indisponível' } }).as('leaderboardErr');
        cy.visit('/leaderboard');
        cy.wait('@leaderboardErr');

        cy.get('[data-testid="leaderboard-error"]').should('be.visible');
        cy.get('[data-testid="leaderboard-retry"]').should('be.visible');
    });

    it('retry recarrega os dados', () => {
        let count = 0;
        cy.intercept('GET', '**/api/v1/leaderboard*', (req) => {
            count++;
            if (count === 1) {
                req.reply({ statusCode: 503, body: { error: 'indisponível' } });
            } else {
                req.reply({ fixture: 'leaderboard.json' });
            }
        }).as('leaderboard');

        cy.visit('/leaderboard');
        cy.wait('@leaderboard');
        cy.get('[data-testid="leaderboard-retry"]').click();
        cy.wait('@leaderboard');

        cy.get('[data-testid="leaderboard-table"]').should('be.visible');
    });
});

describe('Player · Leaderboard — estado vazio', () => {
    it('exibe mensagem de vazio quando API retorna lista empty', () => {
        cy.intercept('GET', '**/api/v1/leaderboard*', {
            body: { entries: [], cached_at: '2026-01-01T00:00:00Z', currency_filter: null },
        }).as('leaderboardEmpty');

        cy.visit('/leaderboard');
        cy.wait('@leaderboardEmpty');

        cy.get('[data-testid="leaderboard-empty"]').should('be.visible');
        cy.get('[data-testid="leaderboard-table"]').should('not.exist');
    });
});

export {};
