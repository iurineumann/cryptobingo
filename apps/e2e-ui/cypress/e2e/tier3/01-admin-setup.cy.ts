// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/01-admin-setup.cy.ts
// Pré-requisito para os specs seguintes: cria gametype e sala ativa on-chain.
// Deve ser o primeiro spec a rodar no Tier 3 (numeração garante a ordem).
//
// Auth: cy.realDevLogin('admin') — JWT real do api-gateway, sem intercepts.
// Efeitos persistem na chain local entre specs (estado compartilhado real).

describe('Admin · Setup on-chain — gametype + sala (Tier 3 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;

    const gametypeName = `GT-T3-${Date.now() % 100000}`;
    const roomId       = String(800 + (Date.now() % 99));

    before(() => {
        cy.realDevLogin('admin');
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('include', '/admin');
    });

    // ── Gametype ──────────────────────────────────────────────────────────────

    describe('Criar gametype', () => {
        beforeEach(() => {
            cy.get('[data-testid="admin-nav-gametypes"]', { timeout: DEFAULT_TIMEOUT }).click();
        });

        it('cria gametype on-chain e aparece na lista', () => {
            cy.get('[data-testid="gt-create"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.get('[data-testid="gt-field-name"]').clear().type(gametypeName);
            cy.get('[data-testid="gt-field-base_multiplier"]').then(($el) => {
                if ($el.length) cy.wrap($el).clear().type('100');
            });
            cy.get('[data-testid="gt-submit"]').should('not.be.disabled').click();
            cy.get('[data-testid="gt-toast-success"], [data-testid="gametypes-toast-success"]',
                { timeout: DEFAULT_TIMEOUT }).should('exist');
            cy.contains(`[data-testid^="gt-item-"]`, gametypeName, { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
            // Persiste o nome para specs seguintes via Cypress.env
            Cypress.env('t3_gametype_name', gametypeName);
        });
    });

    // ── Sala ─────────────────────────────────────────────────────────────────

    describe('Criar e ativar sala', () => {
        beforeEach(() => {
            cy.get('[data-testid="admin-nav-rooms"]', { timeout: DEFAULT_TIMEOUT }).click();
        });

        it('cria sala com o gametype criado acima', () => {
            cy.get('[data-testid="rooms-new"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.get('[data-testid="rooms-field-room_id"]').clear().type(roomId);
            cy.get('[data-testid="rooms-field-name"]').clear().type(`Sala T3 ${roomId}`);
            cy.get('[data-testid="rooms-field-description"]').clear().type('Criada pelo E2E Tier 3');
            cy.get('[data-testid="rooms-field-price_min"]').clear().type('1.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_max"]').clear().type('100.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_default"]').clear().type('10.0000 BINGO');
            // Seleciona o gametype recém-criado (ou o primeiro disponível como fallback).
            cy.get('[data-testid="rooms-field-gametype_id"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="rooms-field-gametype_id"]').select($opt.val() as string);
                });
            cy.get('[data-testid="rooms-create"]').should('not.be.disabled').click();
            cy.get('[data-testid="rooms-toast-success"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
            cy.get(`[data-testid="room-card-${roomId}"]`, { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
            Cypress.env('t3_room_id', roomId);
        });

        it('ativa a sala para que o worker crie jogos nela', () => {
            // O botão de ativar fica no card da sala recém-criada.
            cy.get(`[data-testid="room-card-${roomId}"]`, { timeout: DEFAULT_TIMEOUT })
                .find('[data-testid^="rooms-activate-"]')
                .should('not.be.disabled')
                .click();
            cy.get('[data-testid="rooms-toast-success"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
            // Status da sala deve refletir 'active' após a ativação.
            cy.get(`[data-testid="room-card-${roomId}"]`)
                .should('contain.text', 'active');
        });
    });
});

export {};
