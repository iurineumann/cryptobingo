// apps/e2e-ui/cypress/e2e/tier1/admin/gametypes.cy.ts
// Tier 1 — CRÍTICO: jornada do admin no painel de gametypes (ADR-016, ADR-017).
//
// Cobre:
//   - Renderizar lista de gametypes existentes;
//   - Criar gametype: preencher nome, draw-mode dropdown, selecionar pattern chip
//     (gt-rule-{patternId}), peso do combo (gt-combo-*);
//   - Botão gt-suggest (stub POST /admin/calibrate-weights → fixture suggest-result);
//   - Salvar combos de gametype existente (gt-save-combos) após entrar em modo edição.
//
// Stubs: cenário admin-rooms (commands.ts) intercepta GET /admin/gametypes,
// GET /admin/patterns. Adicionamos inline simulate-weights e calibrate-weights.

describe('Admin · Gametypes', () => {
    beforeEach(() => {
        // gt-suggest usa dois endpoints:
        //   1. POST /admin/simulate-weights  (fase 1 — hit rates)
        //   2. POST /admin/calibrate-weights (fase 2 — calibração RTP)
        // Ambos são stubados para resultado determinístico.
        cy.intercept('POST', '**/api/v1/admin/simulate-weights', {
            body: {
                gametype_name: 'Bingo Padrão',
                simulations:   1000,
                pattern_stats: [
                    { name: 'ROW_1',  hit_count: 210, hit_rate: 0.21, weight: 100 },
                    { name: 'MASTER', hit_count: 12,  hit_rate: 0.012, weight: 2000 },
                ],
                rtp: 0.85, rtp_pct: '85%', ggr: 0.15, ggr_pct: '15%',
                total_wagered: 10000, total_paid_out: 8500, avg_payout_per_game: 850,
                avg_winners_per_game: 2, combo_stats: [], alerts: [], is_viable: true,
                duration_ms: 500, computed_at: new Date().toISOString(),
            },
        }).as('simulateWeights');

        cy.intercept('POST', '**/api/v1/admin/calibrate-weights', { fixture: 'suggest-result.json' }).as('calibrateWeights');

        // Metadados do gametype existente (para edição de combos)
        cy.intercept('GET', '**/api/v1/admin/gametypes/*/metadata', {
            body: { rules: [], combinations: [] },
        }).as('gametypeMetadata');
        cy.intercept('PUT', '**/api/v1/admin/gametypes/*/metadata', { fixture: 'tx-result.json' }).as('upsertMetadata');

        cy.devLogin('admin', 'admin-rooms');
        cy.location('pathname', { timeout: 15_000 }).should('include', '/admin');

        cy.get('[data-testid="admin-nav-gametypes"]').click();
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/admin/gametypes');
    });

    it('renderiza a lista de gametypes existentes', () => {
        // gametypes.json tem 1 gametype ("Bingo Padrão")
        cy.contains('Bingo Padrão').should('be.visible');
    });

    it('campos do formulário de criação são visíveis', () => {
        cy.get('[data-testid="gt-field-name"]').should('be.visible');
        cy.get('[data-testid="gt-field-base_multiplier"]').should('be.visible');
        cy.get('[data-testid="gt-draw-mode"]').should('be.visible');
    });

    describe('Seleção de draw-mode', () => {
        it('mudar draw-mode para fixed não oculta o formulário', () => {
            cy.get('[data-testid="gt-draw-mode"]').select('fixed');
            cy.get('[data-testid="gt-draw-mode"]').should('have.value', 'fixed');
        });

        it('draw-mode standard é o valor padrão', () => {
            cy.get('[data-testid="gt-draw-mode"]').should('have.value', 'standard');
        });
    });

    describe('Seleção de regras (pattern chips)', () => {
        it('gt-rule-{patternId} existe para cada padrão carregado', () => {
            // patterns.json tem 4 padrões: 1, 2, 10, 99
            cy.get('[data-testid="gt-rule-1"]').should('exist');
            cy.get('[data-testid="gt-rule-2"]').should('exist');
            cy.get('[data-testid="gt-rule-10"]').should('exist');
            cy.get('[data-testid="gt-rule-99"]').should('exist');
        });

        it('clicar em gt-rule-1 seleciona o padrão (habilita peso)', () => {
            cy.get('[data-testid="gt-rule-1"]').click();
            // Após seleção, o chip mostra input de peso
            cy.get('[data-testid="gt-rule-1"]').find('input[type="number"]').should('be.visible');
        });
    });

    describe('Editor de combinações', () => {
        beforeEach(() => {
            // Selecionar 2 padrões para habilitar o builder de combos
            cy.get('[data-testid="gt-rule-1"]').click();
            cy.get('[data-testid="gt-rule-2"]').click();
        });

        it('campos de combo (nome e peso) são visíveis', () => {
            cy.get('[data-testid="gt-combo-name"]').should('be.visible');
            cy.get('[data-testid="gt-combo-weight"]').should('be.visible');
        });

        it('adicionar combo via gt-combo-add exibe a combo na lista', () => {
            cy.get('[data-testid="gt-combo-name"]').clear().type('Duas Linhas');
            cy.get('[data-testid="gt-combo-weight"]').clear().type('3.00');

            // Selecionar padrão 1 na cláusula 0 (all_of)
            cy.get('[data-testid="gt-combo-clause-0"]').within(() => {
                cy.contains('button', 'ROW_1').click();
                cy.contains('button', 'ROW_2').click();
            });

            cy.get('[data-testid="gt-combo-add"]').click();

            // A combinação "Duas Linhas" deve aparecer na lista
            cy.contains('Duas Linhas').should('be.visible');
        });
    });

    describe('Sugestão de pesos (gt-suggest)', () => {
        beforeEach(() => {
            // Selecionar ao menos 1 padrão — gt-suggest requer rules.length >= 1
            cy.get('[data-testid="gt-rule-1"]').click();
            cy.get('[data-testid="gt-rule-99"]').click();
        });

        it('clicar em gt-suggest chama simulate-weights e calibrate-weights', () => {
            cy.get('[data-testid="gt-suggest"]').click();

            cy.wait('@simulateWeights');
            cy.wait('@calibrateWeights');
        });

        it('após gt-suggest, o campo de peso do padrão é atualizado', () => {
            cy.get('[data-testid="gt-suggest"]').click();
            cy.wait('@calibrateWeights');

            // Após calibração, o input de peso de ROW_1 deve ter valor preenchido
            cy.get('[data-testid="gt-rule-1"]').find('input[type="number"]').should('have.value').and('not.eq', '');
        });
    });

    describe('Salvar combos de gametype existente (gt-save-combos)', () => {
        it('entrar em modo edição de combos e salvar chama PUT /metadata', () => {
            // Botão "Editar Combos" de um gametype existente — não tem testid, usa texto
            // O componente usa: <button onClick={() => startEditCombinations(gt)}>
            // Sem data-testid, usamos o texto do botão (exceção justificada: único elemento no row)
            // RoomsAdmin.tsx linha aprox 1112: t('admin.gametypes_edit_combos_btn')
            // Como não temos o testid, clickamos no primeiro link de edição de combos
            cy.contains('button', /editar combos|edit combos|edit combo/i).first().click();

            // Agora estamos no modo de edição (editComboGtId !== null)
            // O botão gt-save-combos aparece
            cy.get('[data-testid="gt-save-combos"]').should('be.visible');

            cy.get('[data-testid="gt-save-combos"]').click();
            cy.wait('@upsertMetadata');
        });
    });
});

export {};
