// apps/e2e-ui/cypress/e2e/tier1/player/profile.cy.ts
// Tier 1 — Perfil do jogador (ADR-017).
// Cobre: 3 abas (profile/nfts/xp), campos, achievement cards.

function spaNavigate(path: string) {
    cy.window().then((win) => {
        win.history.pushState({}, '', path);
        win.dispatchEvent(new PopStateEvent('popstate'));
    });
}

describe('Player · Profile', () => {
    beforeEach(() => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        cy.intercept('GET', '**/api/v1/nfts/my-assets', { body: { assets: [] } }).as('myNfts');
        cy.intercept('GET', '**/api/v1/profile/achievements', { body: {
            achievements: [
                { id: 'first_win', label: 'Primeira Vitória', desc: 'Ganhe 1 partida', icon: '🏆', unlocked: true },
                { id: 'ten_games', label: '10 Partidas', desc: 'Jogue 10 partidas', icon: '🎮', unlocked: false },
            ],
        } }).as('achievements');
        spaNavigate('/profile');
    });

    it('exibe 3 abas', () => {
        cy.get('[data-testid="profile-tab-profile"]').should('be.visible');
        cy.get('[data-testid="profile-tab-nfts"]').should('be.visible');
        cy.get('[data-testid="profile-tab-xp"]').should('be.visible');
    });

    it('aba perfil mostra wallet e input nickname', () => {
        cy.get('[data-testid="profile-wallet"]').should('exist');
        cy.get('[data-testid="profile-nickname-input"]').should('be.visible');
        cy.get('[data-testid="profile-save-btn"]').should('exist');
    });

    it('aba NFTs mostra lista vazia (sem NFTs mockados)', () => {
        cy.get('[data-testid="profile-tab-nfts"]').click();
        cy.get('[data-testid="profile-sync-burns-btn"]').should('be.visible');
    });

    it('aba XP mostra achievements com locked/unlocked', () => {
        cy.get('[data-testid="profile-tab-xp"]').click();
        cy.get('[data-testid="profile-tab-xp"]').should('have.attr', 'aria-current');
        cy.get('[data-testid="achievement-first_win"]').should('be.visible');
        cy.get('[data-testid="achievement-ten_games"]').should('be.visible');
    });

    it('campo nickname editável', () => {
        cy.get('[data-testid="profile-nickname-input"]').clear();
        cy.get('[data-testid="profile-nickname-input"]').type('NovoNome');
        cy.get('[data-testid="profile-save-btn"]').should('not.be.disabled');
    });
});

export {};
