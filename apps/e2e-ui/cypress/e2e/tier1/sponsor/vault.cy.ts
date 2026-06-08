// apps/e2e-ui/cypress/e2e/tier1/sponsor/vault.cy.ts
// Tier 1 — jornada do SPONSOR no painel de vault/drops (ADR-017, ADR-011).
//
// Cobre:
//   - exibição da aba de depósitos do sponsor;
//   - abertura do formulário de alocação (botão "Alocar");
//   - seleção de sala via sponsor-vault-room-select;
//   - preenchimento de campos sponsor-vault-field-{deposit_id,quantity_per_drop,drop_chance_bps};
//   - submissão via sponsor-vault-allocate (stub POST /vault/allocate);
//   - validação de confirmação (toast de sucesso com transaction_id).
//
// Cenário: 'sponsor-rooms' (commands.ts) — stub GET /vault/deposits + /vault/allocations
//   + GET /sponsor/rooms + POST /vault/allocate (tx-result.json).
// Seletores APENAS por data-testid.
// Auth via cy.devLogin('sponsor').

describe('Sponsor · Vault — alocação de drops', () => {
    beforeEach(() => {
        cy.devLogin('sponsor', 'sponsor-rooms');

        cy.location('pathname', { timeout: 15_000 }).should('eq', '/lobby');
        // Navega SPA para /sponsor/vault sem recarregar (mantém sessão React).
        cy.window().then(win => {
            win.history.pushState({}, '', '/sponsor/vault');
            win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
    });

    it('exibe a aba de depósitos e a tab deposits está ativa', () => {
        // O SponsorVault carrega depósitos do GET /vault/deposits (stubado com deposits.json).
        // A tab ativa (deposits) deve existir e o loading deve terminar.
        cy.get('[data-testid="sponsor-vault-tab-deposits"]', { timeout: 15_000 }).should('exist');
        // O spinner some quando o loading termina (component usa 'loading' state).
        cy.get('[data-testid="sponsor-vault-tab-deposits"]').should('not.have.class', 'cb-btn-outline');
    });

    it('abre o formulário de alocação ao clicar em "Alocar"', () => {
        // O botão de alocação existe na barra de abas; só habilitado quando rooms > 0.
        // A fixture sponsor-rooms.json retorna 1 sala, então o botão deve estar habilitado.
        cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: 15_000 }).should('not.be.disabled').click();

        // O form de alocação deve aparecer com os campos instrumentados.
        cy.get('[data-testid="sponsor-vault-field-deposit_id"]').should('be.visible');
        cy.get('[data-testid="sponsor-vault-room-select"]').should('be.visible');
        cy.get('[data-testid="sponsor-vault-field-quantity_per_drop"]').should('be.visible');
        cy.get('[data-testid="sponsor-vault-field-drop_chance_bps"]').should('be.visible');
        cy.get('[data-testid="sponsor-vault-allocate"]').should('be.visible');
    });

    it('preenche o formulário e submete a alocação (stub POST /vault/allocate)', () => {
        // Abre o form.
        cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: 15_000 }).should('not.be.disabled').click();

        // Seleciona o depósito #1 (status active — aparece no dropdown).
        cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select('1');

        // Seleciona a sala #7 (da fixture sponsor-rooms.json).
        cy.get('[data-testid="sponsor-vault-room-select"]').select('7');

        // Preenche quantidade por drop.
        cy.get('[data-testid="sponsor-vault-field-quantity_per_drop"]')
            .clear()
            .type('10.0000 BINGO');

        // Submete (botão habilitado: deposit_id e room_id preenchidos).
        cy.get('[data-testid="sponsor-vault-allocate"]').should('not.be.disabled').click();

        // O POST /vault/allocate deve ser chamado com os dados corretos.
        cy.wait('@allocate').its('request.body').should('deep.include', {
            deposit_id:       '1',
            room_id:          '7',
            quantity_per_drop: '10.0000 BINGO',
        });
    });

    it('exibe confirmação (toast/alerta) com transaction_id após alocação', () => {
        cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: 15_000 }).should('not.be.disabled').click();

        cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select('1');
        cy.get('[data-testid="sponsor-vault-room-select"]').select('7');
        cy.get('[data-testid="sponsor-vault-allocate"]').click();

        cy.wait('@allocate');

        // Após sucesso o componente exibe o transaction_id da tx-result.json.
        cy.contains('e2e000000', { timeout: 10_000 }).should('be.visible');
    });

    it('botão de submissão fica desabilitado sem deposit_id ou room_id', () => {
        cy.get('[data-testid="sponsor-vault-allocate-toggle"]', { timeout: 15_000 }).should('not.be.disabled').click();

        // Nenhum campo preenchido → desabilitado.
        cy.get('[data-testid="sponsor-vault-allocate"]').should('be.disabled');

        // Apenas deposit_id preenchido → ainda desabilitado.
        cy.get('[data-testid="sponsor-vault-field-deposit_id"]').select('1');
        cy.get('[data-testid="sponsor-vault-allocate"]').should('be.disabled');

        // Ambos preenchidos → habilitado.
        cy.get('[data-testid="sponsor-vault-room-select"]').select('7');
        cy.get('[data-testid="sponsor-vault-allocate"]').should('not.be.disabled');
    });

    it('navega para a aba de alocações via tab de allocations', () => {
        // Clica na aba de allocations (data-testid instrumentado no componente).
        cy.get('[data-testid="sponsor-vault-tab-allocations"]', { timeout: 15_000 }).click();

        // A alloc #1 da fixture allocations.json deve aparecer (contém "Alloc #1").
        cy.contains('Alloc #1', { timeout: 10_000 }).should('be.visible');
    });
});

export {};
