// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/02-player-full-game.cy.ts
// Jornada completa do jogador contra a chain real + oracle daemon.
// Depende de 01-admin-setup.cy.ts ter criado e ativado uma sala (worker
// cria o jogo na sala ativa automaticamente).
//
// Tolerâncias: slow-reveal real leva ~285s (75 bolas × ~3.8s cada).
// Auth: cy.realDevLogin('player') — JWT real sem intercept.

describe('Player · Jornada completa de jogo (Tier 3 real)', () => {
    const DRAWN_TIMEOUT   = 300_000;
    const LOCK_TIMEOUT    =  90_000;
    const DEFAULT_TIMEOUT =  60_000;

    before(() => {
        cy.realDevLogin('player');
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
    });

    it('lobby exibe pelo menos uma sala ativa (criada pelo 01-admin-setup)', () => {
        // O worker cria um jogo na sala ativada pelo spec anterior.
        // Aguardamos com timeout generoso: o worker pode demorar alguns segundos.
        cy.get('[data-testid^="lobby-card-"]', { timeout: DEFAULT_TIMEOUT })
            .should('have.length.gte', 1);
    });

    it('entra na sala e compra cartela on-chain', () => {
        cy.get('[data-testid^="lobby-card-"]').first().click();
        cy.get('[data-testid="gr-room-header"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');

        cy.get('[data-testid="buy-ticket-btn"]', { timeout: DEFAULT_TIMEOUT })
            .should('not.be.disabled')
            .click();
        cy.get('[data-testid="buy-modal"]', { timeout: DEFAULT_TIMEOUT }).should('be.visible');
        cy.get('[data-testid="buy-confirm"]').should('not.be.disabled').click();

        cy.get(
            '[data-testid="buy-toast-success"], [data-testid="gr-my-tickets"] [data-testid^="gr-ticket-"]',
            { timeout: DEFAULT_TIMEOUT },
        ).should('exist');

        cy.get('body').then(($body) => {
            if ($body.find('[data-testid="buy-modal"]').length) {
                cy.get('[data-testid="buy-modal-close"]').click({ force: true });
            }
        });
    });

    it('sala entra em estado locked (worker bloqueou novas compras)', () => {
        cy.get('[data-testid="gr-game-status"]', { timeout: LOCK_TIMEOUT })
            .should(($el) => {
                expect($el.attr('data-status') ?? $el.text().toLowerCase())
                    .to.match(/drawing|drawn|locked/);
            });
    });

    it('bolas sorteadas chegam via WebSocket real (oracle → broadcaster)', () => {
        // Cada bola leva ~3.8s no reveal; aguardamos 10 bolas como evidência de progresso.
        cy.get('[data-testid="gr-ball-history"] .gr-mini-ball', { timeout: DRAWN_TIMEOUT })
            .should('have.length.gte', 10);
    });

    it('banner de encerramento aparece após o jogo completo', () => {
        cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
            .should('be.visible');
    });

    it('histórico de partida acessível após encerramento', () => {
        cy.get(
            '[data-testid="gr-history-link"], [data-testid="gr-ended-overlay"] [data-testid="gr-view-history"]',
            { timeout: DEFAULT_TIMEOUT },
        ).should('exist');
    });
});

export {};
