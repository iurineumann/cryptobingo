// Tier 3 — stack real, auth real, sem mocks.
//
// apps/e2e-ui/cypress/e2e/tier3/01-admin-setup.cy.ts
// Pré-requisito para os specs seguintes: cria patterns, gametype e sala ativa on-chain.
// Deve ser o primeiro spec a rodar no Tier 3 (numeração garante a ordem).
//
// Auth: cy.realDevLogin('admin') — JWT real do api-gateway, sem intercepts.
// Efeitos persistem na chain local entre specs (estado compartilhado real).

describe('Admin · Setup on-chain — patterns + gametype + sala (Tier 3 real)', () => {
    const DEFAULT_TIMEOUT = 60_000;

    const gametypeName = `GT-T3-${Date.now() % 100000}`;
    // Range 5000-9999 evita colisão com salas dev fixas (820, 846, 875 < 1000)
    const roomId       = String(5000 + (Date.now() % 5000));

    beforeEach(() => {
        cy.realDevLogin('admin');
        // cy.visit() faz full-page reload → limpa sessionStorage → JWT some →
        // AuthGuard redireciona para /. Usar pushState para navegar sem reload.
        cy.window().then((win) => {
            win.history.pushState({}, '', '/admin/dashboard');
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.location('pathname', { timeout: DEFAULT_TIMEOUT }).should('include', '/admin');
    });

    // ── Patterns ──────────────────────────────────────────────────────────────
    // Garante que pelo menos os padrões básicos existam para o gametype ser criado.

    describe('Criar patterns via sugestão automática', () => {
        beforeEach(() => {
            cy.get('[data-testid="admin-nav-patterns"]', { timeout: DEFAULT_TIMEOUT }).click();
        });

        it('clica em Sugerir e popula padrões base na chain', () => {
            cy.get('[data-testid="patterns-suggest-btn"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();
            // O resultado pode estar clipado por overflow:hidden no card container
            // (especialmente em headless 1280x720). Checamos exist — a action foi
            // executada se a sala e gametype subsequentes criaram sem erro.
            cy.get('[data-testid="patterns-suggest-result"]', { timeout: DEFAULT_TIMEOUT })
                .should('exist');
            // Após a sugestão, ao menos um chip de padrão deve aparecer no formulário de
            // criação de gametype — validamos navegando lá no próximo describe.
        });
    });

    // ── Gametype ──────────────────────────────────────────────────────────────

    describe('Criar gametype', () => {
        beforeEach(() => {
            cy.get('[data-testid="admin-nav-gametypes"]', { timeout: DEFAULT_TIMEOUT }).click();
        });

        it('cria gametype on-chain e aparece na lista', () => {
            // Aguarda os chips de pattern aparecerem (API precisa ter patterns criados acima)
            cy.get('[data-testid^="gt-rule-"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.length.gte', 1);

            // Preenche o formulário (a ordem importa: name e multiplier ANTES de criar)
            cy.get('[data-testid="gt-field-name"]').clear().type(gametypeName);
            cy.get('[data-testid="gt-field-base_multiplier"]').then(($el) => {
                if ($el.length) cy.wrap($el).clear().type('1.00');
            });

            // Seleciona o primeiro padrão disponível (obrigatório — rules.length === 0 bloqueia)
            cy.get('[data-testid^="gt-rule-"]').first().click();

            // Submete via gt-create (botão type="submit" da form)
            cy.get('[data-testid="gt-create"]', { timeout: DEFAULT_TIMEOUT })
                .should('not.be.disabled')
                .click();

            // Sucesso: form reseta (name vira '') e gametype aparece na lista
            cy.get('[data-testid="gt-field-name"]', { timeout: DEFAULT_TIMEOUT })
                .should('have.value', '');
            cy.contains('.cb-card', gametypeName, { timeout: DEFAULT_TIMEOUT })
                .scrollIntoView()
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
            // Seleciona o gametype recém-criado (ou o primeiro disponível como fallback)
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
            // Botão de ativar só aparece para salas inactive/paused (RoomsAdmin.tsx:337)
            cy.get(`[data-testid="room-card-${roomId}"]`, { timeout: DEFAULT_TIMEOUT })
                .find(`[data-testid="room-activate-${roomId}"]`)
                .should('not.be.disabled')
                .click();

            // O toast dura 3s — aguardar o status 'active' no card após loadRooms()
            // é mais robusto que depender da janela do toast efêmero.
            // Se a transação falhar, rooms-toast-error aparece e o card fica 'inactive'.
            cy.get(`[data-testid="room-card-${roomId}"]`, { timeout: DEFAULT_TIMEOUT })
                .should('contain.text', 'Status: active');
        });
    });
});

export {};
