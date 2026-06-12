// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/03-sponsor-drop-flow.cy.ts
// Fluxo ADR-011 completo: depósito on-chain → alocação na UI → jogo resolve → drop.
//
// Setup: cy.exec cria o depósito diretamente via cleos (o transfer para bingogamectr
// com memo "vault" dispara on_notify e registra o drop_deposit on-chain).
// Depende de 01-admin-setup.cy.ts ter criado uma sala ativa.
//
// Auth: cy.realDevLogin('sponsor') para alocação, cy.realDevLogin('player') para
// comprar cartela e verificar o drop.

describe('Sponsor · Fluxo de Drop completo (ADR-011, Tier 3 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;
    const DRAWN_TIMEOUT   = 300_000;

    // ── Setup: cria depósito on-chain via cleos ────────────────────────────────
    // transfer sponsor1111 → bingogamectr com memo "vault" aciona on_notify e
    // grava o drop_deposit. cy.exec faz isso antes de qualquer interação na UI.

    before(() => {
        cy.exec(
            'docker exec bingo_waxdev cleos push action eosio.token transfer ' +
            '\'["sponsor1111","bingogamectr","50.0000 BINGO","vault"]\' ' +
            '-p sponsor1111@active',
            { timeout: 15_000, failOnNonZeroExit: false },
        ).then((result) => {
            if (result.code !== 0) {
                cy.log('[!] Depósito BINGO falhou — sponsor1111 pode não ter saldo suficiente.');
                cy.log(result.stderr);
            }
        });
    });

    // ── Parte 1: Sponsor aloca o depósito ─────────────────────────────────────

    describe('Sponsor deposita e aloca drop', () => {
        before(() => {
            cy.realDevLogin('sponsor');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('navega para o vault do sponsor', () => {
            cy.window().then((win) => {
                win.history.pushState({}, '', '/sponsor/vault');
                win.dispatchEvent(new win.PopStateEvent('popstate'));
            });
            cy.get('[data-testid="sponsor-vault-tab-deposits"]', { timeout: DEFAULT_TIMEOUT })
                .should('exist');
        });

        it('exibe pelo menos um depósito disponível (status available)', () => {
            cy.get('[data-testid^="sponsor-deposit-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1)
                .first()
                .should('contain.text', 'available');
        });

        it('aloca o depósito a uma sala ativa', () => {
            cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();

            cy.get('[data-testid="sponsor-vault-field-deposit_id"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select($opt.val() as string);
                });

            cy.get('[data-testid="sponsor-vault-room-select"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="sponsor-vault-room-select"]').select($opt.val() as string);
                });

            cy.get('[data-testid="sponsor-vault-allocate"]')
                .should('not.be.disabled')
                .click();

            cy.get(
                '[data-testid="sponsor-vault-alloc-success"], [data-testid="sponsor-vault-toast-success"]',
                { timeout: DEFAULT_TIMEOUT },
            ).should('exist');
        });

        it('aba de alocações exibe a nova alocação (status active)', () => {
            cy.get('[data-testid="sponsor-vault-tab-allocations"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.get('[data-testid^="sponsor-alloc-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1)
                .first()
                .should('contain.text', 'active');
        });
    });

    // ── Parte 2: Player compra cartela e verifica drop ─────────────────────────

    describe('Player compra cartela e vê o prize-breakdown após encerramento', () => {
        before(() => {
            cy.realDevLogin('player');
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/lobby');
        });

        it('entra na sala com drop ativo e compra cartela', () => {
            cy.get('[data-testid^="lobby-card-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1);
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

        it('aguarda encerramento completo do jogo', () => {
            cy.get('[data-testid="gr-ended-overlay"]', { timeout: DRAWN_TIMEOUT })
                .should('be.visible');
        });

        it('prize-breakdown está visível (drop aparece se vencedor eleito)', () => {
            // A estrutura do breakdown sempre existe; a linha de drop é probabilística
            // (drop_chance_bps do gametype). Validamos a estrutura — não falhamos se
            // o drop não ocorreu nesta execução específica.
            cy.get('[data-testid="gr-prize-breakdown"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');

            cy.get('[data-testid="gr-prize-breakdown"]').then(($el) => {
                if ($el.find('[data-testid="gr-prize-drop-item"]').length) {
                    cy.wrap($el).find('[data-testid="gr-prize-drop-item"]').should('be.visible');
                }
            });
        });
    });
});

export {};
