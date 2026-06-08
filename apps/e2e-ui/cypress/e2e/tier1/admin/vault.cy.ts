// apps/e2e-ui/cypress/e2e/tier1/admin/vault.cy.ts
// Tier 1 — CRÍTICO: jornada do admin no painel de vault/drops (ADR-011, ADR-017).
//
// Cobre:
//   - Navegar entre abas vault-tab-{deposits,allocations,allocate};
//   - Listar deposit-card-{id} e alloc-card-{id};
//   - Preencher form vault-field-* e submeter vault-allocate (stub POST /vault/allocate);
//   - Ações vault-deallocate-{id} e vault-reclaim-{id} (stubs).
//
// Stubs: cenário admin-vault (commands.ts) intercepta GET /vault/deposits,
// GET /vault/allocations* e POST /vault/allocate.
// vault-deallocate e vault-reclaim são adicionados inline.

describe('Admin · Vault', () => {
    beforeEach(() => {
        // Deallocate e reclaim não estão no cenário admin-vault — adicionamos inline.
        // O endpoint real usa POST /vault/deallocate e POST /vault/reclaim (services/api.ts).
        cy.intercept('POST', '**/api/v1/vault/deallocate', { fixture: 'tx-result.json' }).as('deallocate');
        cy.intercept('POST', '**/api/v1/vault/reclaim',    { fixture: 'tx-result.json' }).as('reclaim');

        cy.devLogin('admin', 'admin-vault');
        cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

        cy.get('[data-testid="admin-nav-vault"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/vault');
    });

    describe('Navegação por abas', () => {
        it('aba deposits é a ativa por padrão', () => {
            cy.get('[data-testid="vault-tab-deposits"]').should('be.visible');
        });

        it('clicar em vault-tab-allocations exibe alocações', () => {
            cy.get('[data-testid="vault-tab-allocations"]').click();
            // alloc-card-1 da fixture allocations.json
            cy.get('[data-testid="alloc-card-1"]').should('be.visible');
        });

        it('clicar em vault-tab-allocate exibe o formulário de nova alocação', () => {
            cy.get('[data-testid="vault-tab-allocate"]').click();
            // Formulário com campos vault-field-*
            cy.get('[data-testid="vault-field-deposit_id"]').should('be.visible');
            cy.get('[data-testid="vault-field-room_id"]').should('be.visible');
            cy.get('[data-testid="vault-field-qty_per_drop"]').should('be.visible');
            cy.get('[data-testid="vault-field-drop_chance_bps"]').should('be.visible');
        });
    });

    describe('Listagem de depósitos', () => {
        it('renderiza deposit-card-1 da fixture deposits.json', () => {
            // Aba deposits é padrão
            cy.get('[data-testid="deposit-card-1"]').should('be.visible');
        });

        it('deposit-card-1 exibe botão vault-reclaim-1', () => {
            cy.get('[data-testid="vault-reclaim-1"]').should('be.visible');
        });
    });

    describe('Listagem de alocações', () => {
        beforeEach(() => {
            cy.get('[data-testid="vault-tab-allocations"]').click();
        });

        it('renderiza alloc-card-1 da fixture allocations.json', () => {
            cy.get('[data-testid="alloc-card-1"]').should('be.visible');
        });

        it('alloc-card-1 exibe botão vault-deallocate-1 (status active)', () => {
            // allocations.json: status = active → botão deallocate visível
            cy.get('[data-testid="vault-deallocate-1"]').should('be.visible');
        });
    });

    describe('Alocar novo depósito', () => {
        beforeEach(() => {
            cy.get('[data-testid="vault-tab-allocate"]').click();
        });

        it('preencher form e submeter chama POST /vault/allocate', () => {
            cy.get('[data-testid="vault-field-deposit_id"]').clear().type('1');
            cy.get('[data-testid="vault-field-room_id"]').clear().type('1');
            cy.get('[data-testid="vault-field-qty_per_drop"]').clear().type('10.0000 BINGO');
            cy.get('[data-testid="vault-field-drop_chance_bps"]').clear().type('500');

            cy.get('[data-testid="vault-allocate"]').click();
            cy.wait('@allocate');
        });

        it('vault-allocate fica desabilitado enquanto submitting', () => {
            // Intercept com delay para capturar estado intermediário
            cy.intercept('POST', '**/api/v1/vault/allocate', (req) => {
                req.reply({ delay: 200, fixture: 'tx-result.json' });
            }).as('allocateDelayed');

            cy.get('[data-testid="vault-field-deposit_id"]').clear().type('1');
            cy.get('[data-testid="vault-field-room_id"]').clear().type('1');

            cy.get('[data-testid="vault-allocate"]').click();
            cy.get('[data-testid="vault-allocate"]').should('be.disabled');
            cy.wait('@allocateDelayed');
        });
    });

    describe('Desalocar e reclamar', () => {
        it('vault-deallocate-1 chama POST /vault/deallocate ao confirmar', () => {
            cy.get('[data-testid="vault-tab-allocations"]').click();
            cy.get('[data-testid="alloc-card-1"]').should('be.visible');

            // VaultAdmin usa window.confirm — stub para retornar true
            cy.window().then(win => cy.stub(win, 'confirm').returns(true));
            cy.get('[data-testid="vault-deallocate-1"]').click();

            cy.wait('@deallocate');
        });

        it('vault-reclaim-1 chama POST /vault/reclaim ao confirmar', () => {
            cy.get('[data-testid="deposit-card-1"]').should('be.visible');

            cy.window().then(win => cy.stub(win, 'confirm').returns(true));
            cy.get('[data-testid="vault-reclaim-1"]').click();

            cy.wait('@reclaim');
        });
    });
});

export {};
