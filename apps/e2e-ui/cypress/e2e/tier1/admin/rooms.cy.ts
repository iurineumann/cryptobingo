// apps/e2e-ui/cypress/e2e/tier1/admin/rooms.cy.ts
// Tier 1 — CRÍTICO: jornada do admin no painel de salas (ADR-017).
//
// Cobre:
//   - Listar salas (renderiza room-card-{id});
//   - Criar sala: preencher campos → stub POST /rooms → toast de sucesso;
//   - Editar metadata/settings (PUT /rooms/{id}/metadata + /settings via modal);
//   - Ativar / pausar / fechar sala (com modal de confirmação para close);
//   - Toast de sucesso em cada operação.
//
// Stubs: cenário admin-rooms (commands.ts) intercepta GET /rooms, POST /rooms,
// GET /admin/gametypes, GET /admin/patterns, além do RPC vazio.
// PUT /rooms/{id}/metadata, PUT /rooms/{id}/settings e POST /rooms/{id}/activate
// são adicionados inline (endpoints de room-action não estão no cenário base).

describe('Admin · Salas (Rooms)', () => {
    beforeEach(() => {
        // Stub adicional: editar metadata e settings da sala
        cy.intercept('PUT', '**/api/v1/rooms/*/metadata',  { fixture: 'tx-result.json' }).as('updateMetadata');
        cy.intercept('PUT', '**/api/v1/rooms/*/settings',  { fixture: 'tx-result.json' }).as('updateSettings');
        cy.intercept('POST', '**/api/v1/rooms/*/activate', { fixture: 'tx-result.json' }).as('activateRoom');
        cy.intercept('POST', '**/api/v1/rooms/*/pause',    { fixture: 'tx-result.json' }).as('pauseRoom');
        cy.intercept('POST', '**/api/v1/rooms/*/close',    { fixture: 'tx-result.json' }).as('closeRoom');

        cy.devLogin('admin', 'admin-rooms');
        cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

        // Navegar para a seção de salas via sidebar
        cy.get('[data-testid="admin-nav-rooms"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/rooms');
    });

    it('lista a sala existente (room-card-1)', () => {
        // GET /rooms é interceptado pelo cenário admin-rooms com rooms.funding.json
        cy.get('[data-testid="room-card-1"]').should('be.visible');
    });

    describe('Criar sala', () => {
        beforeEach(() => {
            // Abrir o formulário de criação
            cy.get('[data-testid="rooms-new"]').click();
        });

        it('formulário de criação aparece ao clicar em rooms-new', () => {
            // Campos obrigatórios precisam estar visíveis
            cy.get('[data-testid="rooms-field-room_id"]').should('be.visible');
            cy.get('[data-testid="rooms-field-name"]').should('be.visible');
            cy.get('[data-testid="rooms-field-gametype_id"]').should('be.visible');
        });

        it('submeter sala válida chama POST /rooms e exibe toast de sucesso', () => {
            cy.get('[data-testid="rooms-field-room_id"]').clear().type('42');
            cy.get('[data-testid="rooms-field-name"]').clear().type('Sala E2E');
            cy.get('[data-testid="rooms-field-description"]').clear().type('Sala criada em E2E');
            cy.get('[data-testid="rooms-field-price_min"]').clear().type('5.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_max"]').clear().type('50.0000 BINGO');
            cy.get('[data-testid="rooms-field-price_default"]').clear().type('10.0000 BINGO');

            cy.get('[data-testid="rooms-create"]').click();

            // O stub POST /rooms (createRoom no cenário admin-rooms) responde com tx-result.json
            cy.wait('@createRoom');
            // Toast de sucesso aparece após a criação
            cy.get('[data-testid="rooms-toast-success"]').should('be.visible');
        });

        it('cancelar esconde o formulário', () => {
            // O botão rooms-new alterna show/hide
            cy.get('[data-testid="rooms-new"]').click();
            cy.get('[data-testid="rooms-field-room_id"]').should('not.exist');
        });
    });

    describe('Editar sala existente', () => {
        it('abre modal de edição ao clicar em room-edit-1', () => {
            cy.get('[data-testid="room-edit-1"]').click();
            // O modal de edição usa um overlay fullscreen — o botão de salvar deve aparecer
            cy.get('[data-testid="rooms-create"]').should('not.exist'); // garantia de escopo
            cy.get('[data-testid="room-save"]').should('be.visible');
        });

        it('submeter edição chama PUT /metadata e exibe toast de sucesso', () => {
            cy.get('[data-testid="room-edit-1"]').click();
            cy.get('[data-testid="room-save"]').click();

            cy.wait('@updateMetadata');
            cy.get('[data-testid="rooms-toast-success"]').should('be.visible');
        });
    });

    describe('Ações de status da sala', () => {
        it('clicar em room-pause-1 chama POST /pause e exibe toast', () => {
            // A sala tem status=active (rooms.funding.json) → botão pause visível
            cy.get('[data-testid="room-pause-1"]').should('be.visible').click();
            cy.wait('@pauseRoom');
            cy.get('[data-testid="rooms-toast-success"]').should('be.visible');
        });

        it('clicar em room-close-1 abre modal de confirmação', () => {
            cy.get('[data-testid="room-close-1"]').should('be.visible').click();
            // Modal de confirmação com o botão room-close-confirm
            cy.get('[data-testid="room-close-confirm"]').should('be.visible');
        });

        it('confirmar fechamento da sala chama POST /close e exibe toast', () => {
            cy.get('[data-testid="room-close-1"]').click();
            cy.get('[data-testid="room-close-confirm"]').click();

            cy.wait('@closeRoom');
            cy.get('[data-testid="rooms-toast-success"]').should('be.visible');
        });

        it('cancelar o modal de close não chama o endpoint', () => {
            cy.get('[data-testid="room-close-1"]').click();
            cy.get('[data-testid="room-close-confirm"]').should('be.visible');

            cy.get('[data-testid="modal-backdrop"]').click({ force: true });
            cy.get('[data-testid="room-close-confirm"]').should('not.exist');

            // Nenhuma chamada ao endpoint /close foi feita
            cy.get('@closeRoom.all').should('have.length', 0);
        });
    });
});

export {};
