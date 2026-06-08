// Tier 2 — exige stack completo (init_dev_env.sh + vite dev)
//
// apps/e2e-ui/cypress/e2e/tier2/admin-onchain.cy.ts
// SMOKE real: admin cria sala e gametype sem stub, validando integração on-chain.
//
// Cobre:
//   1. Admin cria sala via RoomsAdmin (POST /rooms real → createroom on-chain) e
//      confirma que a nova sala aparece como room-card-{id} no painel.
//   2. Admin cria gametype via GametypesAdmin (POST /admin/gametypes real →
//      upsertgametype on-chain) e confirma visibilidade na lista.
//   3. Admin edita gametype existente (PUT /admin/gametypes/{id} real) e confirma
//      que as alterações são refletidas no painel.
//
// O que NÃO está em escopo aqui (ver ADR-017 §5):
//   - session.transact() direto de NftAdmin/TokenAdmin (atomicassets/bingo.token).
//
// Auth: cy.devLogin('admin') — sem stubBackend.
// Sem cy.wait(número) — retry-ability com timeout explícito nos asserts lentos.

describe('Admin · SMOKE on-chain — criação de sala e gametype (Tier 2 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;

    // IDs únicos para evitar colisão com dados existentes (sufixo baseado em timestamp).
    // Cypress.env pode sobrescrever via --env roomId=XX se necessário.
    const roomId       = Cypress.env('roomId')     ?? String(900 + (Date.now() % 99));
    const gametypeName = Cypress.env('gtName')     ?? `GT-E2E-${Date.now() % 10000}`;

    before(() => {
        // dev-login real como admin — sem stubBackend.
        cy.devLogin('admin');
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('include', '/admin');
    });

    // ── Parte 1: Criar sala ───────────────────────────────────────────────────

    describe('Criar sala via RoomsAdmin', () => {
        beforeEach(() => {
            // Garante que estamos na tela de salas antes de cada teste.
            cy.get('[data-testid="admin-nav-rooms"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('eq', '/admin/rooms');
        });

        it('abre o formulário de criação ao clicar em rooms-new', () => {
            cy.get('[data-testid="rooms-new"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.get('[data-testid="rooms-field-room_id"]').should('be.visible');
            cy.get('[data-testid="rooms-field-name"]').should('be.visible');
            cy.get('[data-testid="rooms-field-gametype_id"]').should('be.visible');
        });

        it('cria a sala com dados reais (POST /rooms on-chain) e exibe room-card', () => {
            cy.get('[data-testid="rooms-new"]', { timeout: DEFAULT_TIMEOUT }).click();

            // Preenche os campos obrigatórios.
            cy.get('[data-testid="rooms-field-room_id"]').clear().type(roomId);
            cy.get('[data-testid="rooms-field-name"]').clear().type(`Sala E2E Tier2 ${roomId}`);
            cy.get('[data-testid="rooms-field-description"]').clear().type('Criada pelo E2E Tier 2 real');
            cy.get('[data-testid="rooms-field-price_min"]').clear().type('1.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_max"]').clear().type('100.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_default"]').clear().type('10.0000 BINGO');

            // Seleciona o primeiro gametype disponível (criado pelo init_dev_env.sh).
            cy.get('[data-testid="rooms-field-gametype_id"]')
                .find('option:not([value=""])')
                .first()
                .then(($opt) => {
                    cy.get('[data-testid="rooms-field-gametype_id"]').select($opt.val() as string);
                });

            // Submete o formulário (POST /rooms real → createroom on-chain).
            cy.get('[data-testid="rooms-create"]').should('not.be.disabled').click();

            // Confirmação: toast de sucesso.
            cy.get('[data-testid="rooms-toast-success"]', { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');

            // A nova sala deve aparecer no painel como room-card-{roomId}.
            cy.get(`[data-testid="room-card-${roomId}"]`, { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
        });
    });

    // ── Parte 2: Criar gametype ───────────────────────────────────────────────

    describe('Criar gametype via GametypesAdmin', () => {
        beforeEach(() => {
            cy.get('[data-testid="admin-nav-gametypes"]', { timeout: DEFAULT_TIMEOUT }).click();
            cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('include', '/admin/gametypes');
        });

        it('abre o formulário de criação ao clicar em gt-create', () => {
            cy.get('[data-testid="gt-create"]', { timeout: DEFAULT_TIMEOUT }).click();
            // O formulário de gametype deve exibir pelo menos o campo de nome.
            cy.get('[data-testid="gt-field-name"]').should('be.visible');
        });

        it('cria o gametype real (POST /admin/gametypes on-chain) e exibe na lista', () => {
            cy.get('[data-testid="gt-create"]', { timeout: DEFAULT_TIMEOUT }).click();

            // Preenche o nome do gametype.
            cy.get('[data-testid="gt-field-name"]').clear().type(gametypeName);

            // Campos numéricos obrigatórios (valores mínimos válidos).
            cy.get('[data-testid="gt-field-base_multiplier"]').then(($el) => {
                if ($el.length) cy.wrap($el).clear().type('100');
            });

            // Submete o formulário.
            cy.get('[data-testid="gt-submit"]').should('not.be.disabled').click();

            // Confirmação: toast de sucesso.
            cy.get('[data-testid="gt-toast-success"], [data-testid="gametypes-toast-success"]',
                { timeout: DEFAULT_TIMEOUT })
                .should('exist');

            // O novo gametype aparece na lista.
            cy.contains(`[data-testid^="gt-item-"]`, gametypeName, { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
        });

        it('edita o gametype criado e confirma atualização na lista', () => {
            // Localiza o gametype pelo nome e clica em editar.
            cy.contains(`[data-testid^="gt-item-"]`, gametypeName, { timeout: DEFAULT_TIMEOUT })
                .closest('[data-testid^="gt-item-"]')
                .find('[data-testid^="gt-edit-"]')
                .click();

            // Altera o nome para confirmar a edição.
            const updatedName = `${gametypeName}-upd`;
            cy.get('[data-testid="gt-field-name"]').clear().type(updatedName);

            // Submete (PUT /admin/gametypes/{id} real → upsertgametype on-chain).
            cy.get('[data-testid="gt-submit"]').should('not.be.disabled').click();

            // Confirmação de sucesso.
            cy.get('[data-testid="gt-toast-success"], [data-testid="gametypes-toast-success"]',
                { timeout: DEFAULT_TIMEOUT })
                .should('exist');

            // Nome atualizado visível na lista.
            cy.contains(`[data-testid^="gt-item-"]`, updatedName, { timeout: DEFAULT_TIMEOUT })
                .should('be.visible');
        });
    });
});

export {};
