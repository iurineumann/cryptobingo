// apps/e2e-ui/cypress/e2e/tier1/sponsor/rooms.cy.ts
// Tier 1 — jornada do SPONSOR no painel de salas (ADR-017, ADR-011).
//
// Cobre:
//   - listagem de salas do sponsor (data-testid sponsor-room-card-{id});
//   - verificação do badge de status (sponsor-room-badge-{id});
//   - edição de metadata via modal inline (sponsor-room-edit-{id});
//   - preenchimento de campos e submissão (stub PUT /sponsor/rooms/:id/metadata);
//   - RBAC: player em /sponsor/rooms → /lobby.
//
// Cenário: 'sponsor-rooms' (commands.ts) — stub GET /sponsor/rooms + vault.
// Seletores APENAS por data-testid (i18n pt/en/zh é frágil).
// Auth via cy.devLogin('sponsor') — JWT gravado pelo app, não fabricado.

describe('Sponsor · Painel de Salas', () => {
    // A fixture sponsor-rooms.json tem uma sala de ID "7".
    const ROOM_ID = '7';

    beforeEach(() => {
        // Stub de PUT metadata — resposta genérica coerente com RoomMetadata.
        cy.intercept('PUT', '**/api/v1/rooms/*/metadata', {
            statusCode: 200,
            body: {
                room_id:              ROOM_ID,
                name:                 'Sala do Sponsor',
                description:          'Sala patrocinada (E2E sponsor).',
                auto_start_delay_sec: 60,
                chat_enabled:         true,
                drops:                [],
            },
        }).as('updateMetadata');

        cy.devLogin('sponsor', 'sponsor-rooms');

        // Após login, navega para o painel sponsor via SPA (preserva sessão).
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        cy.window().then(win => {
            win.history.pushState({}, '', '/sponsor/rooms');
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
    });

    it('lista o card da sala do sponsor', () => {
        cy.get(`[data-testid="sponsor-room-card-${ROOM_ID}"]`, { timeout: 15_000 })
            .should('exist');
    });

    it('exibe o badge de status da sala', () => {
        cy.get(`[data-testid="sponsor-room-badge-${ROOM_ID}"]`, { timeout: 15_000 })
            .should('exist')
            // O badge contém o status da sala — "active" na fixture.
            .and('contain.text', 'active');
    });

    it('abre o formulário de edição ao clicar em editar', () => {
        cy.get(`[data-testid="sponsor-room-card-${ROOM_ID}"]`, { timeout: 15_000 })
            .should('exist');
        cy.get(`[data-testid="sponsor-room-edit-${ROOM_ID}"]`).click();

        // Campos de metadata devem aparecer após abrir a edição inline.
        cy.get('[data-testid="sponsor-room-field-name"]').should('be.visible');
        cy.get('[data-testid="sponsor-room-field-description"]').should('be.visible');
        cy.get('[data-testid="sponsor-room-field-auto_start_delay"]').should('be.visible');
        cy.get('[data-testid="sponsor-room-field-chat_enabled"]').should('be.visible');
    });

    it('preenche os campos de edição e salva (stub PUT metadata)', () => {
        cy.get(`[data-testid="sponsor-room-card-${ROOM_ID}"]`, { timeout: 15_000 })
            .should('exist');
        cy.get(`[data-testid="sponsor-room-edit-${ROOM_ID}"]`).click();

        // Edita nome e descrição — usa .clear() para garantir substituição completa.
        cy.get('[data-testid="sponsor-room-field-name"]')
            .clear()
            .type('Nova Sala Sponsor');
        cy.get('[data-testid="sponsor-room-field-description"]')
            .clear()
            .type('Descrição atualizada via E2E.');

        // Altera delay (input number).
        cy.get('[data-testid="sponsor-room-field-auto_start_delay"]')
            .clear()
            .type('45');

        // Salva via botão primário.
        cy.get('[data-testid="sponsor-room-save"]').click();

        // O PUT deve ser chamado com os dados corretos.
        cy.wait('@updateMetadata').its('request.body').should('deep.include', {
            name:                'Nova Sala Sponsor',
            description:         'Descrição atualizada via E2E.',
            auto_start_delay_sec: 45,
        });
    });

    it('botão salvar fica desabilitado durante o envio (saving state)', () => {
        // Atrasa a resposta do PUT para capturar o estado "saving".
        cy.intercept('PUT', '**/api/v1/rooms/*/metadata', (req) => {
            req.on('response', (res) => { res.setDelay(800); });
            req.reply({
                statusCode: 200,
                body: {
                    room_id:              ROOM_ID,
                    name:                 'Sala do Sponsor',
                    description:          '',
                    auto_start_delay_sec: 60,
                    chat_enabled:         true,
                    drops:                [],
                },
            });
        }).as('updateMetadataSlow');

        cy.get(`[data-testid="sponsor-room-edit-${ROOM_ID}"]`, { timeout: 15_000 }).click();
        cy.get('[data-testid="sponsor-room-save"]').click();

        // Durante o delay o botão deve estar desabilitado (saving=true no componente).
        cy.get('[data-testid="sponsor-room-save"]').should('be.disabled');
        cy.wait('@updateMetadataSlow');
    });

    it('cancela a edição sem chamar o PUT', () => {
        cy.get(`[data-testid="sponsor-room-edit-${ROOM_ID}"]`, { timeout: 15_000 }).click();
        cy.get('[data-testid="sponsor-room-field-name"]').should('be.visible');

        // Clica de novo no edit-button (toggle cancel) → fecha o formulário.
        cy.get(`[data-testid="sponsor-room-edit-${ROOM_ID}"]`).click();
        cy.get('[data-testid="sponsor-room-field-name"]').should('not.exist');

        // Não deve ter chamado o PUT.
        cy.get('@updateMetadata.all').should('have.length', 0);
    });
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

describe('Sponsor · RBAC (acesso indevido como player)', () => {
    it('player em /sponsor/rooms é redirecionado para /lobby', () => {
        cy.devLogin('player', 'funding');
        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');

        // SponsorGuard (App.tsx): role player → Navigate to /lobby.
        cy.window().then(win => {
            win.history.pushState({}, '', '/sponsor/rooms');
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/lobby');
    });
});

export {};
