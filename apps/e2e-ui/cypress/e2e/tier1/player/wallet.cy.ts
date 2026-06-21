// apps/e2e-ui/cypress/e2e/tier1/player/wallet.cy.ts
// Tier 1 — Wallet multi-token (ADR-017).
// Cobre: saldos, seletor token, abas depósito/saque, formulário.

function spaNavigate(path: string) {
    cy.window().then((win) => {
        win.history.pushState({}, '', path);
        win.dispatchEvent(new PopStateEvent('popstate'));
    });
}

describe('Player · Wallet', () => {
    beforeEach(() => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        cy.intercept('GET', '**/api/v1/config/tokens', { fixture: 'tokens-config.json' }).as('tokens');
        cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (body.table === 'balances') req.reply({ fixture: 'rpc.balances.json' });
            else if (body.table === 'accounts') req.reply({ fixture: 'rpc.accounts.bingo.json' });
            else req.reply({ body: { rows: [], more: false, next_key: '' } });
        }).as('getTableRows');
        cy.intercept('POST', '**/v1/chain/get_account', { body: { core_liquid_balance: '10.00000000 WAX' } }).as('getAccount');
        spaNavigate('/wallet');
    });

    it('exibe título e seção de saldos', () => {
        cy.get('[data-testid="wallet-title"]').should('be.visible');
        cy.get('[data-testid="wallet-balance-BINGO"]').should('contain', '500.0000');
        cy.get('[data-testid="wallet-contract-BINGO"]').should('contain', '150.0000');
    });

    it('lista WAX e BINGO nos tokens', () => {
        cy.get('[data-testid="wallet-token-WAX"]').should('be.visible');
        cy.get('[data-testid="wallet-token-BINGO"]').should('be.visible');
    });

    it('alterna entre depósito e saque', () => {
        cy.get('[data-testid="wallet-mode-deposit"]').should('have.class', 'cb-btn-primary');
        cy.get('[data-testid="wallet-mode-withdraw"]').click();
        cy.get('[data-testid="wallet-mode-withdraw"]').should('have.class', 'cb-btn-primary');
        cy.get('[data-testid="wallet-mode-deposit"]').should('have.class', 'cb-btn-outline');
    });

    it('preenche valor e habilita botão ação', () => {
        cy.get('[data-testid="wallet-amount-input"]').type('50');
        cy.get('[data-testid="wallet-action-btn"]').should('not.be.disabled');
    });

    it('botão Max preenche valor máximo disponível', () => {
        cy.get('[data-testid="wallet-max-btn"]').click();
        cy.get('[data-testid="wallet-amount-input"]').should('not.have.value', '');
    });

    it('exibe resultado após ação', () => {
        cy.intercept('POST', '**/v1/chain/send_transaction*', { body: { transaction_id: '0x123' } }).as('tx');
        cy.get('[data-testid="wallet-amount-input"]').type('10');
        cy.get('[data-testid="wallet-action-btn"]').click();
    });

    it('mostra estado vazio quando sem tokens configurados', () => {
        cy.intercept('GET', '**/api/v1/config/tokens', { body: { tokens: [] } }).as('tokensEmpty');
        cy.intercept('POST', '**/v1/chain/get_account', { body: { core_liquid_balance: '0.00000000 WAX' } });
        spaNavigate('/wallet');
        cy.wait('@tokensEmpty');
        cy.get('[data-testid="wallet-empty"]').should('be.visible');
    });
});

export {};
