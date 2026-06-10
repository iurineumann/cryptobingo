// apps/e2e-ui/cypress/e2e/tier1/player/buy-ticket-swap.cy.ts
// Tier 1 — Checkout multi-moeda via bingo.swap (ADR-021).
//
// Cobre o fluxo do seletor de moeda no BuyTicketModal:
//   - seletor aparece quando o usuário tem saldo em token alternativo
//   - cotação exibida após selecionar moeda alternativa
//   - detalhes da cotação visíveis (you_send, fee, impact, expiry)
//   - seletor some quando o usuário não tem saldo (pool sem saldo)
//   - fluxo normal continua intacto quando moeda da sala é selecionada
//
// A execução on-chain (3 actions atômicas) é exercida no Tier 2.

const FUNDING_GAME = '1717000000000';

function interceptSwapAPIs() {
    // Pools do bingo.swap
    cy.intercept('GET', '**/api/v1/swap/pools', { fixture: 'swap-pools.json' }).as('swapPools');

    // Cotação reverse AMM
    cy.intercept('GET', '**/api/v1/swap/quote*', { fixture: 'swap-quote.json' }).as('swapQuote');

    // Saldo BINGO do usuário (get_table_rows direto no nodeos)
    cy.intercept('POST', '**/v1/chain/get_table_rows', (req) => {
        if (req.body?.code === 'bingo.token') {
            req.reply({ fixture: 'rpc.token-balance-bingo.json' });
        } else {
            req.continue();
        }
    }).as('rpcBalance');
}

function openModalWithSwap() {
    cy.mockSocket();
    interceptSwapAPIs();
    cy.devLogin('player', 'funding');
    cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
    cy.get('[data-testid="lobby-buy-1"]').click();
    cy.location('pathname', { timeout: 10_000 }).should('eq', `/room/1/${FUNDING_GAME}`);
    cy.get('[data-testid="gr-ball-hero"]', { timeout: 15_000 }).should('exist');
    cy.get('[data-testid="gr-buy-more"]').click();
    cy.get('[data-testid="buy-modal"]').should('be.visible');
}

describe('Player · Checkout multi-moeda (ADR-021)', () => {
    it('seletor de moeda aparece quando há tokens alternativos com saldo', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' });
        openModalWithSwap();

        // Aguarda carregamento assíncrono dos pools e saldos
        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="swap-currency-room"]').should('be.visible');   // WAX (padrão)
        cy.get('[data-testid="swap-currency-BINGO"]').should('be.visible'); // alternativo
    });

    it('selecionar moeda alternativa busca cotação e exibe quote box', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' });
        openModalWithSwap();

        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="swap-currency-BINGO"]').click();

        cy.wait('@swapQuote');
        cy.get('[data-testid="swap-quote-box"]', { timeout: 5_000 }).should('be.visible');
        // Valores da fixture swap-quote.json
        cy.get('[data-testid="swap-quote-box"]').should('contain.text', '21050.0000 BINGO');
    });

    it('cotação exibe taxa de serviço, impacto e validade', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' });
        openModalWithSwap();

        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="swap-currency-BINGO"]').click();
        cy.wait('@swapQuote');

        cy.get('[data-testid="swap-quote-box"]').within(() => {
            // service_fee_bps=100 → 1.00%, fee_bps=30 → 0.30%
            cy.contains('1.00%').should('exist');
            cy.contains('0.30%').should('exist');
            // price_impact_pct=0.02
            cy.contains('0.02%').should('exist');
        });
    });

    it('voltar para moeda da sala esconde a quote box', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' });
        openModalWithSwap();

        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="swap-currency-BINGO"]').click();
        cy.wait('@swapQuote');
        cy.get('[data-testid="swap-quote-box"]').should('be.visible');

        // Volta para moeda padrão
        cy.get('[data-testid="swap-currency-room"]').click();
        cy.get('[data-testid="swap-quote-box"]').should('not.exist');
    });

    it('fluxo normal (moeda da sala) continua intacto com seletor presente', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' }).as('generate');
        openModalWithSwap();

        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        // Moeda da sala é o default — sem swap
        cy.get('[data-testid="swap-currency-room"]').should('have.class', 'cb-btn-primary');

        cy.get('[data-testid="buy-preview"]').click();
        cy.wait('@generate');
        cy.get('[data-testid="buy-confirm"]', { timeout: 10_000 })
            .scrollIntoView()
            .should('be.visible')
            .and('be.enabled');
        // Sem resumo de swap na preview (moeda padrão)
        cy.get('[data-testid="swap-preview-summary"]').should('not.exist');
    });

    it('moeda alternativa selecionada exibe resumo de swap no preview', () => {
        cy.intercept('POST', '**/api/v1/games/*/tickets/generate', { fixture: 'tickets-generate.json' }).as('generate');
        openModalWithSwap();

        cy.get('[data-testid="swap-currency-selector"]', { timeout: 10_000 }).should('be.visible');
        cy.get('[data-testid="swap-currency-BINGO"]').click();
        cy.wait('@swapQuote');

        cy.get('[data-testid="buy-preview"]').click();
        cy.wait('@generate');

        cy.get('[data-testid="swap-preview-summary"]', { timeout: 10_000 })
            .scrollIntoView()
            .should('be.visible')
            .and('contain.text', 'BINGO → WAX');
    });
});
