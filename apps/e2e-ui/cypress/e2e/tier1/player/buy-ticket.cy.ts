// apps/e2e-ui/cypress/e2e/tier1/player/buy-ticket.cy.ts
// Tier 1 — fluxo de compra de cartelas (BuyTicketModal) no JOGADOR (ADR-001/010/017).
//
// O modal abre dentro da GameRoom de um jogo em funding ("buy more"). O fluxo:
//   form (buy-count / buy-price) → generate (buy-preview) → preview → buy-confirm.
//
// Borda de rede (Tier 1):
//   - generateSignedTickets → POST /api/v1/games/:id/tickets/generate (interceptável).
//   - A confirmação final usa session.transact() direto (não stubável de forma
//     confiável no Tier 1 — ver skill e ADR-017). Logo aqui validamos os ESTADOS de
//     UI até o confirm habilitado + o caminho de ERRO do generate; a compra on-chain
//     real (sucesso/erro de transact → buy-error) é exercida no Tier 2.

const FUNDING_GAME = '1717000000000';

function enterFundingRoomAndOpenModal() {
    cy.devLogin('player', 'funding');
    cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
    cy.get('[data-testid="lobby-buy-1"]').click();
    cy.location('pathname', { timeout: 10_000 }).should('eq', `/room/1/${FUNDING_GAME}`);
    // GameRoom em funding expõe "buy more" na seção de cartelas → abre o modal.
    cy.get('[data-testid="gr-ball-hero"]', { timeout: 15_000 }).should('exist');
    cy.get('[data-testid="gr-buy-more"]').click();
    cy.get('[data-testid="buy-modal"]').should('be.visible');
}

describe('Player · Compra de cartelas', () => {
    it('abre o modal e mostra os controles do formulário', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' }).as('generate');
        enterFundingRoomAndOpenModal();

        cy.get('[data-testid="buy-count"]').should('contain.text', '1');
        cy.get('[data-testid="buy-price"]').should('be.visible');
        cy.get('[data-testid="buy-preview"]').should('be.enabled');
    });

    it('form → generate → preview → confirm habilitado', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' }).as('generate');
        enterFundingRoomAndOpenModal();

        cy.get('[data-testid="buy-preview"]').click();
        cy.wait('@generate');
        // Confirmar aparece no step preview e fica habilitado com ≥1 cartela.
        // (scrollIntoView: o botão fica abaixo da lista rolável do preview.)
        cy.get('[data-testid="buy-confirm"]', { timeout: 10_000 })
            .scrollIntoView()
            .should('be.visible')
            .and('be.enabled');
    });

    it('preço fora do range exibe erro e bloqueia o generate', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' }).as('generate');
        enterFundingRoomAndOpenModal();

        // Faixa da sala: 5–50 BINGO (rooms.funding.json). Acima do máximo → priceError.
        cy.get('[data-testid="buy-price"]').clear().type('999.0000 BINGO');
        cy.get('[data-testid="buy-preview"]').should('be.disabled');
    });

    it('falha no generate mantém o modal no formulário (sem ir a preview)', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', {
            statusCode: 500,
            body: { error: 'falha simulada (E2E)' },
        }).as('generateFail');
        enterFundingRoomAndOpenModal();

        cy.get('[data-testid="buy-preview"]').click();
        cy.wait('@generateFail');
        // Sem batch gerado → permanece no step form; buy-confirm (preview) não existe.
        cy.get('[data-testid="buy-confirm"]').should('not.exist');
        cy.get('[data-testid="buy-count"]').should('be.visible');
    });
});

export {};
